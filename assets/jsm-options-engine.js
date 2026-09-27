    const MULTIPLIER = 100;
    // Futures-option contracts do NOT use the equity-option ×100 convention.
    // Keep the futures contract specification separate so pricing/cash/Greeks
    // never silently reuse stock-option assumptions.
    const FUTURES_CONTRACTS = {
      '/ES': { root: 'ES', multiplier: 50, strikeStep: 5, venue: 'CME' },
      '/MES': { root: 'MES', multiplier: 5, strikeStep: 5, venue: 'CME' },
      '/NQ': { root: 'NQ', multiplier: 20, strikeStep: 25, venue: 'CME' },
      '/MNQ': { root: 'MNQ', multiplier: 2, strikeStep: 25, venue: 'CME' },
      '/RTY': { root: 'RTY', multiplier: 50, strikeStep: 5, venue: 'CME' },
      '/M2K': { root: 'M2K', multiplier: 5, strikeStep: 5, venue: 'CME' },
      '/YM': { root: 'YM', multiplier: 5, strikeStep: 50, venue: 'CBOT' },
      '/MYM': { root: 'MYM', multiplier: 0.5, strikeStep: 50, venue: 'CBOT' },
      '/CL': { root: 'CL', multiplier: 1000, strikeStep: 0.5, venue: 'NYMEX' },
      '/MCL': { root: 'MCL', multiplier: 100, strikeStep: 0.5, venue: 'NYMEX' },
      '/NG': { root: 'NG', multiplier: 10000, strikeStep: 0.025, venue: 'NYMEX' },
      '/GC': { root: 'GC', multiplier: 100, strikeStep: 5, venue: 'COMEX' },
      '/MGC': { root: 'MGC', multiplier: 10, strikeStep: 5, venue: 'COMEX' },
      '/SI': { root: 'SI', multiplier: 5000, strikeStep: 0.25, venue: 'COMEX' },
      '/SIL': { root: 'SIL', multiplier: 1000, strikeStep: 0.25, venue: 'COMEX' },
      '/ZB': { root: 'ZB', multiplier: 1000, strikeStep: 1/32, venue: 'CBOT' },
      '/ZN': { root: 'ZN', multiplier: 1000, strikeStep: 1/32, venue: 'CBOT' },
      '/ZF': { root: 'ZF', multiplier: 1000, strikeStep: 1/32, venue: 'CBOT' },
      '/ZT': { root: 'ZT', multiplier: 2000, strikeStep: 1/32, venue: 'CBOT' },
      '/6E': { root: '6E', multiplier: 125000, strikeStep: 0.005, venue: 'CME' },
      '/6J': { root: '6J', multiplier: 12500000, strikeStep: 0.0000005, venue: 'CME' }
    };

    function normalizeTicker(ticker) {
      const raw = (ticker || '').toString().trim().toUpperCase();
      if (!raw) return '';
      if (FUTURES_CONTRACTS[raw]) return raw;
      const slash = raw.charAt(0) === '/' ? raw : '/' + raw;
      return FUTURES_CONTRACTS[slash] ? slash : raw;
    }
    function isFuturesTicker(ticker) {
      const t = normalizeTicker(ticker);
      return !!FUTURES_CONTRACTS[t];
    }
    function futuresSpec(ticker) {
      return FUTURES_CONTRACTS[normalizeTicker(ticker)] || null;
    }
    function futuresStrikeStep(ticker) {
      const spec = futuresSpec(ticker);
      return spec && spec.strikeStep ? spec.strikeStep : 0.25;
    }
    function roundToStep(value, step) {
      const n = Number(value);
      const s = Number(step) || 1;
      return Math.round(n / s) * s;
    }
    function legIsFuturesOption(leg) {
      return !!(leg && leg.type !== 'stock' && isFuturesTicker(leg.ticker || currentTicker()));
    }
    function legMultiplier(leg) {
      if (!leg || leg.type === 'stock') return 1;
      const spec = futuresSpec(leg.ticker || currentTicker());
      return spec ? spec.multiplier : MULTIPLIER;
    }
    let legs = [];
    let chart = null;
    // ---- Page sections: this engine powers both the builder page and the
    // analyzer/simulator page. Only the sections present in the DOM are updated.
    const HAS_PAYOFF = !!document.getElementById('payoffChart');
    const HAS_SIM = !!document.getElementById('simSvg');
    const HAS_GREEKS = !!document.getElementById('gDelta');
    const HAS_LEGS = !!document.getElementById('legsList');
    const HAS_CHAIN = !!document.getElementById('chainCard');
    function setText(id, v) {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    }
    // Anchors the payoff graph's x-axis (price range shown) so the fixed
    // "at expiry" solid line stays visually still as the simulator moves
    // the live price — only re-anchored on a template change, cleared
    // legs, or a manually-typed new stock price, not on every sim day.
    let chartRefSpot = null;

    // Reference price the ±1σ expected-move band is anchored to. The
    // Underlying slider is a what-if scenario tool: dragging it must NOT move
    // the band, because the band is the market-implied expected move FROM the
    // actual current price — a fixed reference frame the slider explores
    // against. The anchor updates only when the asserted current price
    // changes (chain data load, manual spot entry, loaded setup token), and
    // is captured once at boot otherwise.
    let emAnchorSpot = null;
    function emRefSpot() {
      if (!(emAnchorSpot > 0)) {
        const spotEl = document.getElementById('spot');
        const s = spotEl ? parseFloat(spotEl.value) || 0 : 0;
        if (s > 0) emAnchorSpot = s;
      }
      return emAnchorSpot > 0 ? emAnchorSpot : 0;
    }

    function isLightTheme() {
      return document.documentElement.getAttribute('data-theme') === 'light';
    }
    function chartThemeColors() {
      const light = isLightTheme();
      return {
        text: light ? '#475569' : '#94a3b8',
        grid: light ? 'rgba(100,116,139,0.18)' : 'rgba(45,58,79,0.55)'
      };
    }
    function refreshChartsForTheme() {
      const c = chartThemeColors();
      if (chart) {
        ['x', 'y'].forEach(function (axis) {
          const scale = chart.options.scales[axis];
          if (!scale) return;
          if (scale.title) scale.title.color = c.text;
          if (scale.ticks) scale.ticks.color = c.text;
          if (scale.grid) scale.grid.color = c.grid;
        });
        chart.update();
      }
      if (posChart) {
        ['x', 'y'].forEach(function (axis) {
          const scale = posChart.options.scales[axis];
          if (!scale) return;
          if (scale.title) scale.title.color = c.text;
          if (scale.ticks) scale.ticks.color = c.text;
          if (scale.grid) scale.grid.color = c.grid;
        });
        posChart.update();
      }
    }
    let animating = false;
    let crosshairS = 100;
    let crosshairPL = 0;
    // Item 4: effective per-position Y-axis denominators for the payoff chart
    // under % modes, refreshed by payoffDatasets() on every updateChart().
    // null-safe: 1 + 'usd' means the position fell back to dollars.
    let chartDenomA = 1, chartDenomB = 1;
    let chartModeA = 'usd', chartModeB = 'usd'; // 'usd' | 'pct'
    let maxDTE = 90;
    let nextId = 1;
    let compareMode = false;
    let legsB = [];
    let nextIdB = 10001;
    let chartZoom = null;
    let rangeZoomActive = false;
    let chartGesturesBound = false;
    // Strike-drag state: { legId, startStrike, orig: Map(legId -> strike), moved }
    // set on pointerdown when the pointer grabs a leg's strike marker.
    let strikeDrag = null;
    // Expiry breakeven prices, refreshed by recalc(); drawn by chartOverlaysPlugin.
    let currentBreakevens = [];
    let currentBreakevensB = [];


    function currentTicker() {
      const el = document.getElementById('ticker');
      return ((el && el.value) || 'SPY').trim().toUpperCase();
    }
    function syncStrategyTicker() {
      const tkr = currentTicker();
      [legs, legsB].forEach(function (list) {
        if (!list) return;
        list.forEach(function (leg) { if (!leg.tickerManual) leg.ticker = tkr; });
      });
    }
    // Symbols shown in the custom ticker dropdown. A native <datalist> is
    // unreliable across browsers (many won't show the full list until text is
    // typed, and it's unsupported on iOS Safari at all), so this builds a
    // small self-contained combobox instead: it opens on focus/click, always
    // shows the whole list when the field is empty, filters as you type, and
    // is fully clickable/keyboard-navigable.
    const TICKER_LIST = [
      { sym: 'SPY', label: 'S&P 500 ETF' },
      { sym: 'QQQ', label: 'Nasdaq 100 ETF' },
      { sym: 'IWM', label: 'Russell 2000 ETF' },
      { sym: 'DIA', label: 'Dow 30 ETF' },
      { sym: 'SPX', label: 'S&P 500 Index (_SPX)' },
      { sym: 'NDX', label: 'Nasdaq 100 Index (_NDX)' },
      { sym: 'RUT', label: 'Russell 2000 Index (_RUT)' },
      { sym: 'VIX', label: 'Volatility Index (_VIX)' },
      { sym: 'AAPL', label: 'Apple' },
      { sym: 'MSFT', label: 'Microsoft' },
      { sym: 'NVDA', label: 'Nvidia' },
      { sym: 'TSLA', label: 'Tesla' },
      { sym: 'META', label: 'Meta Platforms' },
      { sym: 'AMZN', label: 'Amazon' },
      { sym: 'GOOGL', label: 'Alphabet' },
      { sym: 'NFLX', label: 'Netflix' },
      { sym: 'AMD', label: 'AMD' },
      { sym: 'BA', label: 'Boeing' },
      { sym: 'JPM', label: 'JPMorgan' },
      { sym: 'XLF', label: 'Financials ETF' },
      { sym: 'TLT', label: '20Y Treasury ETF' },
      { sym: 'GLD', label: 'Gold ETF' },
      { sym: 'SLV', label: 'Silver ETF' },
      { sym: 'USO', label: 'Oil ETF' },
      { sym: 'XLK', label: 'Tech ETF' },
      { sym: 'XLE', label: 'Energy ETF' },
      { sym: '/ES', label: 'E-mini S&P 500 (futures)' },
      { sym: '/MES', label: 'Micro E-mini S&P 500 (futures)' },
      { sym: '/NQ', label: 'E-mini Nasdaq-100 (futures)' },
      { sym: '/MNQ', label: 'Micro E-mini Nasdaq-100 (futures)' },
      { sym: '/RTY', label: 'E-mini Russell 2000 (futures)' },
      { sym: '/M2K', label: 'Micro E-mini Russell 2000 (futures)' },
      { sym: '/YM', label: 'E-mini Dow (futures)' },
      { sym: '/MYM', label: 'Micro E-mini Dow (futures)' },
      { sym: '/CL', label: 'Crude Oil (futures)' },
      { sym: '/MCL', label: 'Micro Crude Oil (futures)' },
      { sym: '/NG', label: 'Natural Gas (futures)' },
      { sym: '/GC', label: 'Gold (futures)' },
      { sym: '/MGC', label: 'Micro Gold (futures)' },
      { sym: '/SI', label: 'Silver (futures)' },
      { sym: '/SIL', label: 'Micro Silver (futures)' },
      { sym: '/ZB', label: '30Y Treasury Bond (futures)' },
      { sym: '/ZN', label: '10Y Treasury Note (futures)' },
      { sym: '/ZF', label: '5Y Treasury Note (futures)' },
      { sym: '/ZT', label: '2Y Treasury Note (futures)' },
      { sym: '/6E', label: 'Euro FX (futures)' },
      { sym: '/6J', label: 'Japanese Yen FX (futures)' }
    ];
    const TICKER_SUGGESTIONS = TICKER_LIST.map(function (t) { return t.sym; });
    let tickerSuggestVisible = [];
    let tickerSuggestActiveIdx = -1;

    function tickerSuggestMatches(query) {
      const q = (query || '').trim().toUpperCase();
      if (!q) return TICKER_LIST;
      return TICKER_LIST.filter(function (t) {
        return t.sym.toUpperCase().indexOf(q) !== -1 || t.label.toUpperCase().indexOf(q) !== -1;
      });
    }
    function renderTickerSuggest() {
      const box = document.getElementById('tickerSuggest');
      const input = document.getElementById('ticker');
      if (!box || !input) return;
      tickerSuggestVisible = tickerSuggestMatches(input.value);
      tickerSuggestActiveIdx = -1;
      if (!tickerSuggestVisible.length) {
        box.innerHTML = '<div class="ts-empty">No preset match for "' + (input.value || '').toUpperCase() +
          '" — press Enter to try it if it has market data, or clear the field to browse the list.</div>';
        return;
      }
      box.innerHTML = tickerSuggestVisible.map(function (t, i) {
        return '<button type="button" class="ts-item" data-idx="' + i + '" role="option">' +
          '<span class="ts-sym">' + t.sym + '</span><span class="ts-label">' + t.label + '</span></button>';
      }).join('');
    }
    function openTickerSuggest() {
      renderTickerSuggest();
      const box = document.getElementById('tickerSuggest');
      const input = document.getElementById('ticker');
      if (box) box.classList.add('open');
      if (input) input.setAttribute('aria-expanded', 'true');
    }
    function closeTickerSuggest() {
      const box = document.getElementById('tickerSuggest');
      const input = document.getElementById('ticker');
      if (box) box.classList.remove('open');
      if (input) input.setAttribute('aria-expanded', 'false');
      tickerSuggestActiveIdx = -1;
    }
    function highlightTickerSuggest(idx) {
      const box = document.getElementById('tickerSuggest');
      if (!box) return;
      const items = box.querySelectorAll('.ts-item');
      items.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
      if (items[idx] && items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' });
    }
    function pickTickerSuggestion(idx) {
      const t = tickerSuggestVisible[idx];
      if (!t) return;
      const input = document.getElementById('ticker');
      if (input) input.value = t.sym;
      closeTickerSuggest();
      onTickerChange();
    }
    function onTickerKeydown(e) {
      const box = document.getElementById('tickerSuggest');
      const isOpen = box && box.classList.contains('open');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) { openTickerSuggest(); return; }
        if (!tickerSuggestVisible.length) return;
        tickerSuggestActiveIdx = (tickerSuggestActiveIdx + 1) % tickerSuggestVisible.length;
        highlightTickerSuggest(tickerSuggestActiveIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen || !tickerSuggestVisible.length) return;
        tickerSuggestActiveIdx = (tickerSuggestActiveIdx - 1 + tickerSuggestVisible.length) % tickerSuggestVisible.length;
        highlightTickerSuggest(tickerSuggestActiveIdx);
      } else if (e.key === 'Enter') {
        if (isOpen && tickerSuggestActiveIdx >= 0) {
          e.preventDefault();
          pickTickerSuggestion(tickerSuggestActiveIdx);
        } else {
          closeTickerSuggest();
          e.target.blur();
        }
      } else if (e.key === 'Escape') {
        closeTickerSuggest();
      }
    }
    // Selecting a suggestion uses mousedown (fires before the input's blur)
    // so the click reliably registers even though the input loses focus.
    document.addEventListener('mousedown', function (e) {
      const box = document.getElementById('tickerSuggest');
      if (!box) return;
      const btn = e.target.closest('.ts-item');
      if (btn && box.contains(btn)) {
        e.preventDefault();
        pickTickerSuggestion(parseInt(btn.getAttribute('data-idx'), 10));
      }
    });
    document.addEventListener('click', function (e) {
      const box = document.getElementById('tickerSuggest');
      const input = document.getElementById('ticker');
      if (!box || !box.classList.contains('open')) return;
      if (box.contains(e.target) || (input && input.contains(e.target))) return;
      closeTickerSuggest();
    });

    let _lastTickerLoaded = 'SPY';
    // Batch C fix: every loadCboeChain() call takes a request token; if the
    // ticker changes (or another load starts) while a request is in flight,
    // the stale response is dropped instead of overwriting the new ticker.
    let _chainReqId = 0;
    function onTickerTyping() {
      renderTickerSuggest();
      const box = document.getElementById('tickerSuggest');
      if (box) box.classList.add('open');
      const raw = document.getElementById('ticker').value;
      const norm = normalizeTicker(raw);
      if (!norm) return;
      // Fires as soon as the typed text is a whole, recognized ticker (either
      // a suggested symbol or a valid /FUTURES root) — covers both picking a
      // suggestion and manually typing a complete known symbol.
      if (TICKER_SUGGESTIONS.indexOf(norm) !== -1 || isFuturesTicker(norm)) {
        onTickerChange();
      }
    }
    function onTickerChange() {
      closeTickerSuggest();
      const tkr = normalizeTicker(currentTicker());
      if (!tkr || tkr === _lastTickerLoaded) return;
      _lastTickerLoaded = tkr;
      const futures = isFuturesTicker(tkr);
      // A strategy-level ticker change means inherited legs belong to the new
      // underlying. Clear chain pricing/strike anchoring so the old ticker's
      // strike can never survive into the new ticker. Manually overridden leg
      // symbols remain untouched.
      [legs, legsB].forEach(function(list) {
        if (!list) return;
        list.forEach(function(leg) {
          if (leg.tickerManual) return;
          leg.ticker = tkr;
          if (leg.type !== 'stock') {
            leg.strike = null;
            leg._tickerReanchorPending = true;
            leg.premiumFromChain = false;
            leg.premiumManual = false;
          } else {
            leg.premiumFromChain = false;
            leg.premiumManual = false;
          }
        });
      });
      window._cboeData = null;
      // Batch C fix: a ticker change invalidates discovery scans. Absolute
      // target prices belonged to the old underlying's scale, so reset them
      // (empty falls back to the new spot at scan time). Mark any rendered
      // results stale with a loading note; the chain-load completion re-runs
      // them, and manual-data mode clears them.
      var _ot = document.getElementById('optTarget');
      if (_ot) _ot.value = '';
      var _ft = document.getElementById('findTarget');
      if (_ft) _ft.value = '';
      discOptStale = optResults.length > 0;
      discFindStale = findResults.length > 0;
      if (discOptStale) {
        var _ob = document.getElementById('optResults');
        if (_ob) _ob.innerHTML = '<p class="disc-empty">Ticker changed — loading new chain…</p>';
      }
      if (discFindStale) {
        var _fb = document.getElementById('findResults');
        if (_fb) _fb.innerHTML = '<p class="disc-empty">Ticker changed — loading new chain…</p>';
      }
      const chainStatus = document.getElementById('chainStatus');
      if (chainStatus) {
        chainStatus.textContent = futures
          ? `${tkr} selected — futures-option mode (Black-76 / contract multiplier). Loading a CBOE equity chain is disabled.`
          : `${tkr} selected — loading listed-option chain…`;
        chainStatus.className = 'quote-status warn';
      }
      renderLegs();
      if (typeof renderLegsB === 'function' && typeof compareMode !== 'undefined' && compareMode) renderLegsB();
      if (typeof loadCboeChain === 'function') loadCboeChain();
    }
    function setQuoteStatus(msg, kind) {
      const el = document.getElementById('quoteStatus');
      if (!el) return;
      el.textContent = msg;
      el.className = 'quote-status' + (kind ? ' ' + kind : '');
    }
    function parseYahooChart(json) {
      const res = json && json.chart && json.chart.result && json.chart.result[0];
      if (!res || !res.meta) throw new Error('Empty quote');
      const meta = res.meta;
      const last = Number(meta.regularMarketPrice || meta.chartPreviousClose || meta.previousClose);
      if (!last || !isFinite(last)) throw new Error('No price');
      const ts = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date();
      return {
        symbol: meta.symbol || currentTicker(),
        last: last,
        prev: Number(meta.chartPreviousClose || meta.previousClose || last),
        currency: meta.currency || 'USD',
        exchange: meta.fullExchangeName || meta.exchangeName || '',
        when: ts,
        source: 'Yahoo Finance (delayed)'
      };
    }
    async function fetchDelayedQuote(sym) {
      const path = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
        encodeURIComponent(sym) + '?range=5d&interval=1d';
      const attempts = [
        path,
        'https://query2.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=5d&interval=1d',
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(path)
      ];
      let lastErr = null;
      for (let i = 0; i < attempts.length; i++) {
        try {
          const r = await fetch(attempts[i], { mode: 'cors' });
          if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
          return parseYahooChart(await r.json());
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('Quote failed');
    }
    async function loadDelayedQuote() {
      const sym = currentTicker();
      if (!sym) { setQuoteStatus('Enter a Symbol (e.g. SPY, AAPL).', 'err'); return; }
      setQuoteStatus(sym + ' loading…', 'warn');
      try {
        const q = await fetchDelayedQuote(sym);
        const spotEl = document.getElementById('spot');
        const oldS = parseFloat(spotEl.value) || q.last;
        const ratio = oldS > 0 ? q.last / oldS : 1;
        spotEl.value = (Math.round(q.last * 100) / 100).toFixed(2);
        function rescale(list) {
          if (!list) return;
          list.forEach(function (leg) {
            if (!leg.tickerManual) leg.ticker = q.symbol;
            if (leg.type !== 'stock' && Math.abs(ratio - 1) > 0.02) {
              leg.strike = Math.round(leg.strike * ratio * 2) / 2;
            }
            if (leg.type === 'stock') leg.premium = q.last;
          });
        }
        rescale(legs);
        rescale(legsB);
        refreshAllModeledPremiums({ forceStock: true });
        const hh = q.when.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
        const chg = q.last - q.prev;
        const chgTxt = (chg >= 0 ? '+' : '') + chg.toFixed(2);
        setQuoteStatus(q.symbol + '  $' + q.last.toFixed(2) + '  (' + chgTxt + ')  ·  ' + q.source + '  ·  ' + hh +
          (q.exchange ? '  ·  ' + q.exchange : '') + '  — No Bid/Ask chain; Premium stays modeled.', 'ok');
        renderLegs();
        if (typeof renderLegsB === 'function') renderLegsB();
        if (typeof resetSimulation === 'function') resetSimulation();
        recalc();
      } catch (e) {
        setQuoteStatus('Quote failed (' + (e && e.message ? e.message : e) + '). Enter Spot manually.', 'err');
      }
    }

    function normCDF(x) {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1 / (1 + p * x);
      const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1 + sign * y);
    }

    // Black-76 is used for options on futures. The underlying input is the
    // futures price, so the futures carry is not modeled as stock dividend yield.
    function black76(F, K, T, r, sigma, type) {
      if (T <= 0.0001) {
        return type === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0);
      }
      if (!F || !K || !sigma || sigma <= 0) return 0;
      const sqrtT = Math.sqrt(T);
      const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;
      const df = Math.exp(-r * T);
      if (type === 'call') return df * (F * normCDF(d1) - K * normCDF(d2));
      return df * (K * normCDF(-d2) - F * normCDF(-d1));
    }

    function black76Delta(F, K, T, r, sigma, type) {
      if (T <= 0.0001) {
        const itm = type === 'call' ? F > K : F < K;
        if (!itm) return 0;
        return type === 'call' ? 1 : -1;
      }
      if (!F || !K || !sigma || sigma <= 0) return 0;
      const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
      const df = Math.exp(-r * T);
      return type === 'call' ? df * normCDF(d1) : df * (normCDF(d1) - 1);
    }

    function blackScholes(S, K, T, r, q, sigma, type) {
      if (type === 'stock') return S;
      if (T <= 0.0001) {
        return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
      }
      const sqrtT = Math.sqrt(T);
      const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;
      if (type === 'call') {
        return S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
      }
      return K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);
    }

    // Standalone Black-Scholes delta for an arbitrary strike/type — used by the
    // option-chain table, independent of any leg object.
    function bsDelta(S, K, T, r, q, sigma, type) {
      if (type === 'stock') return 1;
      if (T <= 0.0001) {
        const itm = type === 'call' ? S > K : S < K;
        if (!itm) return 0;
        return type === 'call' ? 1 : -1;
      }
      const sqrtT = Math.sqrt(T);
      const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
      const eqT = Math.exp(-q * T);
      return type === 'call' ? eqT * normCDF(d1) : eqT * (normCDF(d1) - 1);
    }

    function roundPrem(v) {
      if (!isFinite(v) || v < 0) return 0;
      return Math.round(v * 100) / 100;
    }

    // A leg with no strike (e.g. its ticker has no market data and the user
    // hasn't typed one yet) is "incomplete": it should price as $0 rather than
    // silently borrow the spot price as a fake strike, so the payoff chart and
    // Greeks honestly reflect that the leg needs manual input.
    function legIsIncomplete(leg) {
      return !!(leg && leg.type !== 'stock' && (leg.strike == null || !isFinite(leg.strike)));
    }

    function modeledPremiumForLeg(leg, S) {
      if (!leg || leg.type === 'stock') return roundPrem(S);
      if (legIsIncomplete(leg)) return 0;
      const p = getParams();
      const days = Math.max(0, Number(leg.dte) || 0);
      const T = days / 365;
      const K = Math.max(0.01, Number(leg.strike) || S);
      if (legIsFuturesOption(leg)) {
        return roundPrem(black76(S, K, T, p.r, p.iv, leg.type));
      }
      return roundPrem(blackScholes(S, K, T, p.r, p.q, p.iv, leg.type));
    }

    // Auto-fill modeled premium unless the user typed a custom premium on that leg.
    function refreshModeledPremiums(list, opts) {
      const options = opts || {};
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const arr = list || legs;
      if (!arr || !arr.length) return false;
      let changed = false;
      for (let i = 0; i < arr.length; i++) {
        const leg = arr[i];
        if ((leg.premiumManual || leg.premiumFromChain) && !options.force) continue;
        const next = modeledPremiumForLeg(leg, S);
        if (leg.type === 'stock') {
          if (!leg.premiumManual || options.forceStock) {
            if (Math.abs((leg.premium || 0) - next) > 1e-9) {
              leg.premium = next;
              changed = true;
            }
          }
        } else if (Math.abs((leg.premium || 0) - next) > 1e-9) {
          leg.premium = next;
          changed = true;
        }
      }
      return changed;
    }

    function refreshAllModeledPremiums(opts) {
      const a = refreshModeledPremiums(legs, opts);
      const b = (typeof legsB !== 'undefined' && legsB && legsB.length)
        ? refreshModeledPremiums(legsB, opts) : false;
      return a || b;
    }

    // Finite-difference Greeks (position-level, already × MULTIPLIER via signedQty)
    // `list` lets us reuse the same math for per-leg Greeks; defaults to legs.
    function positionGreeksFor(list) {
      const arr = list || legs;
      const p = getParams();
      const S = p.S;
      const daysLeft = p.daysLeft;
      const iv = p.iv;
      const r = p.r;
      const q = p.q;
      const dS = Math.max(0.5, S * 0.005);
      const dVol = 0.01; // 1 vol point
      const dT = 1 / 365; // 1 day

      function val(Ss, days, vol, rate) {
        let total = 0;
        const optionDtes = [];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].type !== 'stock') optionDtes.push(arr[i].dte);
        }
        const minDte = optionDtes.length ? Math.min.apply(null, optionDtes) : 0;
        const elapsed = Math.max(0, minDte - days);
        for (let i = 0; i < arr.length; i++) {
          const leg = arr[i];
          let vps;
          if (leg.type === 'stock') {
            vps = Ss;
          } else if (legIsIncomplete(leg)) {
            vps = 0;
          } else {
            const residualDays = Math.max(0, leg.dte - elapsed);
            vps = legIsFuturesOption(leg)
              ? black76(Ss, leg.strike, residualDays / 365, rate, vol, leg.type)
              : blackScholes(Ss, leg.strike, residualDays / 365, rate, q, vol, leg.type);
          }
          total += signedQty(leg) * vps * legShareMult(leg);
        }
        return total;
      }

      // Time decay is measured against the nearest expiry. The "days remaining"
      // slider can sit above the shortest leg DTE (e.g. right after loading a
      // preset or clearing legs), in which case perturbing daysLeft by one day
      // changes nothing and theta wrongly reads $0. Clamp to the effective
      // horizon first. (Delta/gamma/vega need no clamp: with elapsed already 0
      // above the horizon, their valuations are identical either way.)
      const optionDtes = [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].type !== 'stock') optionDtes.push(arr[i].dte);
      }
      const minDte = optionDtes.length ? Math.min.apply(null, optionDtes) : 0;
      const effDays = Math.min(daysLeft, minDte);

      const v0 = val(S, daysLeft, iv, r);
      const vUp = val(S + dS, daysLeft, iv, r);
      const vDn = val(S - dS, daysLeft, iv, r);
      const vVol = val(S, daysLeft, iv + dVol, r);
      const vTime = effDays > 0 ? val(S, effDays - 1, iv, r) : v0;
      const dR = 0.01; // 1 rate point
      const vRate = val(S, daysLeft, iv, r + dR);

      const delta = (vUp - vDn) / (2 * dS);
      const gamma = (vUp - 2 * v0 + vDn) / (dS * dS);
      const theta = vTime - v0; // P/L change for 1 day passing
      const vega = vVol - v0;   // P/L change for +1% IV
      const rho = vRate - v0;   // P/L change for +1% rate

      return { delta: delta, gamma: gamma, theta: theta, vega: vega, rho: rho };
    }

    function positionGreeks() {
      return positionGreeksFor(legs);
    }

    // Expected 1-standard-deviation move over the nearest expiry:
    // S × IV × sqrt(T). Standard options-desk estimate.
    function expectedMove() {
      if (!legs.length) return null;
      const p = getParams();
      const optionDtes = [];
      for (let i = 0; i < legs.length; i++) {
        if (legs[i].type !== 'stock' && !legIsIncomplete(legs[i])) optionDtes.push(legs[i].dte);
      }
      // Centered on the reference price (emRefSpot), NOT the Underlying
      // scenario slider: the expected move is a forecast from the actual
      // current price, so the band stays a fixed reference while the slider
      // explores what-if prices.
      const S = emRefSpot();
      if (!optionDtes.length || !(p.iv > 0) || !(S > 0)) return null;
      const minDte = Math.min.apply(null, optionDtes);
      return S * p.iv * Math.sqrt(Math.max(minDte, 1) / 365);
    }

    // Probability the position is profitable at the nearest expiry, estimated
    // from a lognormal distribution of the underlying (drift r−q, vol = IV).
    // Finds the expiry-payoff breakevens, then integrates the profit regions.
    // Legs-agnostic core (used by probOfProfit and the Batch C discovery
    // tools); probOfProfit() keeps the original signature for the stats tiles.
    function popOf(legsArr) {
      if (!legsArr || !legsArr.length) return null;
      const p = getParams();
      const S = p.S, iv = p.iv, r = p.r, q = p.q;
      const optionDtes = [];
      for (let i = 0; i < legsArr.length; i++) {
        if (legsArr[i].type !== 'stock' && !legIsIncomplete(legsArr[i])) optionDtes.push(legsArr[i].dte);
      }
      if (!optionDtes.length || !(iv > 0) || !(S > 0)) return null;
      const minDte = Math.min.apply(null, optionDtes);
      const T = Math.max(minDte, 1) / 365;
      const sigma = Math.max(iv, 0.005);
      const cost = initialCost(legsArr);
      function payoffExp(x) {
        return positionValueAt(x, 0, true, legsArr) - cost;
      }
      // Scan for sign changes, then bisect each crossing for accuracy.
      const lo = Math.max(0.01, S * 0.05);
      const hi = Math.max(S * 4, S + 1);
      const N = 300;
      const bes = [];
      let px = lo, py = payoffExp(lo);
      for (let i = 1; i <= N; i++) {
        const x = lo + (hi - lo) * i / N;
        const y = payoffExp(x);
        if (py === 0) { bes.push(px); }
        else if (y === 0) { bes.push(x); }
        else if (py * y < 0) {
          let a = px, b = x, fa = py;
          for (let j = 0; j < 50; j++) {
            const m = (a + b) / 2, fm = payoffExp(m);
            if (fa * fm <= 0) { b = m; } else { a = m; fa = fm; }
          }
          bes.push((a + b) / 2);
        }
        px = x; py = y;
      }
      bes.sort(function(a, b) { return a - b; });
      const uniq = [];
      for (let i = 0; i < bes.length; i++) {
        if (!uniq.length || bes[i] - uniq[uniq.length - 1] > Math.max(0.05, S * 0.002)) uniq.push(bes[i]);
      }
      const mu = Math.log(S) + (r - q - 0.5 * sigma * sigma) * T;
      const sd = sigma * Math.sqrt(T);
      function cdf(x) {
        if (x <= 0) return 0;
        if (!isFinite(x)) return 1;
        return normCDF((Math.log(x) - mu) / sd);
      }
      let pop = 0;
      const bounds = [0].concat(uniq).concat([Infinity]);
      for (let i = 0; i < bounds.length - 1; i++) {
        const a = bounds[i], b = bounds[i + 1];
        let mid;
        if (a === 0) mid = Math.min(b, S) / 2;
        else if (b === Infinity) mid = Math.max(a * 1.5, S * 2);
        else mid = (a + b) / 2;
        if (!(mid > 0)) mid = 0.01;
        if (payoffExp(mid) > 0) pop += cdf(b) - cdf(a);
      }
      if (!isFinite(pop)) return null;
      return Math.max(0, Math.min(1, pop));
    }

    function probOfProfit() {
      if (!legs.length) return null;
      return popOf(legs);
    }

    // ===== Round 2, Item 5: probability of touch + price slices =====
    // One-touch estimate (labeled "est." in the UI):
    //   PoT(K) ≈ 2 · N(−| ln(S/K) − μT | / (σ√T)),  μ = r − q − σ²/2.
    // S is the anchored reference price (emRefSpot), NOT the Underlying
    // scenario slider — the same anchor the ±1σ band uses. These are
    // market-distribution statements, not P/L scenarios.
    // Edge cases: σ = 0 or T = 0 → the price is frozen, so the touch
    // probability is 100% if the level is already touched (K === S: the
    // path starts at S) else 0%.
    // Hand-verified fixture: S=100, K=110, T=1, σ=0.20, r=0.05, q=0
    // → μ=0.03, z=−0.626551, PoT = 0.531 (node one-off, 2026-09-27).
    function probTouchRaw(S, K, T, sig, r, q) {
      if (!(S > 0) || !(K > 0) || !(T >= 0)) return null;
      if (K === S) return 1;                 // the path starts at S: touched at t=0
      if (!(sig > 0) || !(T > 0)) return 0;  // frozen price never reaches K
      const mu = r - q - sig * sig / 2;
      const z = -Math.abs(Math.log(S / K) - mu * T) / (sig * Math.sqrt(T));
      return Math.max(0, Math.min(1, 2 * normCDF(z)));
    }

    // P(expire beyond K): P(S_T > K) when K >= S, P(S_T < K) when K < S,
    // under the same lognormal model. Zero-vol edge: deterministic forward.
    function probExpireBeyondRaw(S, K, T, sig, r, q) {
      if (!(S > 0) || !(K > 0) || !(T >= 0)) return null;
      if (!(sig > 0) || !(T > 0)) {
        const F = S * Math.exp((r - q) * T);
        return K >= S ? (F > K ? 1 : 0) : (F < K ? 1 : 0);
      }
      const mu = r - q - sig * sig / 2;
      const pAbove = normCDF((Math.log(S / K) + mu * T) / (sig * Math.sqrt(T)));
      return K >= S ? pAbove : 1 - pAbove;
    }

    function sliceHorizon() {
      // Same horizon convention as the ±1σ band / PoP: nearest option expiry.
      if (!legs.length) return null;
      const p = getParams();
      const S = (typeof emRefSpot === 'function') ? emRefSpot() : 0;
      if (!(S > 0) || !(p.iv > 0)) return null;
      const dtes = [];
      for (let i = 0; i < legs.length; i++) {
        if (legs[i].type !== 'stock' && !legIsIncomplete(legs[i])) dtes.push(legs[i].dte);
      }
      if (!dtes.length) return null;
      return { S: S, iv: p.iv, T: Math.max(Math.min.apply(null, dtes), 1) / 365, r: p.r, q: p.q };
    }
    function probTouch(K) {
      const h = sliceHorizon();
      return h ? probTouchRaw(h.S, K, h.T, h.iv, h.r, h.q) : null;
    }
    function probExpireBeyond(K) {
      const h = sliceHorizon();
      return h ? probExpireBeyondRaw(h.S, K, h.T, h.iv, h.r, h.q) : null;
    }

    // Price slices (builder): up to 4 target prices. Auto mode prefills
    // ±1σ around the reference price and refreshes on recalc; any manual
    // edit/add/remove switches to manual mode (↺ ±1σ restores auto).
    const MAX_SLICES = 4;
    let priceSlices = [];   // [{ price: number }]
    let slicesAuto = true;

    function roundSlice(x) { return Math.round(x * 100) / 100; }

    function refreshSlices() {
      const wrap = document.getElementById('priceSlicesWrap');
      if (!wrap) return;
      if (!legs.length) { priceSlices = []; renderSlices(); return; }
      if (slicesAuto) {
        const em = (typeof expectedMove === 'function') ? expectedMove() : null;
        const S = (typeof emRefSpot === 'function') ? emRefSpot() : 0;
        const want = (em && S > 0)
          ? [roundSlice(Math.max(0.01, S - em)), roundSlice(S + em)]
          : [];
        const cur = priceSlices.map(function(s) { return s.price; });
        const same = cur.length === want.length &&
          cur.every(function(v, i) { return Math.abs(v - want[i]) < 1e-9; });
        if (!same) { priceSlices = want.map(function(p) { return { price: p }; }); renderSlices(); }
        else updateSliceChips();
        return;
      }
      // Manual mode: chips only, so typing in a slice input never loses focus.
      updateSliceChips();
    }

    function renderSlices() {
      const host = document.getElementById('priceSlices');
      const wrap = document.getElementById('priceSlicesWrap');
      if (!host || !wrap) return;
      wrap.style.display = legs.length ? '' : 'none';
      host.innerHTML = '';
      priceSlices.forEach(function(s, i) {
        const row = document.createElement('div');
        row.className = 'slice-row';
        const inp = document.createElement('input');
        inp.type = 'number'; inp.className = 'slice-price'; inp.step = 'any';
        inp.value = s.price; inp.setAttribute('aria-label', 'Slice target price ' + (i + 1));
        inp.oninput = function() { onSliceInput(i, inp); };
        const pot = document.createElement('span');
        pot.className = 'slice-chip'; pot.id = 'slicePot' + i;
        pot.title = 'Estimated chance the underlying touches this price at least once before expiry. 2·N(−|ln(S/K)−μT|/(σ√T)), μ=r−q−σ²/2.';
        const bey = document.createElement('span');
        bey.className = 'slice-chip'; bey.id = 'sliceBey' + i;
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'slice-x'; x.textContent = '✕';
        x.title = 'Remove slice'; x.setAttribute('aria-label', 'Remove slice ' + (i + 1));
        x.onclick = function() { removeSlice(i); };
        row.appendChild(inp); row.appendChild(pot); row.appendChild(bey); row.appendChild(x);
        host.appendChild(row);
      });
      updateSliceAddBtn();
      updateSliceChips();
    }

    function updateSliceChips() {
      const S = (typeof emRefSpot === 'function') ? emRefSpot() : 0;
      priceSlices.forEach(function(s, i) {
        const potEl = document.getElementById('slicePot' + i);
        const beyEl = document.getElementById('sliceBey' + i);
        if (!potEl || !beyEl) return;
        const pt = probTouch(s.price), be = probExpireBeyond(s.price);
        if (pt == null) { potEl.textContent = 'PoT —'; potEl.classList.add('dim'); }
        else { potEl.textContent = 'PoT ' + (pt * 100).toFixed(0) + '%'; potEl.classList.remove('dim'); }
        const dir = s.price >= S ? 'above' : 'below';
        if (be == null) { beyEl.textContent = 'P(' + dir + ') —'; beyEl.classList.add('dim'); }
        else {
          beyEl.textContent = 'P(' + dir + ') ' + (be * 100).toFixed(0) + '%';
          beyEl.classList.remove('dim');
          beyEl.title = 'Estimated chance the underlying expires ' + dir + ' $' + s.price + ' (lognormal, current IV).';
        }
      });
      renderSliceBell();
    }

    function updateSliceAddBtn() {
      const b = document.getElementById('sliceAddBtn');
      if (b) b.disabled = priceSlices.length >= MAX_SLICES;
    }
    function addSlice() {
      if (priceSlices.length >= MAX_SLICES) return;
      const S = (typeof emRefSpot === 'function') ? emRefSpot() : 0;
      priceSlices.push({ price: roundSlice(S > 0 ? S : 100) });
      slicesAuto = false;
      renderSlices();
    }
    function removeSlice(i) {
      priceSlices.splice(i, 1);
      slicesAuto = false;
      renderSlices();
    }
    function onSliceInput(i, el) {
      const v = parseFloat(el.value);
      if (isFinite(v) && v > 0) { priceSlices[i].price = v; slicesAuto = false; }
      updateSliceChips();
    }
    function resetSlices() { slicesAuto = true; refreshSlices(); }
    function sliceMarkerPrices() {
      return priceSlices.map(function(s) { return s.price; })
        .filter(function(p) { return isFinite(p) && p > 0; });
    }

    // Price-slice distribution visual: a small bell curve (the classic σ-band
    // diagram) in the site's blue palette, with each slice target marked as
    // a dashed teal line at its σ-distance from the reference price.
    // Marker z uses the same 1σ convention as expectedMove():
    // z = (K − S_ref) / (S_ref · σ√T), so the auto ±1σ slices sit at ±1.
    function renderSliceBell() {
      const svg = document.getElementById('sliceBell');
      if (!svg) return;
      const h = (typeof sliceHorizon === 'function') ? sliceHorizon() : null;
      const marks = (typeof sliceMarkerPrices === 'function') ? sliceMarkerPrices() : [];
      if (!legs.length || !h || !(h.iv > 0) || !(h.T > 0)) { svg.style.display = 'none'; svg.innerHTML = ''; return; }
      svg.style.display = '';
      const S = h.S, sd = S * h.iv * Math.sqrt(h.T);
      const W = 420, base = 88, peak = 62, ZMAX = 3.6;
      const X = function(z) { return W / 2 + z * ((W / 2 - 14) / ZMAX); };
      const Y = function(z) { return base - peak * Math.exp(-z * z / 2); };
      const f1 = function(n) { return (Math.round(n * 10) / 10).toFixed(1); };
      function bandPath(a, b) {
        const n = 24;
        let d = '';
        for (let i = 0; i <= n; i++) {
          const z = a + (b - a) * i / n;
          d += (i ? 'L' : 'M') + f1(X(z)) + ' ' + f1(Y(z)) + ' ';
        }
        d += 'L' + f1(X(b)) + ' ' + base + ' L' + f1(X(a)) + ' ' + base + ' Z';
        return d;
      }
      // σ bands, darkest at the center — same palette as the reference diagram.
      const bands = [
        { a: 0, b: 1, c: '#1e40af', pct: '34.1%', dark: true },
        { a: 1, b: 2, c: '#3b82f6', pct: '13.6%', dark: true },
        { a: 2, b: 3, c: '#93c5fd', pct: '2.1%', dark: false },
        { a: 3, b: 3.6, c: '#dbeafe', pct: '0.1%', dark: false }
      ];
      let s = '';
      bands.forEach(function(bd) {
        s += '<path d="' + bandPath(-bd.b, -bd.a) + '" fill="' + bd.c + '"/>';
        s += '<path d="' + bandPath(bd.a, bd.b) + '" fill="' + bd.c + '"/>';
      });
      bands.forEach(function(bd) {
        const zc = (bd.a + bd.b) / 2;
        const y = f1((Y(zc) + base) / 2 + 3);
        const fill = bd.dark ? '#ffffff' : '#1e3a8a';
        s += '<text x="' + f1(X(-zc)) + '" y="' + y + '" text-anchor="middle" font-size="8.5" fill="' + fill + '">' + bd.pct + '</text>';
        s += '<text x="' + f1(X(zc)) + '" y="' + y + '" text-anchor="middle" font-size="8.5" fill="' + fill + '">' + bd.pct + '</text>';
      });
      s += '<line x1="' + f1(X(-ZMAX)) + '" y1="' + base + '" x2="' + f1(X(ZMAX)) + '" y2="' + base + '" stroke="var(--border)" stroke-width="1"/>';
      const refLbl = '$' + (S >= 100 ? S.toFixed(0) : S.toFixed(2));
      const ticks = [[-3, '−3σ'], [-2, '−2σ'], [-1, '−1σ'], [0, 'μ ' + refLbl], [1, '1σ'], [2, '2σ'], [3, '3σ']];
      ticks.forEach(function(t) {
        s += '<text x="' + f1(X(t[0])) + '" y="' + (base + 13) + '" text-anchor="middle" font-size="8.5" fill="var(--muted)">' + t[1] + '</text>';
      });
      marks.forEach(function(mk, mi) {
        if (!isFinite(mk) || mk <= 0) return;
        const z = Math.max(-3.55, Math.min(3.55, (mk - S) / sd));
        const x = X(z);
        const pt = (typeof probTouch === 'function') ? probTouch(mk) : null;
        s += '<line class="mk-line" x1="' + f1(x) + '" y1="38" x2="' + f1(x) + '" y2="' + base + '" stroke-width="1.25" stroke-dasharray="4 3"/>';
        const lbl = '$' + (mk >= 100 ? mk.toFixed(0) : mk.toFixed(2)) + (pt != null ? ' · ' + (pt * 100).toFixed(0) + '%' : '');
        const anchorEnd = x > W - 86;
        s += '<text class="mk-label" x="' + f1(anchorEnd ? x - 4 : x + 4) + '" y="' + (12 + (mi % 3) * 10) + '" text-anchor="' + (anchorEnd ? 'end' : 'start') + '" font-size="8.5">' + lbl + '</text>';
      });
      svg.innerHTML = s;
    }

    function defaultLongCall() {
      const S = parseFloat(document.getElementById('spot').value) || 100;
      // Anchor the default leg to the currently selected chain expiration so
      // "Clear all" never leaves a phantom 90-DTE leg while the chain shows
      // a different expiry. Falls back to 90 when no chain is loaded yet.
      let dte = 90;
      try {
        const chainDte = expirationDte(selectedExpiration());
        if (chainDte > 0) dte = chainDte;
      } catch (e) { /* chain not ready */ }
      const leg = {
        id: nextId++,
        side: 'buy',
        type: 'call',
        strike: Math.round(S),
        dte: dte,
        qty: 1,
        premium: 5.00,
        premiumManual: false
      };
      leg.premium = modeledPremiumForLeg(leg, S);
      try {
        if (typeof tryFillLegFromChain === 'function') {
          tryFillLegFromChain(leg, { setDte: true, snapStrikes: true });
        }
      } catch (e) { /* chain not ready — keep modeled values */ }
      return [leg];
    }

    function makeTemplateLegs(key) {
      if (!key) return null;
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const K = Math.round(S);
      const iv = parseFloat(document.getElementById('iv').value) || 25;
      const p = Math.max(0.5, +(S * 0.04 * (iv / 25)).toFixed(2));
      const unit = Math.max(0.25, +(S / 100).toFixed(4));

      // Strike offsets below were originally hardcoded in flat dollars (K+10,
      // K±15, K±20 …), sized for a ~$100 stock. That made every spread look
      // unrealistically narrow (or wide) once the underlying moved away from
      // $100 — e.g. a $10-wide iron condor on a $771 stock is only ~1.3% OTM
      // per side instead of a sane ~10%. `off` scales the same relative
      // widths (0.5x / 1x / 1.5x / 2x) to the actual spot, then `strikeAt`
      // snaps the result to a sensible strike increment for that price level.
      const stepSize = S >= 300 ? 5 : S >= 50 ? 1 : 0.5;
      const off = Math.max(0.5, +(unit * 10).toFixed(4));
      function strikeAt(mult) {
        if (!mult) return K;
        const raw = K + mult * off;
        const snapped = Math.round(raw / stepSize) * stepSize;
        return Math.max(stepSize, +snapped.toFixed(2));
      }

      const templates = {
        long_call: [
          { side: 'buy', type: 'call', strike: K, dte: 90, qty: 1, premium: p }
        ],
        covered_call: [
          { side: 'buy', type: 'stock', strike: 0, dte: 0, qty: 100, premium: +S.toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 45, qty: 1, premium: +(p * 0.55).toFixed(2) }
        ],
        cash_secured_put: [
          { side: 'sell', type: 'put', strike: K, dte: 90, qty: 1, premium: +(p * 0.9).toFixed(2) }
        ],
        bull_call_spread: [
          { side: 'buy', type: 'call', strike: K, dte: 90, qty: 1, premium: +(p * 1.2).toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) }
        ],
        long_straddle: [
          { side: 'buy', type: 'call', strike: K, dte: 90, qty: 1, premium: p },
          { side: 'buy', type: 'put', strike: K, dte: 90, qty: 1, premium: p }
        ],
        long_strangle: [
          { side: 'buy', type: 'call', strike: strikeAt(1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) },
          { side: 'buy', type: 'put', strike: strikeAt(-1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) }
        ],
        long_call_butterfly: [
          { side: 'buy', type: 'call', strike: strikeAt(-1), dte: 90, qty: 1, premium: +(8.6 * unit).toFixed(2) },
          { side: 'sell', type: 'call', strike: K, dte: 90, qty: 2, premium: +(4.2 * unit).toFixed(2) },
          { side: 'buy', type: 'call', strike: strikeAt(1), dte: 90, qty: 1, premium: +(1.9 * unit).toFixed(2) }
        ],
        call_condor: [
          { side: 'buy', type: 'call', strike: strikeAt(-1.5), dte: 90, qty: 1, premium: +(9.4 * unit).toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(-0.5), dte: 90, qty: 1, premium: +(5.6 * unit).toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(0.5), dte: 90, qty: 1, premium: +(3.1 * unit).toFixed(2) },
          { side: 'buy', type: 'call', strike: strikeAt(1.5), dte: 90, qty: 1, premium: +(1.5 * unit).toFixed(2) }
        ],
        long_put: [
          { side: 'buy', type: 'put', strike: K, dte: 90, qty: 1, premium: p }
        ],
        bear_put_spread: [
          { side: 'buy', type: 'put', strike: K, dte: 90, qty: 1, premium: +(p * 1.2).toFixed(2) },
          { side: 'sell', type: 'put', strike: strikeAt(-1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) }
        ],
        long_straddle_bear: [
          { side: 'buy', type: 'call', strike: K, dte: 90, qty: 1, premium: p },
          { side: 'buy', type: 'put', strike: K, dte: 90, qty: 1, premium: p }
        ],
        long_strangle_bear: [
          { side: 'buy', type: 'call', strike: strikeAt(1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) },
          { side: 'buy', type: 'put', strike: strikeAt(-1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) }
        ],
        long_put_butterfly: [
          { side: 'buy', type: 'put', strike: strikeAt(-1), dte: 90, qty: 1, premium: +(1.9 * unit).toFixed(2) },
          { side: 'sell', type: 'put', strike: K, dte: 90, qty: 2, premium: +(4.2 * unit).toFixed(2) },
          { side: 'buy', type: 'put', strike: strikeAt(1), dte: 90, qty: 1, premium: +(8.6 * unit).toFixed(2) }
        ],
        put_condor: [
          { side: 'buy', type: 'put', strike: strikeAt(1.5), dte: 90, qty: 1, premium: +(9.4 * unit).toFixed(2) },
          { side: 'sell', type: 'put', strike: strikeAt(0.5), dte: 90, qty: 1, premium: +(5.6 * unit).toFixed(2) },
          { side: 'sell', type: 'put', strike: strikeAt(-0.5), dte: 90, qty: 1, premium: +(3.1 * unit).toFixed(2) },
          { side: 'buy', type: 'put', strike: strikeAt(-1.5), dte: 90, qty: 1, premium: +(1.5 * unit).toFixed(2) }
        ],
        short_straddle: [
          { side: 'sell', type: 'call', strike: K, dte: 45, qty: 1, premium: p },
          { side: 'sell', type: 'put', strike: K, dte: 45, qty: 1, premium: p }
        ],
        short_strangle: [
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 45, qty: 1, premium: +(p * 0.55).toFixed(2) },
          { side: 'sell', type: 'put', strike: strikeAt(-1), dte: 45, qty: 1, premium: +(p * 0.55).toFixed(2) }
        ],
        iron_condor: [
          { side: 'sell', type: 'put', strike: strikeAt(-1), dte: 45, qty: 1, premium: +(p * 0.7).toFixed(2) },
          { side: 'buy', type: 'put', strike: strikeAt(-2), dte: 45, qty: 1, premium: +(p * 0.3).toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 45, qty: 1, premium: +(p * 0.7).toFixed(2) },
          { side: 'buy', type: 'call', strike: strikeAt(2), dte: 45, qty: 1, premium: +(p * 0.3).toFixed(2) }
        ],
        iron_butterfly: [
          { side: 'sell', type: 'put', strike: K, dte: 45, qty: 1, premium: p },
          { side: 'buy', type: 'put', strike: strikeAt(-1), dte: 45, qty: 1, premium: +(p * 0.4).toFixed(2) },
          { side: 'sell', type: 'call', strike: K, dte: 45, qty: 1, premium: p },
          { side: 'buy', type: 'call', strike: strikeAt(1), dte: 45, qty: 1, premium: +(p * 0.4).toFixed(2) }
        ],
        calendar_call: [
          { side: 'sell', type: 'call', strike: K, dte: 30, qty: 1, premium: +(p * 0.55).toFixed(2) },
          { side: 'buy', type: 'call', strike: K, dte: 90, qty: 1, premium: p }
        ],
        // Short OTM put + short call spread. Structured so net credit often
        // exceeds the call-spread width → theoretically no upside risk.
        jade_lizard: [
          { side: 'sell', type: 'put', strike: strikeAt(-1), dte: 45, qty: 1, premium: +(p * 0.75).toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 45, qty: 1, premium: +(p * 0.55).toFixed(2) },
          { side: 'buy', type: 'call', strike: strikeAt(2), dte: 45, qty: 1, premium: +(p * 0.22).toFixed(2) }
        ],
        // Long deep-ITM LEAP call + short near-term OTM call (covered call
        // without owning the shares).
        pmcc: [
          { side: 'buy', type: 'call', strike: Math.max(stepSize, strikeAt(-1.5)), dte: 180, qty: 1, premium: +(Math.max(p * 2.2, 15 + p * 0.7)).toFixed(2) },
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 30, qty: 1, premium: +(p * 0.5).toFixed(2) }
        ],
        // Front-ratio call: long 1 ATM, short 2 OTM. Credit or small debit;
        // unlimited upside risk on the extra short call.
        call_ratio_spread: [
          { side: 'buy', type: 'call', strike: K, dte: 45, qty: 1, premium: p },
          { side: 'sell', type: 'call', strike: strikeAt(1), dte: 45, qty: 2, premium: +(p * 0.55).toFixed(2) }
        ],
        put_ratio_spread: [
          { side: 'buy', type: 'put', strike: K, dte: 45, qty: 1, premium: p },
          { side: 'sell', type: 'put', strike: strikeAt(-1), dte: 45, qty: 2, premium: +(p * 0.55).toFixed(2) }
        ],
        // Long call + short put, same strike/expiry ≈ long 100 shares.
        synthetic_long: [
          { side: 'buy', type: 'call', strike: K, dte: 90, qty: 1, premium: p },
          { side: 'sell', type: 'put', strike: K, dte: 90, qty: 1, premium: +(p * 0.95).toFixed(2) }
        ],
        // Short call + long put, same strike/expiry ≈ short 100 shares.
        synthetic_short: [
          { side: 'sell', type: 'call', strike: K, dte: 90, qty: 1, premium: p },
          { side: 'buy', type: 'put', strike: K, dte: 90, qty: 1, premium: +(p * 0.95).toFixed(2) }
        ],
        // OTM call long + OTM put short: directional synthetic with less
        // premium outlay than an ATM synthetic.
        risk_reversal: [
          { side: 'buy', type: 'call', strike: strikeAt(1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) },
          { side: 'sell', type: 'put', strike: strikeAt(-1), dte: 90, qty: 1, premium: +(p * 0.6).toFixed(2) }
        ]
      };

      const raw = templates[key];
      if (!raw) return null;
      return raw.map(function (leg) { return Object.assign({}, leg); });
    }

    function applyTemplate() {
      const key = document.getElementById('strategyTemplate').value;
      const t = makeTemplateLegs(key);
      if (!t) return;
      legs = t.map(leg => ({ ...leg, id: nextId++, premiumManual: false }));
      markBuildDirty();
      if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }
      syncDTESlider();
      updateSpotSliderRange();
      refreshModeledPremiums(legs);
      if (typeof applyChainQuotesToLegs === 'function') applyChainQuotesToLegs(legs, { snapStrikes: true, setDte: true });
      renderLegs();
      recalc();
      document.getElementById('strategyTemplate').value = key;
      setTemplateTip(key);
      resetSimulation();
    }

    // Lesson bridges for deep-linked templates
    const TEMPLATE_LESSONS = {
      long_call: { title: 'Long Call', href: '/level2/', label: 'Fundamentals' },
      long_put: { title: 'Long Put', href: '/level2/', label: 'Fundamentals' },
      covered_call: { title: 'Covered Call', href: '/covered-call/', label: 'Covered Call guide' },
      cash_secured_put: { title: 'Cash-Secured Put', href: '/cash-secured-put/', label: 'CSP guide' },
      bull_call_spread: { title: 'Bull Call Spread', href: '/level3/', label: 'Spreads' },
      bear_put_spread: { title: 'Bear Put Spread', href: '/level3/', label: 'Spreads' },
      iron_condor: { title: 'Iron Condor', href: '/iron-condor/', label: 'Iron Condor guide' },
      iron_butterfly: { title: 'Iron Butterfly', href: '/strategies/', label: 'Strategies' },
      long_straddle: { title: 'Long Straddle', href: '/strategies/', label: 'Strategies' },
      short_straddle: { title: 'Short Straddle', href: '/strategies/', label: 'Strategies' },
      long_strangle: { title: 'Long Strangle', href: '/strategies/', label: 'Strategies' },
      short_strangle: { title: 'Short Strangle', href: '/strategies/', label: 'Strategies' },
      calendar_call: { title: 'Calendar Spread (Call)', href: '/level4/', label: 'Advanced' },
      long_call_butterfly: { title: 'Call Butterfly', href: '/strategies/', label: 'Strategies' },
      call_condor: { title: 'Call Condor', href: '/strategies/', label: 'Strategies' },
      long_put_butterfly: { title: 'Put Butterfly', href: '/strategies/', label: 'Strategies' },
      put_condor: { title: 'Put Condor', href: '/strategies/', label: 'Strategies' },
      jade_lizard: { title: 'Jade Lizard', href: '/strategies/', label: 'Strategies' },
      pmcc: { title: "Poor Man's Covered Call", href: '/level4/', label: 'Advanced' },
      call_ratio_spread: { title: 'Call Ratio Spread (1×2)', href: '/level4/', label: 'Advanced' },
      put_ratio_spread: { title: 'Put Ratio Spread (1×2)', href: '/level4/', label: 'Advanced' },
      synthetic_long: { title: 'Synthetic Long', href: '/level4/', label: 'Advanced' },
      synthetic_short: { title: 'Synthetic Short', href: '/level4/', label: 'Advanced' },
      risk_reversal: { title: 'Risk Reversal', href: '/level4/', label: 'Advanced' }
    };

    function setTemplateTip(key) {
      const tip = document.getElementById('eduTip');
      if (!tip) return;
      const meta = TEMPLATE_LESSONS[key];
      if (meta) {
        const article = /^[aeiou]/i.test(meta.title) ? 'an' : 'a';
        tip.innerHTML = 'You are viewing ' + article + ' <strong>' + meta.title + '</strong> — <a href="' + meta.href + '">' + meta.label + '</a> lesson, or edit the legs below.';
      } else {
        tip.innerHTML = 'Template loaded. Edit any field — chart and Greeks update live.';
      }
    }

    // Full per-strategy guides for the 📖 Guide drawer.
    // Aliases (bearish duplicates of the same structure) share one guide.
    const GUIDE_ALIASES = {
      long_straddle_bear: 'long_straddle',
      long_strangle_bear: 'long_strangle'
    };
    const STRATEGY_GUIDES = {
      long_call: {
        outlook: 'Bullish',
        thesis: 'You pay a premium for the right to buy the stock at the strike price. You profit if the stock rallies enough to cover what you paid.',
        ideal: 'A strong upward move is expected — a breakout, product launch, or momentum run — and you want defined, limited risk.',
        maxProfit: 'Unlimited: the higher the stock climbs, the more the call is worth.',
        maxLoss: 'The premium you paid, if the stock finishes below the strike.',
        breakeven: 'Strike price + premium paid per share.',
        greeks: 'Long delta (gains as the stock rises), long gamma, negative theta (loses a little value every day), long vega (benefits if implied volatility rises).',
        manage: 'Take profits into strength. Time decay accelerates in the final 30 days, so avoid holding short-dated calls into expiry week unless the move is already happening.',
        risks: 'Time decay and IV crush: if the stock goes nowhere, the option melts. Never pay more premium than you can afford to lose outright.'
      },
      long_put: {
        outlook: 'Bearish',
        thesis: 'You pay a premium for the right to sell the stock at the strike price. You profit if the stock falls enough to cover what you paid.',
        ideal: 'A sharp drop is expected, or as portfolio insurance — a protective put under shares you already own.',
        maxProfit: 'Large but capped: nearly the strike price if the stock went to zero, minus the premium.',
        maxLoss: 'The premium you paid, if the stock finishes above the strike.',
        breakeven: 'Strike price − premium paid per share.',
        greeks: 'Short delta (gains as the stock falls), long gamma, negative theta, long vega — selloffs often come with a volatility spike that helps.',
        manage: 'Puts can gain value fast in a selloff. Take profits on spikes rather than holding out for zero.',
        risks: 'Time decay: a slow grind down may not outpace daily theta. IV crush after the feared event passes can erase gains.'
      },
      covered_call: {
        outlook: 'Neutral to mildly bullish',
        thesis: 'You own 100 shares and sell someone else the right to buy them from you at the strike. You keep the premium as income on stock you would hold anyway.',
        ideal: 'You like the stock long term but expect it to trade flat or drift up modestly — you want yield, not a home run.',
        maxProfit: 'Capped at (strike − stock price) + premium received.',
        maxLoss: 'Substantial: the stock can fall to zero; the premium only slightly offsets. Same downside as owning the stock outright.',
        breakeven: 'Stock purchase price − premium received.',
        greeks: 'Still net long the stock, but the short call trims delta and adds positive theta — time decay now works for you. You want implied volatility to fall.',
        manage: 'If the stock surges past the strike, roll the call up and out to keep some upside. If assigned, you simply sell your shares at the strike.',
        risks: 'Capped upside — you will miss rallies above the strike. You keep the full downside risk of stock ownership.'
      },
      cash_secured_put: {
        outlook: 'Bullish to neutral',
        thesis: 'You sell a put and keep the premium. If assigned, you buy the stock at the strike — the premium effectively discounts your entry price.',
        ideal: 'You want to own a stock you like at a lower price, or you expect it to stay flat/up and want income while you wait.',
        maxProfit: 'The premium received, if the stock stays above the strike.',
        maxLoss: 'Strike × 100 − premium received (stock to zero). Size it like a stock purchase.',
        breakeven: 'Strike − premium received.',
        greeks: 'Long delta (behaves like owning stock on dips), short gamma, positive theta, short vega — a volatility spike hurts the short put.',
        manage: 'If the stock drops toward the strike, roll the put down and out to avoid assignment — or accept the shares at your target price.',
        risks: 'You can be forced to buy a falling stock. This is not free income: only sell puts on stocks you are happy to own.'
      },
      bull_call_spread: {
        outlook: 'Moderately bullish',
        thesis: 'A cheaper way to bet on a rally: the long call gains as the stock rises, while the higher short call you sold cuts both the cost and the maximum profit.',
        ideal: 'A moderate rise to a price target is expected; you want defined risk and a lower premium than an outright call.',
        maxProfit: 'Width between the strikes − net debit paid.',
        maxLoss: 'The net debit paid.',
        breakeven: 'Long (lower) strike + net debit.',
        greeks: 'Long delta with reduced gamma, vega, and theta versus an outright call — the short leg offsets much of the time decay and volatility exposure.',
        manage: 'Take profit as the spread approaches max value near expiry. Do not let a winner turn: pin risk is real if the stock sits near the short strike at expiry.',
        risks: 'Capped upside, and both legs can expire worthless if the stock does not rise. Wide bid/ask on the short leg can hurt fills.'
      },
      bear_put_spread: {
        outlook: 'Moderately bearish',
        thesis: 'A cheaper way to bet on a decline: the long put gains as the stock falls, while the lower short put you sold cuts both the cost and the maximum profit.',
        ideal: 'A moderate drop to a downside target is expected; you want defined risk for less than an outright put.',
        maxProfit: 'Width between the strikes − net debit paid.',
        maxLoss: 'The net debit paid.',
        breakeven: 'Long (higher) strike − net debit.',
        greeks: 'Short delta with reduced gamma, vega, and theta versus an outright put — the short leg offsets much of the time decay.',
        manage: 'Take profit as the spread approaches max value. Close before expiry to avoid pin risk near the short strike.',
        risks: 'Capped downside profit, and both legs expire worthless if the stock does not fall.'
      },
      long_straddle: {
        outlook: 'Volatile — direction unknown',
        thesis: 'You buy a call and a put at the same strike. You do not care which way the stock moves — you just need a BIG move.',
        ideal: 'Earnings, FDA decisions, or breakouts where a large move is likely but the direction is a coin flip.',
        maxProfit: 'Unlimited to the upside; large to the downside (stock to zero) — minus the two premiums.',
        maxLoss: 'Both premiums, if the stock pins the strike at expiry.',
        breakeven: 'Two breakevens: strike ± total premium paid.',
        greeks: 'Near delta-neutral at the strike, very long gamma and vega, very negative theta — time is the enemy.',
        manage: 'Often best traded into the event and out right after: IV crush after the news can erase gains even if the stock moves.',
        risks: 'You pay two premiums and bleed theta every day. The move must beat what the market already priced in.'
      },
      short_straddle: {
        outlook: 'Neutral — low volatility',
        thesis: 'You sell a call and a put at the same strike and collect two premiums, betting the stock stays near the strike. Time decay is your profit engine.',
        ideal: 'A low-volatility grind, post-earnings calm, or a stock pinned by an absence of news.',
        maxProfit: 'The total premium received, if the stock pins the strike.',
        maxLoss: 'Unlimited to the upside; large to the downside.',
        breakeven: 'Two breakevens: strike ± total premium received.',
        greeks: 'Near delta-neutral, short gamma (delta runs away from you fast), positive theta, short vega — a volatility spike hurts.',
        manage: 'Take profits at 25–50% of maximum. Defend or close if the stock starts trending — short gamma means losses accelerate.',
        risks: 'Undefined risk. A gap through a breakeven can lose multiples of the premium collected. Never hold through binary events.'
      },
      long_strangle: {
        outlook: 'Volatile — direction unknown',
        thesis: 'Like a straddle but with out-of-the-money strikes: cheaper to enter, but the stock must move further to profit.',
        ideal: 'Same event-driven setups as a straddle, when you want to pay less premium and accept needing a larger move.',
        maxProfit: 'Unlimited up; large down — minus the two premiums.',
        maxLoss: 'Both premiums, if the stock finishes between the strikes.',
        breakeven: 'Call strike + total premium; put strike − total premium.',
        greeks: 'Near delta-neutral between the strikes, long gamma and vega, negative theta — cheaper than a straddle but hungrier for movement.',
        manage: 'Exit after the event: post-news IV crush hits long premium hard. Consider selling into the initial spike.',
        risks: 'Needs an even bigger move than a straddle to overcome two premiums. Slow melts and pins are the worst outcome.'
      },
      short_strangle: {
        outlook: 'Neutral — low volatility',
        thesis: 'You sell an out-of-the-money call and put, collecting premium for a bet the stock stays between the strikes. A wider profit range than a short straddle.',
        ideal: 'Range-bound, low-volatility stocks where you want more room for error than an at-the-money straddle allows.',
        maxProfit: 'The total premium received.',
        maxLoss: 'Unlimited to the upside; large to the downside.',
        breakeven: 'Call strike + premium; put strike − premium.',
        greeks: 'Near delta-neutral, short gamma, positive theta, short vega. Further OTM = slower decay but more room.',
        manage: 'Take profit at ~50% of max. If a strike is tested, roll the untested side toward it or close the position.',
        risks: 'Undefined risk with less premium cushion than it feels like. Trending markets are the enemy — have an exit plan before entry.'
      },
      iron_condor: {
        outlook: 'Neutral — range-bound',
        thesis: 'A defined-risk bet the stock stays in a range: you sell an out-of-the-money call spread and an out-of-the-money put spread, keeping the net credit.',
        ideal: 'Range-bound stock, elevated IV (rich premiums to sell), and no binary events inside the window.',
        maxProfit: 'The net credit received.',
        maxLoss: 'Spread width − net credit.',
        breakeven: 'Short put strike − credit; short call strike + credit.',
        greeks: 'Near delta-neutral, short gamma, positive theta, short vega — you are short volatility and long time.',
        manage: 'Take profit around 50% of max credit. If a short strike is tested, roll the untested side toward it or close for a small loss.',
        risks: 'The loss is several multiples of the credit. High win rate, low payout: one breach can erase many winners. Size accordingly.'
      },
      iron_butterfly: {
        outlook: 'Neutral — pinned at the strike',
        thesis: 'You sell an at-the-money straddle and buy out-of-the-money wings for protection: maximum premium collection with defined risk.',
        ideal: 'You expect the stock to pin a strike into expiry — classic for index options in quiet weeks.',
        maxProfit: 'The net credit received (stock pins the short strikes).',
        maxLoss: 'Wing width − net credit.',
        breakeven: 'Short strike ± net credit.',
        greeks: 'Near delta-neutral at the body, short gamma (sharp near the pin), positive theta, short vega.',
        manage: 'Take profit quickly (25–50%); the position sours fast if the stock leaves the body. Do not hold a tested wing into expiry.',
        risks: 'Concentrated risk at one strike: a move in either direction toward a wing can produce the max loss fast.'
      },
      long_call_butterfly: {
        outlook: 'Neutral — pinned at the middle strike',
        thesis: 'Buy one lower call, sell two middle calls, buy one higher call: a low-cost bet the stock lands near the middle strike at expiry.',
        ideal: 'You expect the stock to gravitate to a level and sit there — low-volatility pinning with defined risk.',
        maxProfit: 'Width between strikes − net debit (stock pins the middle strike).',
        maxLoss: 'The net debit paid.',
        breakeven: 'Lower strike + debit; upper strike − debit.',
        greeks: 'Near delta-neutral at the body, long gamma near the middle strike, negative theta — you need the pin, and time works against you.',
        manage: 'Sell into strength as the body fills in; butterflies decay into expiry, so avoid paying up with days left.',
        risks: 'Narrow profit zone: the stock must land close to the middle strike. Most butterflies expire for a fraction of max.'
      },
      call_condor: {
        outlook: 'Neutral — settle in a zone',
        thesis: 'A wider butterfly built from calls: buy a lower call, sell two middle strikes, buy an upper call. A wider landing zone for the stock.',
        ideal: 'You expect the stock to finish inside a range but want more room for error than a butterfly allows.',
        maxProfit: 'Width between the inner strikes − net debit.',
        maxLoss: 'The net debit paid.',
        breakeven: 'Lowest strike + debit; highest strike − debit.',
        greeks: 'Near delta-neutral inside the body, long gamma, negative theta — like a butterfly with a wider sweet spot.',
        manage: 'Scale out as the body fills; time decay eats condors into expiry, so earlier exits usually beat hoping for max.',
        risks: 'Still a narrow-range bet: outside the wings the whole debit is lost. Commissions on four legs add up.'
      },
      long_put_butterfly: {
        outlook: 'Neutral — pinned at the middle strike',
        thesis: 'The put-side mirror of the call butterfly: buy one higher put, sell two middle puts, buy one lower put. Profits if the stock pins the middle strike.',
        ideal: 'Same pinning setups as the call butterfly; often chosen when put skew makes the pricing slightly better.',
        maxProfit: 'Width between strikes − net debit (stock pins the middle strike).',
        maxLoss: 'The net debit paid.',
        breakeven: 'Upper strike − debit; lower strike + debit.',
        greeks: 'Near delta-neutral at the body, long gamma, negative theta.',
        manage: 'Same as the call butterfly: sell into the fill, do not overpay for time.',
        risks: 'Narrow profit zone and time decay — most expire well below max profit.'
      },
      put_condor: {
        outlook: 'Neutral — settle in a zone',
        thesis: 'The put-side mirror of the call condor: a four-leg range bet with a wider landing zone than a butterfly.',
        ideal: 'Range-bound expectations with a preference for put pricing, or to balance an existing call-side position.',
        maxProfit: 'Width between the inner strikes − net debit.',
        maxLoss: 'The net debit paid.',
        breakeven: 'Highest strike − debit; lowest strike + debit.',
        greeks: 'Near delta-neutral inside the body, long gamma, negative theta.',
        manage: 'Scale out as the body fills; avoid holding into expiry hoping for the last few dollars.',
        risks: 'Outside the wings the full debit is lost; four legs mean fills and commissions matter.'
      },
      calendar_call: {
        outlook: 'Neutral — time decay harvest',
        thesis: 'Sell a near-dated call and buy a longer-dated call at the same strike: the front option decays faster, and you keep the difference.',
        ideal: 'Stock near the strike into the front expiry, with the term structure in contango (far-month IV at or above near-month IV).',
        maxProfit: 'Near the strike at front expiry: the short call dies worthless while the long call retains time value.',
        maxLoss: 'The net debit, if the stock moves far away in either direction.',
        breakeven: 'Two dynamic breakevens at front expiry — roughly where the back spread’s remaining value equals the debit.',
        greeks: 'Near delta-neutral at the strike; long vega (rising IV helps the back month more); positive theta near the strike as the front leg melts faster.',
        manage: 'Close or roll before front expiry to dodge pin and gamma risk. Do not hold the leftover long call naked by accident.',
        risks: 'A sharp move either way flattens the edge; an IV crush hurts the long back-month option more than the short front one.'
      },
      jade_lizard: {
        outlook: 'Bullish to neutral',
        thesis: 'A short put spread plus a short call with no upside risk: the call premium covers the put spread’s width, so there is no loss if the stock rallies.',
        ideal: 'Mildly bullish to neutral; you want premium income without any upside tail risk.',
        maxProfit: 'The total credit received.',
        maxLoss: 'Put spread width − credit (downside only).',
        breakeven: 'One breakeven, on the downside: short put strike − total credit.',
        greeks: 'Slightly bullish delta, short gamma on the downside, positive theta, short vega.',
        manage: 'On a rally, roll the short call up to keep collecting. On a drop, defend the put spread like any short put spread.',
        risks: 'The downside is the full put-spread width: a hard selloff through the long put still produces the max loss.'
      },
      pmcc: {
        outlook: 'Bullish (capital-efficient)',
        thesis: 'A capital-efficient covered call: a deep in-the-money LEAPS call stands in for the shares, and you sell short-dated calls against it for income.',
        ideal: 'Long-term bullish on a stock, wanting covered-call income with a fraction of the capital.',
        maxProfit: 'Capped: (short strike − LEAPS effective cost) + net credits collected.',
        maxLoss: 'The net debit if the stock collapses — the LEAPS can lose most of its value.',
        breakeven: 'LEAPS strike + net debit paid.',
        greeks: 'Long delta (the LEAPS behaves like stock), positive theta and short gamma from the short call, net long vega from the LEAPS.',
        manage: 'Roll the short call up and out on rallies. Give the LEAPS 12+ months so short-term decay barely touches it.',
        risks: 'Still large downside if the stock tanks. Assignment on the short call can leave an awkward spread to unwind.'
      },
      call_ratio_spread: {
        outlook: 'Neutral to mildly bullish',
        thesis: 'Buy one call and sell two higher calls (1×2): the short calls finance the long one, often for a small credit — profiting from a gentle rise to the short strike.',
        ideal: 'A slow grind up to the short strike, with rich IV making the short calls expensive.',
        maxProfit: 'At the short strike at expiry: the long call’s width minus net cost.',
        maxLoss: 'Unlimited above the upper breakeven — beyond it you are naked short a call.',
        breakeven: 'Two: long strike + net debit (or − credit) below; short strike + max profit above.',
        greeks: 'Long delta low, flipping to short delta above the short strike; short gamma up top; positive theta.',
        manage: 'Take profit near the short strike. Never hold the naked upper tail into a melt-up — close or roll the risk off.',
        risks: 'Unlimited upside risk past the upper breakeven. This is not a beginner spread: it needs active management.'
      },
      put_ratio_spread: {
        outlook: 'Neutral to mildly bearish',
        thesis: 'Buy one put and sell two lower puts (1×2): the short puts finance the long one — profiting from a gentle decline to the short strike.',
        ideal: 'A slow bleed down to the short strike; often used to finance downside hedges cheaply.',
        maxProfit: 'At the short strike at expiry: the long put’s width minus net cost.',
        maxLoss: 'Large below the lower breakeven — beyond it you are naked short a put (stock to zero).',
        breakeven: 'Two: long strike − net debit (or + credit) above; short strike − max profit below.',
        greeks: 'Short delta between the strikes, but below the short strike the extra naked short put flips delta against you — the position starts losing as the market keeps falling. Short gamma down low; positive theta.',
        manage: 'Take profit near the short strike. Close or roll well before a crash can run past the lower breakeven.',
        risks: 'Nearly unlimited downside risk past the lower breakeven. Manage actively — this spread punishes complacency.'
      },
      synthetic_long: {
        outlook: 'Bullish',
        thesis: 'Buy a call and sell a put at the same strike: replicates owning 100 shares — the call captures upside, the put obligates the downside — for a fraction of the capital.',
        ideal: 'Strongly bullish with limited capital; often paired with a protective long put (a collar) to define risk.',
        maxProfit: 'Unlimited.',
        maxLoss: 'Strike − net credit (stock to zero) — like owning the stock.',
        breakeven: 'Strike + net debit (or − net credit).',
        greeks: 'Delta near +100 — it behaves like shares, with minimal gamma, theta, or vega.',
        manage: 'Manage it like a stock position. Add a long put wing to define risk, turning it into a risk reversal or collar.',
        risks: 'Same downside as owning the stock. The short put can be assigned if it goes deep in the money.'
      },
      synthetic_short: {
        outlook: 'Bearish',
        thesis: 'Buy a put and sell a call at the same strike: replicates shorting 100 shares — the put captures downside, the call obligates the upside.',
        ideal: 'Strongly bearish with limited capital, or hedging long stock without selling it.',
        maxProfit: 'Large: nearly the strike if the stock went to zero.',
        maxLoss: 'Unlimited — like a short stock position into a rally.',
        breakeven: 'Strike − net debit (or + net credit).',
        greeks: 'Delta near −100 — it behaves like short shares, with minimal gamma, theta, or vega.',
        manage: 'Manage like a short stock position; add a long call wing to cap the upside risk.',
        risks: 'Unlimited upside loss, and the short call can be assigned. Define the risk with a wing unless you can truly manage short exposure.'
      },
      risk_reversal: {
        outlook: 'Bullish tilt',
        thesis: 'Sell an out-of-the-money put and buy an out-of-the-money call: selling the put finances the call, giving bullish exposure at little or no premium.',
        ideal: 'Bullish but premium-sensitive; popular for hedging producers or expressing a directional tilt cheaply.',
        maxProfit: 'Unlimited on the call side.',
        maxLoss: 'Large: put strike − premium if the stock collapses.',
        breakeven: 'Call strike + net debit above; put strike − net credit below.',
        greeks: 'Long delta; long gamma on the call wing, short gamma on the put wing; roughly theta-neutral.',
        manage: 'If the stock drops, the short put goes in the money — roll it down or close before assignment. Bank call profits on spikes.',
        risks: 'The “cheap” call is paid for with real downside obligation. Skew can make the short put expensive to buy back in a selloff.'
      }
    };

    function resolveGuideKey(key) {
      if (!key) return '';
      return GUIDE_ALIASES[key] || key;
    }

    function openStrategyGuide() {
      const sel = document.getElementById('strategyTemplate');
      const rawKey = sel ? sel.value : '';
      const key = resolveGuideKey(rawKey);
      const g = STRATEGY_GUIDES[key];
      const meta = TEMPLATE_LESSONS[key] || TEMPLATE_LESSONS[rawKey];
      const drawer = document.getElementById('guideDrawer');
      const overlay = document.getElementById('guideOverlay');
      const titleEl = document.getElementById('guideTitle');
      const outlookEl = document.getElementById('guideOutlook');
      const bodyEl = document.getElementById('guideBody');
      if (!drawer || !bodyEl) return;
      if (g) {
        if (titleEl) titleEl.textContent = (meta ? meta.title : key) + ' — strategy guide';
        if (outlookEl) outlookEl.textContent = g.outlook;
        let html = '';
        html += '<h4>The idea</h4><p>' + g.thesis + '</p>';
        html += '<h4>When it fits</h4><p>' + g.ideal + '</p>';
        html += '<h4>Max profit</h4><p>' + g.maxProfit + '</p>';
        html += '<h4>Max loss</h4><p>' + g.maxLoss + '</p>';
        html += '<h4>Breakeven</h4><p>' + g.breakeven + '</p>';
        html += '<h4>Greeks profile</h4><p>' + g.greeks + '</p>';
        html += '<h4>Managing it</h4><p>' + g.manage + '</p>';
        html += '<h4>Key risks</h4><p>' + g.risks + '</p>';
        if (meta) {
          html += '<h4>Learn more</h4><p><a href="' + meta.href + '">' + meta.label + ' — ' + meta.title + '</a> on jsm-options.com</p>';
        }
        bodyEl.innerHTML = html;
      } else {
        if (titleEl) titleEl.textContent = 'Strategy guide';
        if (outlookEl) outlookEl.textContent = '—';
        bodyEl.innerHTML = '<p>Pick a strategy template above, then open this guide to learn how it works, when it fits, and what can go wrong.</p>';
      }
      drawer.classList.add('open');
      if (overlay) overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      const closeBtn = drawer.querySelector('.guide-close');
      if (closeBtn) closeBtn.focus();
    }

    function closeStrategyGuide() {
      const drawer = document.getElementById('guideDrawer');
      const overlay = document.getElementById('guideOverlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeStrategyGuide();
    });

    function signedQty(leg) {
      return leg.side === 'buy' ? leg.qty : -leg.qty;
    }

    // Stock qty is shares; regular listed options are ×100; futures options use
    // their own contract multiplier (e.g. /ES = $50/point, /CL = 1,000 barrels).
    function legShareMult(leg) {
      return legMultiplier(leg);
    }

    function legCash(leg) {
      return signedQty(leg) * leg.premium * legShareMult(leg);
    }

    function addEmptyLeg() {
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const draft = {
        id: nextId++,
        side: 'buy',
        type: 'call',
        strike: Math.round(S),
        dte: 90,
        qty: 1,
        premium: 3.00,
        ticker: currentTicker(),
        premiumManual: false
      };
      draft.premium = modeledPremiumForLeg(draft, S);
      legs.push(draft);
      markBuildDirty();
      syncDTESlider();
      renderLegs();
      recalc();
    }

    function removeLeg(id) {
      legs = legs.filter(l => l.id !== id);
      if (legs.length === 0) legs = defaultLongCall();
      markBuildDirty();
      syncDTESlider();
      renderLegs();
      recalc();
    }

    function clearLegs() {
      legs = defaultLongCall();
      markBuildDirty();
      syncDTESlider();
      renderLegs();
      recalc();
      resetSimulation();
    }

    // liveTyping = true → update model + graph only (keep focus in the input)
    // liveTyping = false → also re-render leg rows (cash labels, disabled fields, etc.)
    function updateLegField(id, field, value, liveTyping) {
      const leg = legs.find(l => l.id === id);
      if (!leg) return;
      markBuildDirty();
      if (field === 'ticker') {
        leg.ticker = normalizeTicker(value);
        leg.tickerManual = !!leg.ticker;
      } else if (field === 'side' || field === 'type') {
        // A futures underlying is an option on a futures contract, not a stock
        // leg. Convert an accidental Stock selection back to a Call.
        if (field === 'type' && value === 'stock' && isFuturesTicker(leg.ticker || currentTicker())) {
          value = 'call';
        }
        leg[field] = value;
        // When switching to Stock: use current spot as cost basis; Qty = shares (default 100)
        if (field === 'type' && value === 'stock') {
          const S = parseFloat(document.getElementById('spot').value) || 100;
          if (!leg.premium || leg.premium < 1) leg.premium = +S.toFixed(2);
          leg.strike = 0;
          leg.dte = 0;
          if (!leg.qty || leg.qty < 10) leg.qty = 100; // typical 1 lot for covered strategies
        }
        // When switching from Stock to option: give sensible defaults (Qty becomes contracts)
        if (field === 'type' && value !== 'stock') {
          const S = parseFloat(document.getElementById('spot').value) || 100;
          if (!leg.strike || leg.strike < 1) leg.strike = Math.round(S);
          if (!leg.dte || leg.dte < 1) leg.dte = 45;
          if (!leg.premium || leg.premium > S * 0.5) leg.premium = +(S * 0.03).toFixed(2);
          if (leg.qty >= 100) leg.qty = 1; // was share count → 1 contract
        }
      } else if (field === 'strike' || field === 'premium') {
        leg[field] = parseFloat(value) || 0;
        if (field === 'premium') {
          leg.premiumManual = true;
          leg.premiumFromChain = false;
        }
      } else if (field === 'dte' || field === 'qty') {
        leg[field] = Math.max(1, parseInt(value, 10) || 1);
      }
      if (field === 'ticker' && leg.type !== 'stock' && isFuturesTicker(leg.ticker)) {
        const S = parseFloat(document.getElementById('spot').value) || 100;
        if (!leg.strike || leg.strike <= 0) leg.strike = roundToStep(S, futuresStrikeStep(leg.ticker));
        leg.premiumFromChain = false;
        if (!leg.premiumManual) leg.premium = modeledPremiumForLeg(leg, S);
      }
      if (field === 'strike' || field === 'dte' || field === 'type') {
        const fromChain = (typeof tryFillLegFromChain === 'function') ? tryFillLegFromChain(leg) : false;
        if (!fromChain && !leg.premiumManual) {
          const S = parseFloat(document.getElementById('spot').value) || 100;
          leg.premium = modeledPremiumForLeg(leg, S);
        }
      }
      if (field === 'dte' || field === 'type') syncDTESlider();
      if (field === 'strike' || field === 'type') updateSpotSliderRange();
      // Re-render only when structure changes or on blur — never on every keystroke
      if (!liveTyping) {
        renderLegs();
      } else {
        // Still refresh the cash label under this leg without touching the inputs
        updateLegCashLabel(id);
        if (field === 'strike' || field === 'dte' || field === 'type') {
          updateLegPremiumInput(id);
        }
      }
      recalc();
    }

    function updateLegPremiumInput(id) {
      const idx = legs.findIndex(function (l) { return l.id === id; });
      if (idx < 0) return;
      const rows = document.querySelectorAll('#legsList .leg-row');
      const row = rows[idx];
      if (!row) return;
      const inputs = row.querySelectorAll('input[type="number"]');
      // option row: strike, dte, qty, premium — stock row: qty, premium
      const premInput = inputs[inputs.length - 1];
      if (premInput && document.activeElement !== premInput) {
        const prem = legs[idx].premium;
        premInput.value = (prem == null ? '' : prem);
      }
      updateLegCashLabel(id);
    }

    function updateLegCashLabel(id) {
      const leg = legs.find(l => l.id === id);
      if (!leg) return;
      const rows = document.querySelectorAll('#legsList .leg-row');
      const cashLines = document.querySelectorAll('#legsList .cash-line');
      // legs and cash-lines are interleaved 1:1 in the same order as the legs array
      const idx = legs.findIndex(l => l.id === id);
      if (idx < 0 || !cashLines[idx]) return;
      const isStock = leg.type === 'stock';
      const cash = legCash(leg);
      const cashCls = cash >= 0 ? 'cash-debit' : 'cash-credit';
      const cashTxt = '$' + Math.abs(cash).toFixed(0);
      const cashLabel = isStock
        ? (leg.side === 'buy' ? 'Stock cost ' : 'Stock credit ') + cashTxt + ' (' + leg.qty + ' shares)'
        : (cash >= 0 ? 'Debit' : 'Credit') + ' ' + cashTxt + ' (×' + legShareMult(leg) + ')';
      cashLines[idx].className = 'cash-line ' + cashCls;
      cashLines[idx].textContent = cashLabel;
    }

    function syncDTESlider() {
      const optionDTEs = legs.filter(l => l.type !== 'stock').map(l => l.dte || 0);
      maxDTE = optionDTEs.length ? Math.max(...optionDTEs) : 90;
      if (maxDTE < 1) maxDTE = 90;
      const slider = document.getElementById('daysLeft');
      if (!slider) return;
      slider.max = maxDTE;
      if (parseInt(slider.value, 10) > maxDTE) slider.value = maxDTE;
      setText('daysLeftLabel', slider.value);
    }

    // DTE cell: when a CBOE chain is loaded for this leg's ticker, offer the
    // listed expirations as a dropdown (real expiry dates instead of a bare
    // day count); otherwise fall back to the numeric input. Futures legs and
    // legs on a different ticker keep the numeric input.
    function dteInputFor(l, isStock, futuresLeg) {
      if (isStock) {
        return '<input type="text" value="—" disabled title="Not used for stock" style="opacity:0.45;cursor:not-allowed;" />';
      }
      const data = window._cboeData;
      const exps = (data && data.expirations) || [];
      const chainSym = data && data.symbol ? String(data.symbol).toUpperCase() : '';
      const legSym = ((l.ticker || '').toString().toUpperCase()) ||
        (typeof currentTicker === 'function' ? String(currentTicker()).toUpperCase() : '');
      if (!futuresLeg && exps.length && chainSym && legSym === chainSym) {
        const cur = Math.max(1, parseInt(l.dte, 10) || 0);
        let opts = '';
        let matched = false;
        for (let i = 0; i < exps.length; i++) {
          const d = expirationDte(exps[i]);
          if (d < 1) continue;
          const sel = (d === cur) ? ' selected' : '';
          if (d === cur) matched = true;
          opts += '<option value="' + d + '"' + sel + '>' + exps[i] + ' (' + d + 'd)</option>';
        }
        if (!matched) {
          opts = '<option value="' + cur + '" selected>Custom (' + cur + 'd)</option>' + opts;
        }
        return '<select title="Expiration date (from chain)" onchange="updateLegField(' + l.id + ',\'dte\',this.value,false)">' + opts + '</select>';
      }
      return '<input type="number" value="' + l.dte + '" min="1" max="730" ' +
        'onchange="updateLegField(' + l.id + ',\'dte\',this.value,false)" ' +
        'oninput="updateLegField(' + l.id + ',\'dte\',this.value,true)" />';
    }

    // One-line per-leg Greeks under each leg row (all five: delta, gamma,
    // theta/day, vega, rho).
    function legGreeksLine(l) {
      if (!l || l.type === 'stock' || legIsIncomplete(l)) return '';
      try {
        const g = positionGreeksFor([l]);
        if (!isFinite(g.delta) || !isFinite(g.theta) || !isFinite(g.gamma) || !isFinite(g.vega) || !isFinite(g.rho)) return '';
        const sgn = function(x, d, money) {
          const v = money ? formatMoney(x) : x.toFixed(d);
          return (x >= 0 ? '+' : '') + v;
        };
        return '<div class="leg-greeks">Δ ' + sgn(g.delta, 1) +
          ' · Γ ' + sgn(g.gamma, 2) +
          ' · Θ ' + sgn(g.theta, 0, true) + '/day' +
          ' · ν ' + sgn(g.vega, 0, true) +
          ' · ρ ' + sgn(g.rho, 0, true) + '</div>';
      } catch (e) { return ''; }
    }

    function renderLegs() {
      const container = document.getElementById('legsList');
      if (!container) return;
      if (!legs.length) {
        container.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;">No legs.</p>';
        return;
      }
      container.innerHTML = legs.map(function(l) {
        const isStock = l.type === 'stock';
        const cash = legCash(l);
        const cashCls = cash >= 0 ? 'cash-debit' : 'cash-credit';
        const cashTxt = '$' + Math.abs(cash).toFixed(0);
        const rowCls = l.side === 'buy' ? 'long' : 'short';
        const sideBuy = l.side === 'buy' ? ' selected' : '';
        const sideSell = l.side === 'sell' ? ' selected' : '';
        const typeCall = l.type === 'call' ? ' selected' : '';
        const typePut = l.type === 'put' ? ' selected' : '';
        const futuresLeg = isFuturesTicker(l.ticker || currentTicker());
        const typeStock = isStock && !futuresLeg ? ' selected' : '';
        const stockOption = futuresLeg ? '' : '<option value=\"stock\"' + typeStock + '>Stock</option>';
        const debitCredit = cash >= 0 ? 'Debit' : 'Credit';
        const cashLabel = isStock
          ? (l.side === 'buy' ? 'Stock cost ' : 'Stock credit ') + cashTxt + ' (' + l.qty + ' shares)'
          : debitCredit + ' ' + cashTxt + ' (×' + legShareMult(l) + ')';

        // Strike & DTE disabled for stock; premium becomes Cost/Share
        // oninput → liveTyping=true (update graph, keep focus)
        // onchange → liveTyping=false (re-render cash labels / structure)
        const strikeStep = futuresLeg ? futuresStrikeStep(l.ticker || currentTicker()) : 0.5;
        const strikeInput = isStock
          ? '<input type="text" value="—" disabled title="Not used for stock" style="opacity:0.45;cursor:not-allowed;" />'
          : '<input type="number" value="' + (l.strike == null ? '' : l.strike) + '" step="' + strikeStep + '" min="0.000001" placeholder="Enter strike" ' +
              'onchange="updateLegField(' + l.id + ',\'strike\',this.value,false)" ' +
              'oninput="updateLegField(' + l.id + ',\'strike\',this.value,true)" />';
        const dteInput = dteInputFor(l, isStock, futuresLeg);
        const premiumTitle = isStock ? 'Cost per share (entry)' : 'Option Premium per share';
        const premiumVal = (l.premium == null ? '' : l.premium);
        const premiumInput =
          '<input type="number" value="' + premiumVal + '" step="0.05" min="0" title="' + premiumTitle + '" placeholder="Enter price" ' +
            'onchange="updateLegField(' + l.id + ',\'premium\',this.value,false)" ' +
            'oninput="updateLegField(' + l.id + ',\'premium\',this.value,true)" />';
        const qtyInput =
          '<input type="number" value="' + l.qty + '" min="1" step="1" ' +
            'onchange="updateLegField(' + l.id + ',\'qty\',this.value,false)" ' +
            'oninput="updateLegField(' + l.id + ',\'qty\',this.value,true)" />';
        const inherited = currentTicker();
        const tickerVal = (l.ticker || '').toString().toUpperCase();
        const tickerInput =
          '<input type="text" maxlength="8" spellcheck="false" placeholder="' + inherited + '" value="' + tickerVal + '" ' +
            'title="Leg Symbol; blank uses strategy ticker" style="text-transform:uppercase" ' +
            'onchange="updateLegField(' + l.id + ',\'ticker\',this.value,false)" />';

        return (
          '<div class="leg-row ' + rowCls + '">' +
            '<select onchange="updateLegField(' + l.id + ',\'side\',this.value,false)">' +
              '<option value="buy"' + sideBuy + '>Buy (Long)</option>' +
              '<option value="sell"' + sideSell + '>Sell (Short)</option>' +
            '</select>' +
            '<select onchange="updateLegField(' + l.id + ',\'type\',this.value,false)">' +
              '<option value="call"' + typeCall + '>Call</option>' +
              '<option value="put"' + typePut + '>Put</option>' +
              stockOption +
            '</select>' +
            tickerInput +
            strikeInput +
            dteInput +
            qtyInput +
            premiumInput +
            '<div class="remove-cell">' +
              '<button class="btn-danger" onclick="removeLeg(' + l.id + ')" title="Remove leg">✕</button>' +
            '</div>' +
          '</div>' +
          '<div class="cash-line ' + cashCls + '">' + cashLabel + '</div>' +
          legGreeksLine(l)
        );
      }).join('');
      // Item 9: keep the roll analyzer's leg list fresh as legs are edited.
      try { if (typeof syncRollLegs === 'function') syncRollLegs(); } catch (e) {}
    }

    function updateSpotSliderRange() {
      if (!legs.length) return;
      const strikes = legs.filter(l => l.type !== 'stock' && l.strike != null && isFinite(l.strike)).map(l => l.strike);
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const all = strikes.length ? strikes : [S];
      const lo = Math.min(S, ...all) * 0.55;
      const hi = Math.max(S, ...all) * 1.55;
      const slider = document.getElementById('spotSlider');
      if (!slider) return;
      slider.min = Math.max(1, Math.floor(lo));
      slider.max = Math.ceil(hi);
      // Keep the thumb on the current spot. Raising min above a stale value
      // makes the browser clamp the value up to min, so without this the
      // first drag after a chain load / spot edit starts from the lower end
      // of the range instead of the current price.
      slider.value = Math.min(slider.max, Math.max(slider.min, S));
    }

    function getParams() {
      return {
        S: parseFloat(document.getElementById('spot').value) || 100,
        daysLeft: parseInt(document.getElementById('daysLeft').value, 10),
        iv: (parseFloat(document.getElementById('iv').value) || 25) / 100,
        r: (parseFloat(document.getElementById('rate').value) || 5) / 100,
        q: (parseFloat(document.getElementById('divYield').value) || 0) / 100
      };
    }

    // IV shock scenario multiplier for P&L repricing (OptionStrat-style ×1/×2/×3
    // buttons). 1 = no shock. Applied in positionValueAt only.
    let ivShockMultVal = 1;
    function ivShockMult() { return ivShockMultVal || 1; }
    function setIvShock(m) {
      ivShockMultVal = m;
      // Reprice any simulated day-by-day P/L history under the new shock so
      // "P/L now" and the P/L path stay consistent with the chosen scenario.
      if (typeof simPLLog !== 'undefined' && simPLLog.length && typeof maxDTE !== 'undefined') {
        simPLLog.forEach(function (row) {
          row.pl = plAt(row.price, Math.max(0, maxDTE - row.day));
        });
      }
      const label = document.getElementById('ivShockLabel');
      if (label) label.textContent = '×' + m;
      const btns = document.querySelectorAll('#ivShockBtns button');
      btns.forEach(function (b) {
        const on = parseFloat(b.getAttribute('data-mult')) === m;
        b.classList.toggle('btn-toggle-on', on);
      });
      recalc();
    }

    function positionValueAt(S, daysLeft, useExpiryOnly, legsArr) {
      const list = legsArr || legs;
      let total = 0;
      const params = getParams();
      // IV shock scenario (×0.5/×1/×1.5/×2 buttons in the simulator):
      // reprice the theoretical value as if IV instantly repriced, while the
      // premiums actually paid (initialCost) stay fixed. Greeks, modeled
      // premiums and PoP intentionally keep using base IV.
      const iv = params.iv * ivShockMult();
      // Multi-expiry (calendar / diagonal): residual time is relative to the nearest option.
      // "At expiry" = nearest-dated options expire (T=0); longer-dated keep (leg.dte - minDte) days.
      const optionDtes = [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].type !== 'stock') optionDtes.push(list[i].dte);
      }
      const minDte = optionDtes.length ? Math.min.apply(null, optionDtes) : 0;

      for (const leg of list) {
        let valPerShare;
        if (leg.type === 'stock') {
          valPerShare = S;
        } else if (legIsIncomplete(leg)) {
          valPerShare = 0;
        } else {
          let residualDays;
          if (useExpiryOnly) {
            residualDays = Math.max(0, leg.dte - minDte);
          } else {
            // daysLeft slider ≈ days remaining until nearest expiry
            const elapsed = Math.max(0, minDte - daysLeft);
            residualDays = Math.max(0, leg.dte - elapsed);
          }
          valPerShare = legIsFuturesOption(leg)
            ? black76(S, leg.strike, residualDays / 365, params.r, iv, leg.type)
            : blackScholes(S, leg.strike, residualDays / 365, params.r, params.q, iv, leg.type);
        }
        total += signedQty(leg) * valPerShare * legShareMult(leg);
      }
      return total;
    }

    // Round-trip commission per option contract, from the Commission input.
    // Included in initialCost so it flows into net debit/credit, P/L curves,
    // max loss and return-on-risk for both A and B.
    function commissionPerContract() {
      const el = document.getElementById('commission');
      const v = el ? parseFloat(el.value) : 0;
      return v > 0 ? v : 0;
    }
    function commissionTotal(legsArr) {
      const rate = commissionPerContract();
      if (!(rate > 0)) return 0;
      const list = legsArr || legs;
      let contracts = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].type === 'stock') continue;
        contracts += Math.abs(Number(list[i].qty) || 0);
      }
      return rate * 2 * contracts; // open + close
    }

    function initialCost(legsArr) {
      return (legsArr || legs).reduce(function(sum, l) { return sum + legCash(l); }, 0) + commissionTotal(legsArr);
    }

    function plAt(S, daysLeft, legsArr) {
      return positionValueAt(S, daysLeft, false, legsArr) - initialCost(legsArr);
    }

    function expiryPayoff(S, legsArr) {
      return positionValueAt(S, 0, true, legsArr) - initialCost(legsArr);
    }

    function segmentColor(ctx, pos, neg) {
      const y0 = ctx.p0.parsed.y;
      const y1 = ctx.p1.parsed.y;
      if (y0 >= 0 && y1 >= 0) return pos;
      if (y0 < 0 && y1 < 0) return neg;
      return (y0 + y1) >= 0 ? pos : neg;
    }

    function collectStrikes(list) {
      return (list || []).filter(function(l) { return l.type !== 'stock' && l.strike != null && isFinite(l.strike); }).map(function(l) { return l.strike; });
    }

    function buildChartData() {
      if (!legs.length) return { labels: [], expiry: [], theoretical: [], expiryB: [], theoreticalB: [] };
      const params = getParams();
      const S = params.S;
      const anchor = (typeof chartRefSpot === 'number' && chartRefSpot > 0) ? chartRefSpot : S;
      const daysLeft = params.daysLeft;
      const strikes = collectStrikes(legs).concat(compareMode ? collectStrikes(legsB) : []);
      const base = strikes.length ? strikes : [anchor];
      let lo = Math.min(anchor * 0.65, Math.min.apply(null, base) * 0.65);
      let hi = Math.max(anchor * 1.45, Math.max.apply(null, base) * 1.45);
      if (chartZoom && chartZoom.min > 0 && chartZoom.max > chartZoom.min) {
        lo = chartZoom.min;
        hi = chartZoom.max;
      }
      const priceSet = {};
      const steps = 160;
      for (let i = 0; i <= steps; i++) {
        const price = lo + (hi - lo) * (i / steps);
        priceSet[price.toFixed(6)] = price;
      }
      for (let s = 0; s < base.length; s++) {
        const k = base[s];
        if (k >= lo && k <= hi) {
          priceSet[k.toFixed(6)] = k;
          priceSet[(k - 0.01).toFixed(6)] = Math.max(0.01, k - 0.01);
          priceSet[(k + 0.01).toFixed(6)] = k + 0.01;
        }
      }
      const labels = Object.keys(priceSet).map(Number).sort(function(a, b) { return a - b; });
      const expiry = [];
      const theoretical = [];
      const expiryB = [];
      const theoreticalB = [];
      for (let i = 0; i < labels.length; i++) {
        expiry.push(expiryPayoff(labels[i], legs));
        theoretical.push(plAt(labels[i], daysLeft, legs));
        if (compareMode && legsB.length) {
          expiryB.push(expiryPayoff(labels[i], legsB));
          theoreticalB.push(plAt(labels[i], daysLeft, legsB));
        }
      }
      return { labels: labels, expiry: expiry, theoretical: theoretical, expiryB: expiryB, theoreticalB: theoreticalB };
    }


    const crosshairPlugin = {
      id: 'crosshairLines',
      afterDraw: function(chart) {
        const cx = chart.scales.x;
        const cy = chart.scales.y;
        if (!cx || !cy) return;
        const ctx = chart.ctx;
        const x = cx.getPixelForValue(crosshairS);
        // Item 4: the crosshair tracks position A, so it follows A's effective
        // Y mode (percent when A is in a % mode, dollars when A fell back).
        const chPct = (typeof chartModeA !== 'undefined' && chartModeA === 'pct');
        const chDenom = (typeof chartDenomA === 'number' && chartDenomA > 0) ? chartDenomA : 1;
        const chY = chPct ? crosshairPL / chDenom : crosshairPL;
        const y = cy.getPixelForValue(chY);
        const top = chart.chartArea.top;
        const bottom = chart.chartArea.bottom;
        const left = chart.chartArea.left;
        const right = chart.chartArea.right;
        if (x < left || x > right) return;
        ctx.save();
        ctx.lineWidth = 1.35;
        ctx.setLineDash([5, 4]);
        var light = (typeof isLightTheme === 'function') ? isLightTheme() : (document.documentElement.getAttribute('data-theme') === 'light');
        // vertical at underlying price
        ctx.strokeStyle = light ? 'rgba(15, 23, 42, 0.72)' : 'rgba(203, 213, 225, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        // horizontal at current P/L — same color drives both the line and its
        // label; darker amber in light theme so it stays readable on a light background
        var plColor = light ? 'rgba(146, 64, 14, 0.95)' : 'rgba(250, 204, 21, 0.95)';
        if (y >= top && y <= bottom) {
          ctx.strokeStyle = plColor;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        // small labels
        ctx.font = '11px Segoe UI, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
        const priceLbl = '$' + crosshairS.toFixed(1);
        ctx.fillText(priceLbl, Math.min(x + 4, right - 48), top + 12);
        ctx.fillStyle = plColor;
        const plLbl = chPct
          ? ((chY >= 0 ? '+' : '') + chY.toFixed(1) + '%')
          : ((crosshairPL >= 0 ? '+' : '') + '$' + crosshairPL.toFixed(0));
        ctx.fillText(plLbl, left + 4, Math.max(y - 4, top + 12));
        ctx.restore();
      }
    };

    // Vertical strike markers for each option leg, with a grab handle at the
    // top so strikes can be dragged directly on the payoff chart (the grab
    // target for the gesture handler below). Buy legs green, sell legs red.
    const strikeMarkersPlugin = {
      id: 'strikeMarkers',
      afterDraw: function(chart) {
        const cx = chart.scales && chart.scales.x;
        if (!cx || !chart.chartArea) return;
        const area = chart.chartArea;
        const ctx = chart.ctx;
        const list = (typeof legs !== 'undefined' && legs) ? legs : [];
        const light = (typeof isLightTheme === 'function') ? isLightTheme() : (document.documentElement.getAttribute('data-theme') === 'light');
        ctx.save();
        ctx.font = '10px Segoe UI, system-ui, sans-serif';
        for (let i = 0; i < list.length; i++) {
          const leg = list[i];
          if (!leg || leg.type === 'stock' || !isFinite(leg.strike)) continue;
          const x = cx.getPixelForValue(leg.strike);
          if (x < area.left || x > area.right) continue;
          const active = !!(strikeDrag && strikeDrag.legIds.indexOf(leg.id) >= 0);
          ctx.strokeStyle = active
            ? 'rgba(59,130,246,1)'
            : (light ? 'rgba(37,99,235,0.55)' : 'rgba(96,165,250,0.55)');
          ctx.lineWidth = active ? 2 : 1.25;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, area.top);
          ctx.lineTo(x, area.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          // grab handle
          ctx.beginPath();
          ctx.arc(x, area.top + 10, active ? 7 : 5.5, 0, Math.PI * 2);
          ctx.fillStyle = leg.side === 'sell' ? 'rgba(239,68,68,0.92)' : 'rgba(34,197,94,0.92)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.stroke();
          // tiny strike label
          ctx.fillStyle = light ? 'rgba(30,41,59,0.85)' : 'rgba(148,163,184,0.9)';
          const lbl = '$' + Number(leg.strike).toFixed(0);
          ctx.fillText(lbl, Math.min(Math.max(x + 8, area.left + 2), area.right - 34), area.top + 14);
        }
        ctx.restore();
      }
    };

    // Snap a dragged strike to a sensible increment for the price level.
    function strikeSnapStep(S) {
      if (S >= 500) return 5;
      if (S >= 100) return 1;
      if (S >= 25) return 0.5;
      return 0.1;
    }
    function snapStrike(v, S) {
      const step = strikeSnapStep(S);
      return Math.max(step, Math.round(v / step) * step);
    }

    // Shaded ±1σ expected-move band + expiry breakeven markers on the payoff
    // chart (thinkorswim-style probability shading). The band is drawn behind
    // the P/L lines; breakeven lines are drawn above them.
    const chartOverlaysPlugin = {
      id: 'chartOverlays',
      afterDatasetsDraw: function(chart) {
        const cx = chart.scales && chart.scales.x;
        if (!cx || !chart.chartArea) return;
        const area = chart.chartArea;
        const ctx = chart.ctx;
        const hasLegs = (typeof legs !== 'undefined' && legs && legs.length > 0);
        ctx.save();
        // ±1σ expected-move band around the reference price (fixed while the
        // Underlying slider explores what-if prices)
        if (hasLegs && typeof expectedMove === 'function') {
          let em = null;
          try { em = expectedMove(); } catch (e) { em = null; }
          const S = (typeof emRefSpot === 'function') ? emRefSpot() : 0;
          if (em && isFinite(em) && em > 0 && S > 0) {
            const x0 = Math.max(area.left, cx.getPixelForValue(S - em));
            const x1 = Math.min(area.right, cx.getPixelForValue(S + em));
            if (x1 > x0) {
              ctx.fillStyle = 'rgba(59,130,246,0.07)';
              ctx.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
              ctx.strokeStyle = 'rgba(59,130,246,0.28)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              [x0, x1].forEach(function (x) {
                ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
              });
              ctx.setLineDash([]);
              ctx.font = '10px Segoe UI, system-ui, sans-serif';
              ctx.fillStyle = 'rgba(96,165,250,0.85)';
              ctx.fillText('±1σ', Math.min(x1 - 26, area.right - 30), area.top + 12);
            }
          }
        }
        // Breakeven markers (A slate, B violet in compare mode)
        ctx.font = '10px Segoe UI, system-ui, sans-serif';
        const groups = [
          { list: currentBreakevens, color: 'rgba(148,163,184,0.65)' },
          { list: currentBreakevensB, color: 'rgba(167,139,250,0.75)' }
        ];
        groups.forEach(function (g, gi) {
          (g.list || []).forEach(function (be, bi) {
            if (!isFinite(be)) return;
            const x = cx.getPixelForValue(be);
            if (x < area.left || x > area.right) return;
            ctx.strokeStyle = g.color;
            ctx.lineWidth = 1.25;
            ctx.setLineDash([6, 3]);
            ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = g.color;
            const lbl = 'BE $' + Number(be).toFixed(1);
            // stack labels upward when several breakevens are near each other
            const ly = area.bottom - 8 - (bi * 13) - (gi * 4);
            ctx.fillText(lbl, Math.min(x + 4, area.right - 52), Math.max(ly, area.top + 12));
          });
        });
        // Round 2, Item 5: price-slice markers — vertical dashed teal lines
        // with tiny labels at each slice's target price.
        if (typeof sliceMarkerPrices === 'function') {
          const marks = sliceMarkerPrices();
          const lightMk = (typeof isLightTheme === 'function') ? isLightTheme() : (document.documentElement.getAttribute('data-theme') === 'light');
          ctx.font = '9px Segoe UI, system-ui, sans-serif';
          marks.forEach(function (mk, mi) {
            if (!isFinite(mk)) return;
            const x = cx.getPixelForValue(mk);
            if (x < area.left || x > area.right) return;
            ctx.strokeStyle = lightMk ? 'rgba(13,148,136,0.65)' : 'rgba(45,212,191,0.65)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = lightMk ? '#0d9488' : '#2dd4bf';
            ctx.fillText('$' + Number(mk).toFixed(0), Math.min(x + 4, area.right - 34), area.top + 24 + (mi * 11));
          });
        }
        ctx.restore();
      }
    };

    // Item 4: Y-axis presentation follows the shared $ / % risk / % cost mode.
    function yAxisTitle() {
      if (plMetric === 'risk') return 'P/L (% of max risk)';
      if (plMetric === 'cost') return 'P/L (% of entry cost)';
      return 'P/L ($)';
    }
    function yTickFormat(v) {
      if (plMetric === '$') return '$' + v.toFixed(0);
      return v.toFixed(0) + '%';
    }

    function payoffDatasets(data) {
      const gS = 'rgba(34,197,94,0.95)', rS = 'rgba(239,68,68,0.95)';
      const gD = 'rgba(34,197,94,0.65)', rD = 'rgba(239,68,68,0.65)';
      const bS = 'rgba(167,139,250,0.95)', bD = 'rgba(167,139,250,0.62)';
      // Item 4: % modes rescale each position's datasets by its own
      // denominator. A position whose denominator is undefined (unbounded
      // loss / zero cost) falls back to dollars; its label gets a ($)
      // suffix so the tooltip notes the fallback.
      const pctMode = plMetric !== '$';
      const dA = plDenomFor(legs, data.expiry);
      const hasB = compareMode && data.expiryB && data.expiryB.length;
      const dB = hasB ? plDenomFor(legsB, data.expiryB) : 1;
      function scaleY(arr, d) { return d ? arr.map(function(y) { return y / d; }) : arr.slice(); }
      const exA = scaleY(data.expiry, dA), thA = scaleY(data.theoretical, dA);
      const exB = scaleY(data.expiryB, dB), thB = scaleY(data.theoreticalB, dB);
      chartDenomA = dA || 1; chartDenomB = dB || 1;
      chartModeA = (pctMode && dA) ? 'pct' : 'usd';
      chartModeB = (pctMode && dB) ? 'pct' : 'usd';
      const fbA = (pctMode && !dA) ? ' ($)' : '';
      const fbB = (pctMode && !dB) ? ' ($)' : '';
      // Shaded P/L regions between a payoff line and the $0 axis:
      // green where the line is above zero, red where below.
      // Each half is its own fill dataset (nulls break the fill at crossings).
      function shadePair(lineData, posColor, negColor) {
        const pos = new Array(lineData.length), neg = new Array(lineData.length);
        for (let i = 0; i < lineData.length; i++) {
          const y = lineData[i];
          pos[i] = (y != null && y > 0) ? y : null;
          neg[i] = (y != null && y < 0) ? y : null;
        }
        const common = {
          pointRadius: 0, hoverRadius: 0, borderWidth: 0, tension: 0,
          fill: 'origin', spanGaps: false, _shade: true,
          borderColor: 'rgba(0,0,0,0)'
        };
        return [
          Object.assign({ label: '', data: pos, backgroundColor: posColor }, common),
          Object.assign({ label: '', data: neg, backgroundColor: negColor }, common)
        ];
      }
      const gFill = 'rgba(46,229,111,0.16)', rFill = 'rgba(255,93,108,0.16)';
      const gFillSoft = 'rgba(46,229,111,0.08)', rFillSoft = 'rgba(255,93,108,0.08)';
      const vFill = 'rgba(167,139,250,0.10)';
      const sets = [].concat(
        shadePair(exA, gFill, rFill),
        [{
          label: (compareMode ? 'A · Payoff (Expiry)' : 'Payoff (Expiry)') + fbA,
          data: exA,
          _ymode: chartModeA,
          borderColor: gS,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          segment: { borderColor: function(ctx) { return segmentColor(ctx, gS, rS); } }
        }],
        shadePair(thA, gFillSoft, rFillSoft),
        [{
          label: (compareMode ? 'A · time left' : 'Theoretical (time left)') + fbA,
          data: thA,
          _ymode: chartModeA,
          borderColor: gD,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0,
          fill: false,
          segment: { borderColor: function(ctx) { return segmentColor(ctx, gD, rD); } }
        }]
      );
      if (hasB) {
        sets.push.apply(sets, [].concat(
          shadePair(exB, vFill, vFill),
          [{
            label: 'B · Payoff (Expiry)' + fbB,
            data: exB,
            _ymode: chartModeB,
            borderColor: bS,
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
            fill: false
          }],
          shadePair(thB, vFill, vFill),
          [{
            label: 'B · time left' + fbB,
            data: thB,
            _ymode: chartModeB,
            borderColor: bD,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0,
            fill: false
          }]
        ));
      }
      return sets;
    }

    function updateChart() {
      const data = buildChartData();
      const canvas = document.getElementById('payoffChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const tc = chartThemeColors();
      const wantSets = (compareMode && data.expiryB && data.expiryB.length) ? 12 : 6;

      if (chart && chart.data.datasets.length === wantSets) {
        chart.data.labels = data.labels;
        chart.data.datasets = payoffDatasets(data);
        // Item 4: keep the Y-axis title in sync with the $ / % mode.
        // (Guarded: Chart.js always resolves scales.y.title, but the
        // boot-test Chart stub does not.)
        if (chart.options.scales.y.title) chart.options.scales.y.title.text = yAxisTitle();
        if (chartZoom) {
          chart.options.scales.x.min = chartZoom.min;
          chart.options.scales.x.max = chartZoom.max;
        } else {
          delete chart.options.scales.x.min;
          delete chart.options.scales.x.max;
        }
        chart.update('none');
        bindChartGestures();
        return;
      }

      if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }

      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: payoffDatasets(data)
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: !!compareMode,
              labels: {
                color: tc.text, boxWidth: 10, font: { size: 11 },
                filter: function(item, data) {
                  const ds = data.datasets[item.datasetIndex];
                  return !(ds && ds._shade);
                }
              }
            },
            tooltip: {
              filter: function(ti) { return !(ti.dataset && ti.dataset._shade); },
              callbacks: {
                title: function(items) { return 'Underlying: $' + Number(items[0].label).toFixed(2); },
                label: function(c) {
                  if (c.dataset && c.dataset._ymode === 'pct') {
                    return c.dataset.label + ': ' + (c.parsed.y >= 0 ? '+' : '') + c.parsed.y.toFixed(1) + '%';
                  }
                  return c.dataset.label + ': $' + c.parsed.y.toFixed(0);
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Underlying ($)', color: tc.text },
              ticks: { color: tc.text, callback: function(v) { return '$' + v.toFixed(0); } },
              grid: { color: tc.grid }
            },
            y: {
              title: { display: true, text: yAxisTitle(), color: tc.text },
              ticks: { color: tc.text, callback: function(v) { return yTickFormat(v); } },
              grid: { color: tc.grid }
            }
          }
        },
        plugins: [crosshairPlugin, strikeMarkersPlugin, chartOverlaysPlugin]
      });
      bindChartGestures();
    }

    function formatMoney(val) {
      const abs = Math.abs(val);
      return (val < 0 ? '-' : '') + '$' + (abs >= 100 ? abs.toFixed(0) : abs.toFixed(2));
    }

    function cloneTemplateOptions() {
      const src = document.getElementById('strategyTemplate');
      const dst = document.getElementById('strategyTemplateB');
      if (!src || !dst || dst.options.length > 1) return;
      dst.innerHTML = src.innerHTML;
    }

    function defaultLongPut() {
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const leg = {
        id: nextIdB++,
        side: 'buy',
        type: 'put',
        strike: Math.round(S),
        dte: 90,
        qty: 1,
        premium: 5.00,
        premiumManual: false
      };
      leg.premium = modeledPremiumForLeg(leg, S);
      return [leg];
    }

    // Duplicate the current A position into slot B as an editable variant and
    // enter compare mode (OPC "Create new copy" equivalent). B keeps its own
    // copies (fresh ids) so edits to B never touch A.
    function duplicateToB() {
      if (!legs.length) return;
      legsB = legs.map(function (l) {
        const c = Object.assign({}, l);
        c.id = nextIdB++;
        return c;
      });
      const sel = document.getElementById('strategyTemplateB');
      if (sel) sel.value = '';
      const trig = document.getElementById('tplTriggerB');
      if (trig) {
        const lab = trig.querySelector('.tpl-trigger-label');
        if (lab) lab.textContent = 'Variant of A — custom';
      }
      if (!compareMode) {
        toggleCompareMode(); // renders B + recalcs; won't overwrite legsB
      } else {
        renderLegsB();
        recalc();
      }
    }

    function toggleCompareMode() {
      compareMode = !compareMode;
      document.body.classList.toggle('compare-on', compareMode);
      const btn = document.getElementById('compareToggleBtn');
      if (btn) {
        btn.classList.toggle('btn-toggle-on', compareMode);
        btn.textContent = compareMode ? 'Exit compare' : 'Compare two strategies';
      }
      const metrics = document.getElementById('compareMetrics');
      if (metrics) metrics.classList.toggle('on', compareMode);
      cloneTemplateOptions();
      if (compareMode && !legsB.length) {
        legsB = defaultLongPut();
        const sel = document.getElementById('strategyTemplateB');
        if (sel) sel.value = 'long_put';
        renderLegsB();
      }
      if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }
      recalc();
    }

    function applyTemplateB() {
      const key = document.getElementById('strategyTemplateB').value;
      const t = makeTemplateLegs(key);
      if (!t) return;
      legsB = t.map(function (leg) { return Object.assign({}, leg, { id: nextIdB++, premiumManual: false }); });
      refreshModeledPremiums(legsB);
      if (typeof applyChainQuotesToLegs === 'function') applyChainQuotesToLegs(legsB, { snapStrikes: true, setDte: true });
      renderLegsB();
      recalc();
    }

    function addEmptyLegB() {
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const draft = {
        id: nextIdB++,
        side: 'buy',
        type: 'put',
        strike: Math.round(S),
        dte: 90,
        qty: 1,
        premium: 3.00,
        premiumManual: false
      };
      draft.premium = modeledPremiumForLeg(draft, S);
      legsB.push(draft);
      renderLegsB();
      recalc();
    }

    function removeLegB(id) {
      legsB = legsB.filter(function (l) { return l.id !== id; });
      if (!legsB.length) legsB = defaultLongPut();
      renderLegsB();
      recalc();
    }

    function clearLegsB() {
      legsB = defaultLongPut();
      renderLegsB();
      recalc();
    }

    function updateLegFieldB(id, field, value, liveTyping) {
      const saved = legs;
      const savedRender = renderLegs;
      legs = legsB;
      renderLegs = function () {};
      updateLegField(id, field, value, true);
      legsB = legs;
      legs = saved;
      renderLegs = savedRender;
      if (!liveTyping) renderLegsB();
      recalc();
    }

    function renderLegsB() {
      const container = document.getElementById('legsListB');
      if (!container) return;
      const saved = legs;
      legs = legsB;
      renderLegs();
      container.innerHTML = document.getElementById('legsList').innerHTML
        .replace(/updateLegField\(/g, 'updateLegFieldB(')
        .replace(/removeLeg\(/g, 'removeLegB(');
      legs = saved;
      renderLegs();
    }

    // Structural check for unbounded tails: at very large underlying prices,
    // calls and stock move ~$1-for-$1 per share while puts expire worthless.
    // Only the right tail can be truly unbounded (prices cannot fall below
    // $0), so the left tail is always bounded. Returns $ of P/L per $1 move
    // at large S. This replaces the old chart-edge slope heuristic, which
    // wrongly flagged all-long positions (e.g. long puts) as "Unlimited" loss
    // and missed real unlimited risk (e.g. naked short calls).
    function rightTailSlope(legsArr) {
      let slope = 0;
      const list = legsArr || legs;
      for (let i = 0; i < list.length; i++) {
        const leg = list[i];
        if (leg.type === 'put') continue; // worthless at large S
        if (leg.type === 'call' || leg.type === 'stock') {
          slope += signedQty(leg) * legShareMult(leg);
        }
      }
      return slope;
    }

    // Max return on risk + capital at risk (tastytrade-style "return on
    // capital"). Defined-risk only: with an undefined-risk tail the margin
    // can't be modeled here, so both read '—'.
    function riskReturnStats(maxP, minP, tailSlope) {
      let rorText = '—', capText = '—';
      if (minP < 0) {
        if (tailSlope === 0 && maxP > 0) {
          rorText = (maxP / -minP * 100).toFixed(0) + '%';
          capText = formatMoney(-minP);
        } else if (tailSlope > 0) {
          rorText = '∞'; // unlimited upside, defined max loss
          capText = formatMoney(-minP);
        }
      }
      return { ror: rorText, cap: capText };
    }

    // ===== Round 2, Item 6: margin requirement estimates =====
    // Reg-T-style estimates, always labeled "est." — broker rules vary.
    // Rules:
    //  - all-long position  → margin = debit (cash)
    //  - every short covered (finite max loss) → margin = max loss
    //  - naked short call/put → (premium + 20%·S − OTM amount) per share,
    //    floored at (premium + 10%·S); × multiplier × contracts
    //  - short stock → 50% of notional
    //  - mixed → worst (max) of the applicable rules
    // Coverage is share-for-share: short calls ← long stock, then long calls
    // with strike ≤ short strike; short puts ← long puts with strike ≤ short
    // strike; short stock ← remaining long calls.
    function definedRiskMaxLoss(legsArr) {
      // Exact max loss for a defined-risk set of legs: the expiry payoff is
      // piecewise linear with kinks only at strikes, and (every short being
      // covered) neither tail runs to -∞, so the minimum is attained at a
      // strike or near zero.
      const list = legsArr || legs;
      const pts = [0.01];
      list.forEach(function(leg) {
        if (leg.type !== 'stock' && isFinite(leg.strike) && leg.strike > 0) pts.push(leg.strike);
      });
      let min = Infinity;
      pts.forEach(function(x) {
        const v = expiryPayoff(x, list);
        if (isFinite(v) && v < min) min = v;
      });
      if (min === Infinity) return 0;
      return Math.max(0, -min);
    }

    function estimateMargin() {
      if (!legs.length) return null;
      const S = getParams().S;
      if (!(S > 0)) return null;

      let longStock = 0, shortStockShares = 0;
      const longCalls = [], longPuts = [], shortCalls = [], shortPuts = [];
      legs.forEach(function(leg) {
        if (legIsIncomplete(leg)) return;
        const sq = signedQty(leg);
        if (sq === 0) return;
        const shares = Math.abs(sq) * legShareMult(leg);
        if (leg.type === 'stock') {
          if (sq > 0) longStock += shares; else shortStockShares += shares;
        } else if (sq > 0) {
          (leg.type === 'call' ? longCalls : longPuts).push({ strike: leg.strike, shares: shares });
        } else {
          (leg.type === 'call' ? shortCalls : shortPuts).push({ leg: leg, shares: shares });
        }
      });

      const hasShort = shortCalls.length > 0 || shortPuts.length > 0 || shortStockShares > 0;
      if (!hasShort) {
        return { amount: Math.max(0, initialCost(legs)), basis: 'cash — full debit' };
      }

      longCalls.sort(function(a, b) { return a.strike - b.strike; });
      longPuts.sort(function(a, b) { return a.strike - b.strike; });
      const nakedLegIds = {};
      const nakedContracts = []; // { leg, contracts } — uncovered remainder
      shortCalls.forEach(function(sc) {
        let need = sc.shares;
        const fromStock = Math.min(need, longStock);
        need -= fromStock; longStock -= fromStock;
        for (let i = 0; i < longCalls.length && need > 0; i++) {
          const lc = longCalls[i];
          if (lc.strike > sc.leg.strike || lc.shares <= 0) continue;
          const use = Math.min(need, lc.shares);
          need -= use; lc.shares -= use;
        }
        if (need > 0) {
          nakedLegIds[sc.leg.id] = true;
          nakedContracts.push({ leg: sc.leg, contracts: need / legShareMult(sc.leg) });
        }
      });
      shortPuts.forEach(function(sp) {
        let need = sp.shares;
        for (let i = 0; i < longPuts.length && need > 0; i++) {
          const lp = longPuts[i];
          if (lp.strike > sp.leg.strike || lp.shares <= 0) continue;
          const use = Math.min(need, lp.shares);
          need -= use; lp.shares -= use;
        }
        if (need > 0) {
          nakedLegIds[sp.leg.id] = true;
          nakedContracts.push({ leg: sp.leg, contracts: need / legShareMult(sp.leg) });
        }
      });
      let nakedStockShares = shortStockShares;
      for (let i = 0; i < longCalls.length && nakedStockShares > 0; i++) {
        const use = Math.min(nakedStockShares, longCalls[i].shares);
        nakedStockShares -= use; longCalls[i].shares -= use;
      }

      if (nakedContracts.length === 0 && nakedStockShares === 0) {
        return { amount: definedRiskMaxLoss(legs), basis: 'max loss (defined risk)' };
      }
      let m = 0;
      nakedContracts.forEach(function(nc) {
        const leg = nc.leg, K = leg.strike, prem = leg.premium || 0;
        const otm = leg.type === 'call' ? Math.max(K - S, 0) : Math.max(S - K, 0);
        const req = Math.max(prem + 0.20 * S - otm, prem + 0.10 * S);
        m += Math.max(0, req) * legShareMult(leg) * nc.contracts;
      });
      m += 0.5 * S * nakedStockShares;
      // Worst of the applicable rules: the covered legs can still lose up to
      // their own max loss, so take the max with that.
      const coveredLegs = legs.filter(function(l) { return !nakedLegIds[l.id]; });
      if (coveredLegs.length) m = Math.max(m, definedRiskMaxLoss(coveredLegs));
      return { amount: m, basis: 'Reg-T naked-short estimate' };
    }

    // ===== Round 2, Batch C: strategy discovery (optimizer lite + finder) ===
    // Both panels scan modeled candidates and Apply loads the pick into
    // legs A (with a confirm when legs already exist). Pricing is
    // Black-Scholes at per-strike chain IV when a chain is loaded, else the
    // global IV input on a synthetic grid. All stats are estimates.
    let optResults = [];   // last optimizer scan: [{fam,k1,k2,legs,label,st}]
    let findResults = [];  // last finder scan:    [{legs,label,st,score}]
    // Batch C fix: a ticker/chain change invalidates rendered discovery
    // results. These flags mark scans that must be re-run (new chain) or
    // cleared (manual-data mode) once the new market state settles.
    let discOptStale = false;
    let discFindStale = false;
    // Batch C fix: manual-data mode clears results but remembers a scan
    // existed, so the next chain load re-runs it instead of leaving a
    // stale "No chain" note under a loaded chain.
    let discOptHadScan = false;
    let discFindHadScan = false;
    // Batch C fix: whether the last scan priced off a loaded chain. A scan
    // run while a chain was still loading falls back to the synthetic grid;
    // when the chain arrives it is re-run against real quotes.
    let optUsedChain = false;
    let findUsedChain = false;

    // Strike universe + per-strike IV for a discovery scan.
    // Chain path: strikes within ±20% of spot on the chosen expiry, IV from
    // that strike's own chain quote (falls back to the global IV input).
    // No chain: synthetic grid, spot ±30% at ~1% steps, global IV.
    function discoveryUniverse(expStr, dteFallback) {
      const p = getParams();
      const S = p.S;
      const uni = {
        S: S,
        dte: Math.max(1, Math.round(dteFallback || 30)),
        expStr: expStr || '',
        strikes: [],
        usedChain: false,
        ivOf: function () { return p.iv; }
      };
      const data = window._cboeData;
      const chain = data && data.chains ? data.chains[expStr || ''] : null;
      if (chain && chain.strikes && chain.strikes.length) {
        uni.usedChain = true;
        uni.dte = Math.max(1, expirationDte(expStr));
        uni.strikes = chain.strikes.filter(function (k) { return k >= S * 0.8 && k <= S * 1.2; });
        uni.ivOf = function (type, strike) {
          const q = findChainContract(type, strike, expStr);
          const pct = quoteIvPct(q);
          return pct ? pct / 100 : p.iv;
        };
      } else {
        const step = Math.max(0.5, Math.round(S * 0.01 * 2) / 2);
        for (let k = Math.ceil(S * 0.7 / step) * step; k <= S * 1.3 + 1e-9; k += step) {
          uni.strikes.push(Math.round(k * 100) / 100);
        }
      }
      return uni;
    }

    function nearestGridStrike(strikes, x) {
      let best = strikes[0], bd = Infinity;
      for (let i = 0; i < strikes.length; i++) {
        const d = Math.abs(strikes[i] - x);
        if (d < bd) { bd = d; best = strikes[i]; }
      }
      return best;
    }

    // Modeled premium for a candidate leg (per-share, like leg.premium).
    function discoveryPremium(type, strike, uni) {
      const p = getParams();
      const iv = Math.max(0.01, uni.ivOf(type, strike) || p.iv);
      return blackScholes(uni.S, strike, Math.max(1, uni.dte) / 365, p.r, p.q, iv, type);
    }

    function discoveryLeg(side, type, strike, uni) {
      return {
        id: nextId++,
        side: side,
        type: type,
        strike: Math.round(strike * 100) / 100,
        dte: Math.max(1, Math.round(uni.dte)),
        qty: 1,
        premium: Math.max(0.01, Math.round(discoveryPremium(type, strike, uni) * 100) / 100),
        premiumManual: true,
        ticker: currentTicker()
      };
    }

    // Family recipes. k1 < k2 are the two grid strikes.
    function buildFamilyLegs(family, k1, k2, uni) {
      const out = [];
      function mk(side, type, k) { out.push(discoveryLeg(side, type, k, uni)); }
      if (family === 'bullcall') { mk('buy', 'call', k1); mk('sell', 'call', k2); }
      else if (family === 'bearput') { mk('buy', 'put', k2); mk('sell', 'put', k1); }
      else if (family === 'bullput') { mk('sell', 'put', k2); mk('buy', 'put', k1); }
      else if (family === 'bearcall') { mk('sell', 'call', k1); mk('buy', 'call', k2); }
      else if (family === 'strangle') { mk('buy', 'put', k1); mk('buy', 'call', k2); }
      return out;
    }

    // Exact expiry-P/L extrema for a candidate: the payoff is piecewise
    // linear with kinks only at strikes, so min/max are attained at a strike
    // or near zero, or on an unbounded tail.
    function candidateStats(legsArr) {
      const pts = [0.01];
      legsArr.forEach(function (l) { if (isFinite(l.strike) && l.strike > 0) pts.push(l.strike); });
      let min = Infinity, max = -Infinity;
      pts.forEach(function (x) {
        const v = expiryPayoff(x, legsArr);
        if (!isFinite(v)) return;
        if (v < min) min = v;
        if (v > max) max = v;
      });
      const rs = rightTailSlope(legsArr);
      let ls = 0; // left-tail slope: calls flatten; puts move -signedQty*mult per $1
      legsArr.forEach(function (l) { if (l.type === 'put') ls -= signedQty(l) * legShareMult(l); });
      if (rs > 0) max = Infinity; else if (rs < 0) min = -Infinity;
      if (ls > 0) max = Infinity; else if (ls < 0) min = -Infinity;
      if (min === Infinity) min = 0;
      if (max === -Infinity) max = 0;
      const maxLoss = min < 0 ? -min : 0;
      const maxProfit = max > 0 ? max : 0;
      const net = initialCost(legsArr);
      let roc = null;
      if (maxLoss > 0) roc = (maxProfit === Infinity) ? Infinity : maxProfit / maxLoss;
      return { net: net, maxProfit: maxProfit, maxLoss: maxLoss, roc: roc, pop: popOf(legsArr) };
    }

    function familyLabel(fam) {
      return fam === 'bullcall' ? 'Bull call' : fam === 'bearput' ? 'Bear put'
        : fam === 'bullput' ? 'Bull put' : fam === 'bearcall' ? 'Bear call' : 'Long strangle';
    }

    function fmtStatMoney(v) {
      if (v === Infinity) return 'Unlimited';
      return formatMoney(v);
    }
    function fmtRoc(roc) {
      if (roc == null || !isFinite(roc)) return roc === Infinity ? '∞' : '—';
      return (roc * 100).toFixed(0) + '%';
    }
    function fmtPop(pop) {
      return (pop == null || !isFinite(pop)) ? '—' : (pop * 100).toFixed(0) + '%';
    }
    function fmtNet(net) {
      if (net > 0.005) return 'Debit ' + formatMoney(net);
      if (net < -0.005) return 'Credit ' + formatMoney(-net);
      return '$0';
    }

    // ---- Item 7: optimizer lite -------------------------------------------
    function runOptimizerScan() {
      syncDiscoveryExpiries();
      const fam = document.getElementById('optFamily').value;
      const goal = document.getElementById('optGoal').value;
      const S = getParams().S;
      let target = parseFloat(document.getElementById('optTarget').value);
      if (!(target > 0)) target = S;
      const expStr = document.getElementById('optExpiry').value;
      const dteInput = document.getElementById('optDte');
      const uni = discoveryUniverse(expStr, dteInput ? parseFloat(dteInput.value) : 30);
      const box = document.getElementById('optResults');
      optResults = [];
      optUsedChain = !!uni.usedChain;
      if (uni.strikes.length < 2) {
        box.innerHTML = '<p class="disc-empty">Not enough strikes to scan — load an options chain first.</p>';
        return;
      }
      const widths = [0.01, 0.02, 0.03].map(function (w) { return Math.max(0.5, Math.round(S * w * 2) / 2); });
      const seen = {};
      const cands = [];
      for (let i = 0; i < uni.strikes.length; i++) {
        const k1 = uni.strikes[i];
        for (let w = 0; w < widths.length; w++) {
          const k2 = nearestGridStrike(uni.strikes, k1 + widths[w]);
          if (!(k2 > k1)) continue;
          const key = k1 + '|' + k2;
          if (seen[key]) continue;
          seen[key] = true;
          // Mild directional filter so the scan doesn't surface structures
          // that are dead at the target price.
          if (fam === 'bullcall' && target <= k1) continue;
          if (fam === 'bearput' && target >= k2) continue;
          if (fam === 'bullput' && target <= k1) continue;
          if (fam === 'bearcall' && target >= k2) continue;
          if (fam === 'strangle' && target > k1 && target < k2) continue;
          const legsArr = buildFamilyLegs(fam, k1, k2, uni);
          const st = candidateStats(legsArr);
          if (!isFinite(st.net)) continue;
          cands.push({ fam: fam, k1: k1, k2: k2, legs: legsArr, label: familyLabel(fam) + ' ' + k1 + '/' + k2, st: st });
        }
      }
      function score(c) {
        if (goal === 'roc') return c.st.roc == null ? -Infinity : c.st.roc;
        if (goal === 'pop') return c.st.pop == null ? -Infinity : c.st.pop;
        return c.st.maxProfit; // Infinity sorts first for the strangle
      }
      cands.sort(function (a, b) { return score(b) - score(a); });
      optResults = cands.slice(0, 5);
      renderOptimizerResults();
    }

    function renderOptimizerResults() {
      const box = document.getElementById('optResults');
      if (!optResults.length) {
        box.innerHTML = '<p class="disc-empty">No candidates for these inputs — try a different family or target.</p>';
        return;
      }
      let h = '<table class="pl-table"><thead><tr><th style="text-align:left">Structure</th><th>Net</th><th>Max profit</th><th>Max loss</th><th>ROC</th><th>POP</th><th></th></tr></thead><tbody>';
      optResults.forEach(function (c, i) {
        h += '<tr><td style="text-align:left">' + c.label + '</td>' +
          '<td>' + fmtNet(c.st.net) + '</td>' +
          '<td>' + fmtStatMoney(c.st.maxProfit) + '</td>' +
          '<td>' + fmtStatMoney(c.st.maxLoss) + '</td>' +
          '<td>' + fmtRoc(c.st.roc) + '</td>' +
          '<td>' + fmtPop(c.st.pop) + '</td>' +
          '<td><button type="button" class="btn-primary btn-sm" onclick="applyDiscoveryLegs(\'opt\',' + i + ')">Apply</button></td></tr>';
      });
      box.innerHTML = h + '</tbody></table><p class="disc-note">est. stats · Apply replaces legs A</p>';
    }

    // ---- Item 8: option finder --------------------------------------------
    function runFinder() {
      syncDiscoveryExpiries();
      const dir = document.getElementById('findDir').value; // auto | long | short
      const S = getParams().S;
      let target = parseFloat(document.getElementById('findTarget').value);
      if (!(target > 0)) target = S;
      const capRaw = parseFloat(document.getElementById('findCap').value);
      const cap = capRaw > 0 ? capRaw : Infinity;
      const expStr = document.getElementById('findExpiry').value;
      const dteInput = document.getElementById('findDte');
      const uni = discoveryUniverse(expStr, dteInput ? parseFloat(dteInput.value) : 30);
      const box = document.getElementById('findResults');
      findResults = [];
      findUsedChain = !!uni.usedChain;
      if (uni.strikes.length < 2) {
        box.innerHTML = '<p class="disc-empty">Not enough strikes to scan — load an options chain first.</p>';
        return;
      }
      const cands = [];
      const seen = {};
      function consider(legsArr, label) {
        const st = candidateStats(legsArr);
        if (!isFinite(st.net)) return;
        if (st.maxLoss > cap) return;
        if (dir === 'long' && !(st.net > 0.005)) return;
        if (dir === 'short' && !(st.net < -0.005)) return;
        const key = label;
        if (seen[key]) return;
        seen[key] = true;
        cands.push({ legs: legsArr, label: label, st: st, score: expiryPayoff(target, legsArr) });
      }
      // Singles near the expected price (±10% of target, at least 3 strikes).
      const nearT = uni.strikes.filter(function (k) { return Math.abs(k - target) <= target * 0.10; });
      const singleStrikes = nearT.length >= 3 ? nearT : uni.strikes.slice(0, 12);
      singleStrikes.forEach(function (k) {
        consider([discoveryLeg('buy', 'call', k, uni)], 'Long call ' + k);
        consider([discoveryLeg('buy', 'put', k, uni)], 'Long put ' + k);
        consider([discoveryLeg('sell', 'call', k, uni)], 'Short call ' + k);
        consider([discoveryLeg('sell', 'put', k, uni)], 'Short put ' + k);
      });
      // Vertical spreads, widths 1–3% of spot.
      const widths = [0.01, 0.02, 0.03].map(function (w) { return Math.max(0.5, Math.round(S * w * 2) / 2); });
      for (let i = 0; i < uni.strikes.length; i++) {
        const k1 = uni.strikes[i];
        for (let w = 0; w < widths.length; w++) {
          const k2 = nearestGridStrike(uni.strikes, k1 + widths[w]);
          if (!(k2 > k1)) continue;
          consider(buildFamilyLegs('bullcall', k1, k2, uni), 'Bull call ' + k1 + '/' + k2);
          consider(buildFamilyLegs('bearput', k1, k2, uni), 'Bear put ' + k1 + '/' + k2);
          consider(buildFamilyLegs('bullput', k1, k2, uni), 'Bull put ' + k1 + '/' + k2);
          consider(buildFamilyLegs('bearcall', k1, k2, uni), 'Bear call ' + k1 + '/' + k2);
        }
      }
      // Rank by profit at the expected price, tiebreak by POP.
      cands.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        const pa = a.st.pop == null ? -1 : a.st.pop, pb = b.st.pop == null ? -1 : b.st.pop;
        return pb - pa;
      });
      findResults = cands.slice(0, 5);
      findResults.forEach(function (c) { c.profitAtTarget = c.score; });
      renderFinderResults(target);
    }

    function renderFinderResults(target) {
      const box = document.getElementById('findResults');
      if (!findResults.length) {
        box.innerHTML = '<p class="disc-empty">No candidates under these filters — loosen the max-loss cap or direction.</p>';
        return;
      }
      let h = '<table class="pl-table"><thead><tr><th style="text-align:left">Structure</th><th>Cost</th><th>P/L @ ' + formatMoney(target) + '</th><th>POP</th><th>Max loss</th><th></th></tr></thead><tbody>';
      findResults.forEach(function (c, i) {
        h += '<tr><td style="text-align:left">' + c.label + '</td>' +
          '<td>' + fmtNet(c.st.net) + '</td>' +
          '<td class="' + (c.profitAtTarget >= 0 ? 'pv-pos' : 'pv-neg') + '">' + formatMoney(c.profitAtTarget) + '</td>' +
          '<td>' + fmtPop(c.st.pop) + '</td>' +
          '<td>' + fmtStatMoney(c.st.maxLoss) + '</td>' +
          '<td><button type="button" class="btn-primary btn-sm" onclick="applyDiscoveryLegs(\'find\',' + i + ')">Apply</button></td></tr>';
      });
      box.innerHTML = h + '</tbody></table><p class="disc-note">est. stats · Apply replaces legs A</p>';
    }

    // Apply a discovery candidate into legs A.
    function applyDiscoveryLegs(which, i) {
      const arr = which === 'opt' ? optResults : findResults;
      const c = arr[i];
      if (!c) return;
      if (legs.length && typeof confirm === 'function' && !confirm('Replace the current legs in slot A with "' + c.label + '"?')) return;
      markBuildDirty();
      legs = c.legs;
      syncDTESlider();
      updateSpotSliderRange();
      renderLegs();
      recalc();
      if (typeof resetSimulation === 'function') resetSimulation();
    }

    // Populate the target-expiry selects from the loaded chain; without a
    // chain they offer a modeled-DTE fallback input instead.
    function syncDiscoveryExpiries() {      const data = window._cboeData;
      const exps = (data && data.expirations) || [];
      [['optExpiry', 'optDteWrap'], ['findExpiry', 'findDteWrap']].forEach(function (cfg) {
        const sel = document.getElementById(cfg[0]);
        const wrap = document.getElementById(cfg[1]);
        if (!sel) return;
        const keep = sel.value;
        sel.innerHTML = '';
        if (exps.length) {
          exps.forEach(function (exp) {
            const opt = document.createElement('option');
            opt.value = exp;
            const d = expirationDte(exp);
            opt.textContent = exp + (d ? ' (' + d + 'd)' : '');
            sel.appendChild(opt);
          });
          const prefer = (keep && exps.indexOf(keep) >= 0) ? keep : pickDefaultExpiration(exps, 30, true);
          if (prefer) sel.value = prefer;
          if (wrap) wrap.style.display = 'none';
        } else {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No chain — model DTE';
          sel.appendChild(opt);
          if (wrap) wrap.style.display = '';
        }
      });
    }

    // Init the expiry selects at engine boot (chain hook refreshes them later).
    try {
      if (typeof document !== 'undefined' && document.getElementById('optExpiry')) syncDiscoveryExpiries();
      if (typeof document !== 'undefined' && typeof syncRollLegs === 'function') { syncRollLegs(); }
    } catch (e) {}

    // Batch C fix: settle discovery panels after a ticker/chain change. The
    // expiry selects always refresh; scans the user already ran are re-run
    // against the new chain so the tables follow the new ticker instead of
    // showing the old one's strikes. A scan that ran on the synthetic grid
    // while the chain was still loading is also upgraded to real quotes, and
    // a scan cleared by an intermediate no-chain ticker is re-run too.
    // Panels that never had a scan get a stale "No chain" note cleared back
    // to the default prompt. No-op otherwise.
    function resolveDiscoveryStale() {
      if (typeof syncDiscoveryExpiries === 'function') syncDiscoveryExpiries();
      if (typeof syncRollExpiries === 'function') { try { syncRollExpiries(); } catch (e) {} }
      if (discOptStale || discOptHadScan || (optResults.length && !optUsedChain)) {
        discOptStale = false; discOptHadScan = false;
        try { runOptimizerScan(); } catch (e) {}
      } else {
        clearNoChainNote('optResults', 'Pick a family and scan — the top 5 by your goal appear here.');
      }
      if (discFindStale || discFindHadScan || (findResults.length && !findUsedChain)) {
        discFindStale = false; discFindHadScan = false;
        try { runFinder(); } catch (e) {}
      } else {
        clearNoChainNote('findResults', 'Enter where you think the price goes — the top 5 by profit at target appear here.');
      }
    }

    // Batch C fix: a "No chain for this ticker" note written by manual-data
    // mode is stale once a chain loads — restore the default empty prompt.
    function clearNoChainNote(boxId, defaultText) {
      var box = document.getElementById(boxId);
      if (box && box.innerHTML.indexOf('No chain for this ticker') >= 0) {
        box.innerHTML = '<p class="disc-empty">' + defaultText + '</p>';
      }
    }

    // ---- Item 9: roll analyzer (slim, educational) -------------------------
    // Models closing one leg and reopening it at a new strike/expiry: the net
    // debit/credit of the roll plus the before/after risk picture. Pure
    // what-if — nothing here places a trade.
    let lastRoll = null;
    // Two-step inline confirm (no native confirm() dialog: those are invisible
    // to automated browsers and to anyone who dismisses popups, which made
    // "Apply roll" look like a no-op in QA). First click arms, second applies.
    let rollArmed = false;

    function rollLegLabel(l) {
      const side = l.side === 'buy' ? 'Buy' : 'Sell';
      const type = l.type === 'call' ? 'call' : 'put';
      return side + ' ' + type + ' ' + l.strike + ' (' + l.dte + 'd)';
    }

    function rollSelectedLeg() {
      const sel = document.getElementById('rollLeg');
      if (!sel || sel.value === '' || sel.value == null) return null;
      const l = legs[parseInt(sel.value, 10)];
      return (l && l.type !== 'stock') ? l : null;
    }

    function syncRollLegs() {
      const sel = document.getElementById('rollLeg');
      if (!sel) return;
      const keep = sel.value;
      sel.innerHTML = '';
      const idxs = [];
      legs.forEach(function (l, i) {
        if (l.type === 'stock') return;
        idxs.push(i);
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = rollLegLabel(l);
        sel.appendChild(opt);
      });
      if (idxs.indexOf(parseInt(keep, 10)) >= 0) sel.value = keep;
      else if (idxs.length) sel.value = String(idxs[0]);
      else sel.value = '';
      onRollLegChange(true);
    }

    // Nearest chain expiration to a leg's DTE — legs store DTE, not an expiry
    // date, so the close side is quoted off the closest listed expiry.
    function nearestExpiryForDte(dte) {
      const data = window._cboeData;
      const exps = (data && data.expirations) || [];
      let best = '', bestDiff = Infinity;
      exps.forEach(function (exp) {
        const diff = Math.abs(expirationDte(exp) - dte);
        if (diff < bestDiff) { bestDiff = diff; best = exp; }
      });
      return best;
    }

    function syncRollExpiries() {
      const sel = document.getElementById('rollExpiry');
      if (!sel) return;
      const wrap = document.getElementById('rollDteWrap');
      const data = window._cboeData;
      const exps = (data && data.expirations) || [];
      const leg = rollSelectedLeg();
      const keep = sel.value;
      sel.innerHTML = '';
      if (!exps.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No chain — modeled';
        sel.appendChild(opt);
        if (wrap) wrap.style.display = '';
        return;
      }
      if (wrap) wrap.style.display = 'none';
      exps.forEach(function (exp) {
        const opt = document.createElement('option');
        opt.value = exp;
        const d = expirationDte(exp);
        opt.textContent = exp + (d ? ' (' + d + 'd)' : '');
        sel.appendChild(opt);
      });
      let prefer = (keep && exps.indexOf(keep) >= 0) ? keep : '';
      if (!prefer && leg) {
        // Nearest later expiry first — buying time is the usual motive.
        let best = '', bestD = Infinity;
        exps.forEach(function (exp) {
          const d = expirationDte(exp);
          if (d > leg.dte && d - leg.dte < bestD) { bestD = d - leg.dte; best = exp; }
        });
        prefer = best || pickDefaultExpiration(exps, 30, true);
      }
      if (!prefer) prefer = pickDefaultExpiration(exps, 30, true);
      if (prefer) sel.value = prefer;
    }

    // Default the new-strike input to the selected leg's strike; the expiry
    // select follows unless the user already picked one (keepExpiry).
    function onRollLegChange(keepExpiry) {
      const leg = rollSelectedLeg();
      const strikeEl = document.getElementById('rollStrike');
      if (leg && strikeEl && !keepExpiry) strikeEl.value = leg.strike;
      const sel = document.getElementById('rollExpiry');
      const hadPick = keepExpiry && sel && sel.value;
      if (!hadPick) syncRollExpiries();
    }

    // Per-share close/open quote for a roll. Closing a long sells at the bid,
    // closing a short buys at the ask; opening mirrors it. Falls back to the
    // mid, then to a Black-Scholes model quote (per-strike chain IV, else the
    // global IV input).
    function rollQuote(type, strike, expStr, legDte, action, side) {
      const q = findChainContract(type, strike, expStr);
      let px = NaN, src = '';
      if (q) {
        const b = Number(q.bid), a = Number(q.ask);
        const wantBid = (action === 'close') === (side === 'buy');
        if (wantBid && b > 0) { px = b; src = 'bid'; }
        else if (!wantBid && a > 0) { px = a; src = 'ask'; }
        else {
          const m = midPrice(q);
          if (m > 0) { px = m; src = 'mid'; }
        }
      }
      if (!(px > 0)) {
        const uni = discoveryUniverse(expStr, legDte);
        px = discoveryPremium(type, strike, uni);
        src = uni.usedChain ? 'modeled @ chain IV' : 'modeled';
      }
      return { px: px, src: src };
    }

    // Pure computation behind modelRoll — kept DOM-free for testing.
    function computeRoll(oldLeg, newStrike, newExpStr, newDte) {
      const mult = legShareMult(oldLeg) * oldLeg.qty;
      const closeExp = nearestExpiryForDte(oldLeg.dte);
      const closeQ = rollQuote(oldLeg.type, oldLeg.strike, closeExp, oldLeg.dte, 'close', oldLeg.side);
      const openQ = rollQuote(oldLeg.type, newStrike, newExpStr, newDte, 'open', oldLeg.side);
      // Cash flow per share: long → +close − open; short → −close + open.
      // Negative = net debit (you pay to roll), positive = net credit.
      const perShare = oldLeg.side === 'buy' ? closeQ.px - openQ.px : openQ.px - closeQ.px;
      const netCash = perShare * mult;
      const newLeg = {
        id: nextId++,
        side: oldLeg.side,
        type: oldLeg.type,
        strike: Math.round(newStrike * 100) / 100,
        dte: Math.max(1, Math.round(newDte)),
        qty: oldLeg.qty,
        premium: Math.max(0.01, Math.round(openQ.px * 100) / 100),
        premiumManual: true,
        ticker: oldLeg.ticker || currentTicker()
      };
      return {
        closeQ: closeQ, openQ: openQ, perShare: perShare, netCash: netCash,
        newLeg: newLeg,
        modeled: closeQ.src.indexOf('model') === 0 || openQ.src.indexOf('model') === 0
      };
    }

    // Expiry-payoff breakevens by sign-change scan (mirrors summarizeExpiry).
    function breakevensOf(legsArr) {
      const strikes = legsArr.filter(function (l) { return l.type !== 'stock'; })
        .map(function (l) { return l.strike; });
      const hi = Math.max.apply(null, [10].concat(strikes)) * 3;
      const bes = [];
      let prevX = 0.01, prevY = expiryPayoff(0.01, legsArr);
      for (let i = 1; i <= 400; i++) {
        const x = hi * i / 400;
        const y = expiryPayoff(x, legsArr);
        if (prevY === 0) bes.push(prevX);
        else if (y === 0) bes.push(x);
        else if ((prevY < 0) !== (y < 0)) bes.push(prevX - prevY * (x - prevX) / (y - prevY));
        prevX = x; prevY = y;
      }
      return bes;
    }

    function fmtBesList(bes) {
      return bes.length ? bes.map(function (b) { return '$' + b.toFixed(1); }).join(' / ') : '—';
    }

    function modelRoll() {
      syncRollLegs();
      rollArmed = false; // a fresh model always disarms a pending confirm
      disarmRollPaint();
      const box = document.getElementById('rollResults');
      if (!box) return;
      const leg = rollSelectedLeg();
      const strikeEl = document.getElementById('rollStrike');
      const newStrike = strikeEl ? parseFloat(strikeEl.value) : NaN;
      const expSel = document.getElementById('rollExpiry');
      const newExp = expSel ? expSel.value : '';
      const dteEl = document.getElementById('rollDte');
      if (!leg) {
        box.innerHTML = '<p class="disc-empty">Add an option leg above first — there is nothing to roll.</p>';
        lastRoll = null; return;
      }
      if (!(newStrike > 0)) {
        box.innerHTML = '<p class="disc-empty">Enter a new strike to model the roll.</p>';
        lastRoll = null; return;
      }
      const newDte = newExp ? expirationDte(newExp)
        : Math.max(1, Math.round(parseFloat(dteEl && dteEl.value) || leg.dte));
      if (Math.abs(newStrike - leg.strike) < 1e-9 && Math.abs(newDte - leg.dte) < 1) {
        box.innerHTML = '<p class="disc-empty">That is the same strike and expiry — a roll moves at least one of them.</p>';
        lastRoll = null; return;
      }
      const r = computeRoll(leg, newStrike, newExp, newDte);
      const afterLegs = legs.map(function (l) { return l === leg ? r.newLeg : l; });
      const before = candidateStats(legs);
      const after = candidateStats(afterLegs);
      lastRoll = { legId: leg.id, newLeg: r.newLeg };
      const debit = r.netCash < -0.005, credit = r.netCash > 0.005;
      const dirWord = debit ? 'Debit' : credit ? 'Credit' : 'Even';
      const dirCls = debit ? 'var(--red)' : credit ? 'var(--green)' : 'var(--text)';
      function row(lbl, b, a) {
        return '<tr><td style="text-align:left">' + lbl + '</td><td>' + b + '</td><td>' + a + '</td></tr>';
      }
      let h = '<p style="font-size:0.82rem;margin:0 0 6px">Roll <b>' + rollLegLabel(leg) + '</b> → <b>' + rollLegLabel(r.newLeg) + '</b></p>';
      h += '<p style="font-size:0.82rem;margin:0 0 6px">Close at ' + formatMoney(r.closeQ.px) +
        ' <span style="color:var(--muted)">(' + r.closeQ.src + ')</span> · open at ' + formatMoney(r.openQ.px) +
        ' <span style="color:var(--muted)">(' + r.openQ.src + ')</span> → ' +
        '<b style="color:' + dirCls + '">' + dirWord + ' ' + formatMoney(Math.abs(r.netCash)) + '</b></p>';
      h += '<table class="pl-table"><thead><tr><th style="text-align:left"></th><th>Before</th><th>After roll</th></tr></thead><tbody>';
      h += row('Net cost', fmtNet(before.net), fmtNet(after.net));
      h += row('Max profit', fmtStatMoney(before.maxProfit), fmtStatMoney(after.maxProfit));
      h += row('Max loss', fmtStatMoney(before.maxLoss), fmtStatMoney(after.maxLoss));
      h += row('Breakeven', fmtBesList(breakevensOf(legs)), fmtBesList(breakevensOf(afterLegs)));
      h += row('Chance of profit', fmtPop(before.pop), fmtPop(after.pop));
      h += '</tbody></table>';
      if (r.modeled) h += '<p class="disc-note">Modeled prices — no chain quote for one or both sides.</p>';
      h += '<p style="margin:6px 0 0"><button type="button" class="btn-primary btn-sm" id="rollApplyBtn" onclick="applyRoll()">Apply roll</button> ' +
        '<span class="disc-note" id="rollApplyCap">Swaps the leg above for the rolled one.</span></p>';
      box.innerHTML = h;
    }

    // Repaints the apply button/caption for the disarmed state (no-ops if the
    // results box was re-rendered and the nodes are gone).
    function disarmRollPaint() {
      const btn = document.getElementById('rollApplyBtn');
      if (btn) btn.textContent = 'Apply roll';
      const cap = document.getElementById('rollApplyCap');
      if (cap) cap.textContent = 'Swaps the leg above for the rolled one.';
    }
    // Any form change cancels a pending "Confirm roll" so the armed button can
    // never apply a model the user has already edited away from. The model is
    // re-rendered from the new inputs so the display always matches what a
    // fresh "Apply roll" would do — no stale table beside an armed button.
    function disarmRollQuiet() {
      if (!rollArmed) return;
      rollArmed = false;
      modelRoll();
    }
    function disarmRoll() { disarmRollQuiet(); }
    function applyRoll() {
      if (!lastRoll) return;
      if (!rollArmed) {
        // First click arms — an inline, visible confirm. (A native confirm()
        // dialog proved invisible to automated browsers in QA, making Apply
        // look like a no-op.)
        rollArmed = true;
        const btn = document.getElementById('rollApplyBtn');
        if (btn) btn.textContent = 'Confirm roll';
        const cap = document.getElementById('rollApplyCap');
        if (cap) cap.innerHTML = 'Click again to swap the leg. <button type="button" class="btn-sm" style="margin-left:6px" onclick="disarmRoll()">Cancel</button>';
        return;
      }
      rollArmed = false;
      disarmRollPaint();
      const box = document.getElementById('rollResults');
      // Re-resolve the leg by id and recompute from the CURRENT form inputs,
      // so a leg edited (or removed) after modeling can't silently apply a
      // stale quote — the applied roll always matches what's on screen now.
      const idx = legs.findIndex(function (l) { return l.id === lastRoll.legId; });
      if (idx < 0) {
        lastRoll = null;
        if (box) box.innerHTML = '<p class="disc-empty">That leg is gone — model the roll again.</p>';
        return;
      }
      const leg = legs[idx];
      const strikeEl = document.getElementById('rollStrike');
      const expEl = document.getElementById('rollExpiry');
      const newStrike = strikeEl ? parseFloat(strikeEl.value) : NaN;
      if (!isFinite(newStrike) || newStrike <= 0) {
        lastRoll = null;
        if (box) box.innerHTML = '<p class="disc-empty">Enter a new strike to model the roll.</p>';
        return;
      }
      let newExpStr = expEl ? expEl.value : '';
      let newDte = leg.dte;
      if (newExpStr) newDte = Math.max(1, expirationDte(newExpStr));
      else newDte = parseInt((document.getElementById('rollDte') || {}).value, 10) || leg.dte;
      if (Math.abs(newStrike - leg.strike) < 1e-9 && newDte === leg.dte) {
        lastRoll = null;
        if (box) box.innerHTML = '<p class="disc-empty">That is the same strike and expiry — a roll moves at least one of them.</p>';
        return;
      }
      const r = computeRoll(leg, newStrike, newExpStr, newDte);
      markBuildDirty();
      legs[idx] = r.newLeg;
      lastRoll = null;
      if (typeof syncDTESlider === 'function') syncDTESlider();
      updateSpotSliderRange();
      renderLegs();
      recalc();
      if (typeof resetSimulation === 'function') resetSimulation();
      syncRollLegs();
      if (box) {
        const dir = r.netCash >= 0 ? 'Credit' : 'Debit';
        box.innerHTML = '<p class="disc-note" style="color:var(--green)">Rolled to ' + escapeHtml(rollLegLabel(r.newLeg)) +
          ' — ' + dir + ' ' + formatMoney(Math.abs(r.netCash)) + '.</p>' +
          '<p class="disc-empty">Model another roll above, or tweak the legs.</p>';
      }
    }

    function summarizeExpiry(expiry, labels, legsArr) {
      if (!expiry || !expiry.length) return { maxProfit: '—', maxLoss: '—', breakevens: '—', beNums: [], ror: '—', cap: '—' };
      const maxP = Math.max.apply(null, expiry);
      const minP = Math.min.apply(null, expiry);
      let maxProfitText = formatMoney(maxP);
      let maxLossText = formatMoney(minP);
      const tail = rightTailSlope(legsArr);
      if (tail > 0) maxProfitText = 'Unlimited';
      else if (tail < 0) maxLossText = 'Unlimited';
      const bes = [];
      for (let i = 1; i < expiry.length; i++) {
        if (expiry[i - 1] * expiry[i] <= 0) {
          const x0 = labels[i - 1], x1 = labels[i];
          const y0 = expiry[i - 1], y1 = expiry[i];
          if (Math.abs(y1 - y0) > 1e-9) {
            bes.push((x0 - y0 * (x1 - x0) / (y1 - y0)).toFixed(1));
          }
        }
      }
      const rr = riskReturnStats(maxP, minP, tail);
      return {
        maxProfit: maxProfitText,
        maxLoss: maxLossText,
        breakevens: bes.length ? bes.map(function (b) { return '$' + b; }).join(' / ') : '—',
        beNums: bes.map(Number),
        ror: rr.ror,
        cap: rr.cap
      };
    }

    function setNetLabel(el, net) {
      if (!el) return;
      if (net > 0) {
        el.textContent = 'Debit ' + formatMoney(net);
        el.style.color = 'var(--red)';
      } else if (net < 0) {
        el.textContent = 'Credit ' + formatMoney(Math.abs(net));
        el.style.color = 'var(--green)';
      } else {
        el.textContent = '$0';
        el.style.color = 'var(--text)';
      }
    }

    function updateComparePanel(data, params) {
      if (!compareMode) return;
      const S = params.S;
      const daysLeft = params.daysLeft;
      const plB = legsB.length ? plAt(S, daysLeft, legsB) : 0;
      const plEl = document.getElementById('plValueB');
      if (plEl) {
        plEl.textContent = (plB >= 0 ? '+' : '') + formatMoney(plB);
        plEl.className = 's-val pl-value ' + (plB >= 0 ? 'pl-positive' : 'pl-negative');
      }
      setNetLabel(document.getElementById('netPremiumB'), legsB.length ? initialCost(legsB) : 0);
      const sumB = summarizeExpiry(data.expiryB, data.labels, legsB);
      const mp = document.getElementById('maxProfitB');
      const ml = document.getElementById('maxLossB');
      const be = document.getElementById('breakevensB');
      if (mp) { mp.textContent = sumB.maxProfit; mp.classList.remove('pos', 'neg'); if (sumB.maxProfit !== '—') mp.classList.add('pos'); }
      if (ml) { ml.textContent = sumB.maxLoss; ml.classList.remove('pos', 'neg'); if (sumB.maxLoss !== '—') ml.classList.add('neg'); }
      if (be) be.textContent = sumB.breakevens;
      const rorB = document.getElementById('maxReturnRiskB');
      const capB = document.getElementById('capitalAtRiskB');
      if (rorB) rorB.textContent = sumB.ror;
      if (capB) capB.textContent = sumB.cap;
      currentBreakevensB = sumB.beNums || [];

      const sumA = summarizeExpiry(data.expiry, data.labels, legs);
      const colA = document.getElementById('compareColA');
      const colB = document.getElementById('compareColB');
      const plA = plAt(S, daysLeft, legs);
      if (colA) {
        colA.innerHTML = '<h3>Strategy A · Underlying $' + S.toFixed(2) + '</h3>' +
          'P/L now ' + formatMoney(plA) + '<br>Max profit ' + sumA.maxProfit +
          '<br>Max loss ' + sumA.maxLoss + '<br>Return on risk ' + sumA.ror +
          '<br>Break-Even ' + sumA.breakevens;
      }
      if (colB) {
        colB.innerHTML = '<h3>Strategy B · Underlying $' + S.toFixed(2) + '</h3>' +
          'P/L now ' + formatMoney(plB) + '<br>Max profit ' + sumB.maxProfit +
          '<br>Max loss ' + sumB.maxLoss + '<br>Return on risk ' + sumB.ror +
          '<br>Break-Even ' + sumB.breakevens;
      }
    }

    function exportPayoffImage() {
      if (!chart) updateChart();
      if (!chart) return;
      try {
        const url = chart.toBase64Image('image/png', 1);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'jsm-payoff-' + new Date().toISOString().slice(0, 10) + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        alert('This browser cannot export the chart.');
      }
    }

    function resetChartGestures() {
      // Double-tap clears pinch/pan zoom and returns to the Range slider's
      // locked window (±20% default) around the current spot.
      onRangeChange();
      recalc();
    }

    function bindChartGestures() {
      const wrap = document.getElementById('chartContainer');
      if (!wrap || chartGesturesBound) return;
      chartGesturesBound = true;
      let pointers = {};
      let lastPinch = null;
      let lastPanX = null;
      let lastTap = 0;

      function pointerList() {
        return Object.keys(pointers).map(function (k) { return pointers[k]; });
      }
      function dist(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      function priceAtClientX(clientX) {
        if (!chart || !chart.scales || !chart.scales.x) return null;
        const rect = wrap.getBoundingClientRect();
        const x = clientX - rect.left;
        return chart.scales.x.getValueForPixel(x);
      }

      // Hit-test: is the pointer grabbing a leg's strike marker?
      function strikeAtClientXY(clientX, clientY) {
        if (!chart || !chart.scales || !chart.scales.x || !chart.chartArea) return null;
        const area = chart.chartArea;
        const rect = wrap.getBoundingClientRect();
        const x = clientX - rect.left, y = clientY - rect.top;
        if (y < area.top - 4 || y > area.bottom + 4) return null;
        let best = null, bestDist = 18; // px grab radius
        for (let i = 0; i < legs.length; i++) {
          const leg = legs[i];
          if (!leg || leg.type === 'stock' || !isFinite(leg.strike)) continue;
          const px = chart.scales.x.getPixelForValue(leg.strike);
          const d = Math.abs(px - x);
          if (d < bestDist) { bestDist = d; best = leg; }
        }
        return best;
      }

      wrap.addEventListener('pointerdown', function (e) {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        lastPanX = e.clientX;
        wrap.setPointerCapture(e.pointerId);
        // Grabbing a strike marker starts a strike-drag instead of a price scrub.
        if (Object.keys(pointers).length === 1 && chart) {
          const hit = strikeAtClientXY(e.clientX, e.clientY);
          if (hit) {
            const orig = {};
            legs.forEach(function (l) { if (l && l.type !== 'stock' && isFinite(l.strike)) orig[l.id] = l.strike; });
            strikeDrag = { legId: hit.id, startStrike: hit.strike, orig: orig, legIds: [hit.id], moved: false };
            lastTap = 0; // grabbing a strike never double-tap-resets the zoom
            return;
          }
        }
        const now = Date.now();
        if (now - lastTap < 280 && Object.keys(pointers).length === 1) {
          resetChartGestures();
          lastTap = 0;
        } else {
          lastTap = now;
        }
      });
      wrap.addEventListener('pointermove', function (e) {
        if (!pointers[e.pointerId]) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        const pts = pointerList();
        // Strike-drag: move the grabbed leg's strike (Shift = move all
        // option strikes together, OptionStrat-style).
        if (strikeDrag && pts.length === 1) {
          const price = priceAtClientX(e.clientX);
          if (price && isFinite(price) && price > 0) {
            const S = parseFloat(document.getElementById('spot').value) || 100;
            const newStrike = snapStrike(price, S);
            const delta = newStrike - strikeDrag.startStrike;
            if (delta !== 0) {
              const moveAll = !!e.shiftKey;
              const ids = moveAll
                ? Object.keys(strikeDrag.orig).map(Number)
                : [strikeDrag.legId];
              strikeDrag.legIds = ids;
              ids.forEach(function (id) {
                const leg = legs.find(function (l) { return l.id === id; });
                if (!leg) return;
                leg.strike = snapStrike(strikeDrag.orig[id] + delta, S);
              });
              strikeDrag.moved = true;
              renderLegs();
              recalc();
            }
          }
          return;
        }
        if (pts.length >= 2) {
          const d = dist(pts[0], pts[1]);
          if (lastPinch && lastPinch > 0 && chart) {
            const scale = d / lastPinch;
            const xScale = chart.scales.x;
            const mid = (xScale.min + xScale.max) / 2;
            let span = (xScale.max - xScale.min) / scale;
            span = Math.max(4, Math.min(span, (parseFloat(document.getElementById('spot').value) || 100) * 3));
            chartZoom = { min: Math.max(0.5, mid - span / 2), max: mid + span / 2 };
            rangeZoomActive = false;
            const midClient = (pts[0].x + pts[1].x) / 2;
            if (lastPanX != null) {
              const p0 = priceAtClientX(lastPanX);
              const p1 = priceAtClientX(midClient);
              if (p0 != null && p1 != null) {
                const shift = p0 - p1;
                chartZoom.min += shift;
                chartZoom.max += shift;
              }
            }
            lastPanX = midClient;
            updateChart();
          }
          lastPinch = d;
        } else if (pts.length === 1) {
          const price = priceAtClientX(e.clientX);
          if (price && isFinite(price) && price > 0) {
            document.getElementById('spot').value = price.toFixed(2);
            const sl = document.getElementById('spotSlider');
            if (sl) sl.value = price;
            recalc();
          }
        }
      });
      function endPtr(e) {
        delete pointers[e.pointerId];
        if (Object.keys(pointers).length < 2) lastPinch = null;
        if (!Object.keys(pointers).length) {
          lastPanX = null;
          if (strikeDrag) { strikeDrag = null; recalc(); }
        }
      }
      wrap.addEventListener('pointerup', endPtr);
      wrap.addEventListener('pointercancel', endPtr);
      wrap.addEventListener('pointerleave', function (e) {
        if (pointers[e.pointerId]) endPtr(e);
      });
    }


    function paintPL(el, val) {
      if (!el) return;
      el.textContent = (val >= 0 ? '+' : '') + formatMoney(val);
      el.style.color = val >= 0 ? 'var(--green)' : 'var(--red)';
      el.classList.remove('pl-positive', 'pl-negative');
      el.classList.add(val >= 0 ? 'pl-positive' : 'pl-negative');
    }

    function paintNetPremium(el, net) {
      if (!el) return;
      if (net > 0) {
        el.textContent = 'Debit ' + formatMoney(net);
        el.style.color = 'var(--red)';
      } else if (net < 0) {
        el.textContent = 'Credit ' + formatMoney(Math.abs(net));
        el.style.color = 'var(--green)';
      } else {
        el.textContent = '$0';
        el.style.color = 'var(--text)';
      }
    }

    function templateExpirySeries(key) {
      const raw = makeTemplateLegs(key);
      if (!raw) return null;
      const S = parseFloat(document.getElementById('spot').value) || 100;
      const strikes = raw.filter(function (l) { return l.type !== 'stock'; }).map(function (l) { return l.strike; });
      const lo = Math.max(1, Math.min(S, strikes.length ? Math.min.apply(null, strikes) : S) * 0.72);
      const hi = Math.max(S, strikes.length ? Math.max.apply(null, strikes) : S) * 1.28;
      const n = 48;
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const x = lo + i / (n - 1) * (hi - lo);
        xs.push(x);
        ys.push(expiryPayoff(x, raw));
      }
      return { xs: xs, ys: ys, lo: lo, hi: hi };
    }

    function miniPayoffSVG(ys, w, h) {
      if (!ys || !ys.length) return '';
      const pad = 3;
      let minY = Math.min.apply(null, ys.concat([0]));
      let maxY = Math.max.apply(null, ys.concat([0]));
      if (maxY - minY < 1) { maxY += 1; minY -= 1; }
      const span = maxY - minY;
      function X(i) { return pad + i / (ys.length - 1) * (w - pad * 2); }
      function Y(v) { return pad + (1 - (v - minY) / span) * (h - pad * 2); }
      const z = Y(0);
      let d = '';
      let pos = '', neg = '';
      for (let i = 0; i < ys.length; i++) {
        const cmd = i ? 'L' : 'M';
        d += cmd + X(i).toFixed(1) + ' ' + Y(ys[i]).toFixed(1) + ' ';
      }
      let areaG = '', areaR = '';
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i], y1 = ys[i + 1];
        const x0 = X(i), x1 = X(i + 1);
        if (y0 >= 0 && y1 >= 0) {
          areaG += 'M' + x0 + ' ' + z + ' L' + x0 + ' ' + Y(y0) + ' L' + x1 + ' ' + Y(y1) + ' L' + x1 + ' ' + z + ' Z ';
        } else if (y0 <= 0 && y1 <= 0) {
          areaR += 'M' + x0 + ' ' + z + ' L' + x0 + ' ' + Y(y0) + ' L' + x1 + ' ' + Y(y1) + ' L' + x1 + ' ' + z + ' Z ';
        }
      }
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<line x1="0" y1="' + z.toFixed(1) + '" x2="' + w + '" y2="' + z.toFixed(1) + '" stroke="currentColor" opacity="0.2"/>' +
        '<path d="' + areaG + '" fill="rgba(34,197,94,.28)"/>' +
        '<path d="' + areaR + '" fill="rgba(239,68,68,.28)"/>' +
        '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>';
    }

    function bindTemplatePicker(selectId, popId, triggerId) {
      const sel = document.getElementById(selectId);
      const pop = document.getElementById(popId);
      const trigger = document.getElementById(triggerId);
      if (!sel || !pop || pop.getAttribute('data-bound') === '1') return;
      pop.setAttribute('data-bound', '1');
      const listBox = pop.querySelector('.tpl-groups');
      const peek = pop.querySelector('.tpl-peek');
      sel.classList.add('tpl-native');
      sel.setAttribute('tabindex', '-1');
      sel.setAttribute('aria-hidden', 'true');

      function currentLabel() {
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.value) return opt.textContent;
        return document.documentElement.lang === 'tr' ? '— Şablon seçin —' : '— Pick a Strategy —';
      }
      function syncTrigger() {
        if (!trigger) return;
        const lab = trigger.querySelector('.tpl-trigger-label');
        if (lab) lab.textContent = currentLabel();
      }
      function groups() {
        const out = [];
        let cur = { label: '', items: [] };
        Array.from(sel.options).forEach(function (opt) {
          if (!opt.value) return;
          const label = (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') ? opt.parentElement.label : '';
          if (label !== cur.label) { if (cur.items.length) out.push(cur); cur = { label: label, items: [] }; }
          cur.items.push({ value: opt.value, text: opt.textContent });
        });
        if (cur.items.length) out.push(cur);
        return out;
      }
      function showPeek(key, name) {
        const series = templateExpirySeries(key);
        const title = peek.querySelector('.tpl-peek-name');
        const chart = peek.querySelector('.tpl-peek-chart');
        const note = peek.querySelector('.tpl-peek-note');
        if (title) title.textContent = name || key;
        if (chart) chart.innerHTML = series ? miniPayoffSVG(series.ys, 160, 88) : '';
        if (note) note.textContent = (document.documentElement.lang === 'tr')
          ? 'Expiry Payoff · gezinerek bakın · tıklayınca yüklenir'
          : 'Expiry Payoff · hover to preview · click to load';
      }
      function isTouchPicker() {
        try {
          return window.matchMedia('(hover: none), (pointer: coarse)').matches && window.innerWidth < 900;
        } catch (e) {
          return window.innerWidth < 720;
        }
      }
      function renderList(activeKey) {
        const touch = isTouchPicker();
        pop.classList.toggle('tpl-touch', touch);
        listBox.innerHTML = groups().map(function (g) {
          return '<div><div class="tpl-g-label">' + g.label + '</div>' +
            g.items.map(function (it) {
              const on = it.value === activeKey ? ' active' : '';
              const spark = touch ? (function () {
                const series = templateExpirySeries(it.value);
                return series ? miniPayoffSVG(series.ys, 84, 32) : '';
              })() : '';
              return '<button type="button" class="tpl-item' + on + '" data-key="' + it.value + '"><span>' + it.text +
                '</span>' + spark + '</button>';
            }).join('') + '</div>';
        }).join('');
      }
      function placePop() {
        const host = trigger || sel;
        const r = host.getBoundingClientRect();
        const vw = window.innerWidth;
        const narrow = vw < 720;
        if (narrow) {
          pop.style.position = 'fixed';
          pop.style.left = '10px';
          pop.style.right = '30px';
          pop.style.top = 'auto';
          pop.style.bottom = '10px';
          pop.style.width = 'auto';
          pop.style.minWidth = '0';
          pop.style.maxWidth = 'none';
        } else {
          pop.style.position = 'absolute';
          pop.style.left = '0';
          pop.style.right = 'auto';
          pop.style.top = 'calc(100% + 6px)';
          pop.style.bottom = 'auto';
          pop.style.width = 'auto';
          pop.style.minWidth = Math.max(r.width, 420) + 'px';
          pop.style.maxWidth = 'min(560px, calc(100vw - 24px))';
        }
      }
      function openPop() {
        renderList(sel.value);
        placePop();
        pop.classList.add('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        const key = sel.value || (sel.options[1] && sel.options[1].value);
        if (key) {
          const opt = sel.querySelector('option[value="' + key + '"]');
          showPeek(key, opt ? opt.textContent : key);
        }
      }
      function closePop() {
        pop.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
      if (trigger) {
        trigger.addEventListener('click', function (e) {
          e.preventDefault();
          if (pop.classList.contains('open')) closePop(); else openPop();
        });
      }
      pop.addEventListener('mouseover', function (e) {
        const btn = e.target.closest('.tpl-item');
        if (!btn) return;
        pop.querySelectorAll('.tpl-item').forEach(function (b) { b.classList.toggle('active', b === btn); });
        showPeek(btn.getAttribute('data-key'), btn.querySelector('span').textContent);
      });
      pop.addEventListener('click', function (e) {
        const btn = e.target.closest('.tpl-item');
        if (!btn) return;
        sel.value = btn.getAttribute('data-key');
        syncTrigger();
        closePop();
        sel.dispatchEvent(new Event('change'));
      });
      document.addEventListener('click', function (e) {
        if (!pop.classList.contains('open')) return;
        if (pop.contains(e.target) || (trigger && trigger.contains(e.target))) return;
        closePop();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePop();
      });
      sel.addEventListener('change', syncTrigger);
      syncTrigger();
    }

    function initTemplatePreviews() {
      if (!HAS_LEGS) return;
      bindTemplatePicker('strategyTemplate', 'tplPopover', 'tplTrigger');
      bindTemplatePicker('strategyTemplateB', 'tplPopoverB', 'tplTriggerB');
    }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTemplatePreviews);
    else initTemplatePreviews();

    function liveUpdate() {
      updateSpotSliderRange();
      if (refreshAllModeledPremiums()) {
        if (typeof renderLegs === 'function') renderLegs();
        if (typeof renderLegsB === 'function' && compareMode) renderLegsB();
      }
      recalc();
    }

    // Manual spot entry asserts a new current price, so it re-anchors the ±1σ
    // expected-move band. The Underlying slider writes to the same field via
    // onSpotSlide(), which deliberately does NOT re-anchor — the slider is a
    // what-if scenario tool, not a price assertion.
    function onSpotInput() {
      const v = parseFloat(document.getElementById('spot').value);
      if (v > 0) emAnchorSpot = v;
      // Builder has the Underlying slider + chain UI: full live update.
      // Simulator has neither, so a plain recalc suffices there.
      if (document.getElementById('spotSlider')) liveUpdate();
      else recalc();
    }

    // ===== Round 2 item 1: Price×date P&L data table =====
    // View toggle (chart/table) + value mode ($ / % of max risk / % of entry cost).
    // The table reuses plAt()/initialCost() so it always agrees with the chart.
    // NOTE: recalc() is rewritten wholesale by partition.py (M3), so the table
    // refreshes via the post-recalc wrapper after updateGreeksUI() below —
    // never by editing recalc() itself.
    let chartView = 'chart'; // 'chart' | 'table'
    let plMetric = '$';      // '$' | 'risk' | 'cost'

    function setChartView(v) {
      chartView = v;
      const cb = document.getElementById('viewChartBtn');
      const tb = document.getElementById('viewTableBtn');
      if (cb) cb.classList.toggle('active', v === 'chart');
      if (tb) tb.classList.toggle('active', v === 'table');
      const cc = document.getElementById('chartContainer');
      const tw = document.getElementById('plTableWrap');
      const note = document.getElementById('plTableNote');
      const gh = document.querySelector('.gesture-hint');
      if (cc) cc.style.display = v === 'chart' ? '' : 'none';
      if (tw) tw.style.display = v === 'table' ? '' : 'none';
      if (note) note.style.display = v === 'table' ? '' : 'none';
      if (gh) gh.style.display = v === 'chart' ? '' : 'none';
      if (v === 'table') renderPlTable();
    }

    function setPlMetric(m) {
      plMetric = m;
      const btns = document.querySelectorAll('[data-plmetric]');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-plmetric') === m);
      }
      // Item 4: the $ / % risk / % cost mode drives the payoff chart Y-axis
      // as well as the P&L table.
      if (typeof updateChart === 'function') updateChart();
      if (chartView === 'table') renderPlTable();
    }

    // Denominator for % modes, per position. null => the mode is undefined
    // for this position (chart falls back to dollars for it; table shows '—').
    // % of max risk needs a bounded loss: tail < 0 means the right tail
    // loses without bound (e.g. naked short call) -> null. tail >= 0 covers
    // defined-risk spreads AND long-only positions (long call/put, long
    // stock) whose max loss is the debit paid. Computed lazily from the
    // same buildChartData() recalc() uses, so the table/chart can never
    // disagree with the stat strip.
    function riskDenomFor(legsArr, expiryArr) {
      if (rightTailSlope(legsArr) < 0) return null;
      if (!expiryArr || !expiryArr.length) return null;
      const minP = Math.min.apply(null, expiryArr);
      return minP < 0 ? -minP : null;
    }
    function costDenomFor(legsArr) {
      const c = Math.abs(initialCost(legsArr));
      return c > 0 ? c : null;
    }
    // Effective denominator for one position under the current plMetric.
    // '$' => 1 (dollars). null => this position falls back to dollars.
    function plDenomFor(legsArr, expiryArr) {
      if (plMetric === 'risk') return riskDenomFor(legsArr, expiryArr);
      if (plMetric === 'cost') return costDenomFor(legsArr);
      return 1;
    }
    // Table denominator (position A). Kept as the single entry point so the
    // P&L table and the chart always share the same definition.
    function plMetricDenom() {
      if (plMetric === '$') return 1;
      const data = buildChartData();
      return plDenomFor(legs, data.expiry);
    }

    function formatPlMetric(v) {
      if (!isFinite(v)) return '—';
      if (plMetric === '$') {
        const a = Math.abs(v);
        return (v < 0 ? '-' : (v > 0 ? '+' : '')) + '$' + (a >= 100 ? a.toFixed(0) : a.toFixed(2));
      }
      const d = plMetricDenom();
      if (!(d > 0)) return '—';
      const pct = v / d * 100;
      if (!isFinite(pct)) return '—';
      return (pct > 0 ? '+' : '') + pct.toFixed(0) + '%';
    }

    // Same X window the payoff chart uses, so rows line up with the chart.
    function chartXWindowA() {
      const params = getParams();
      const S = params.S;
      const anchor = (typeof chartRefSpot === 'number' && chartRefSpot > 0) ? chartRefSpot : S;
      const strikes = collectStrikes(legs);
      const base = strikes.length ? strikes : [anchor];
      let lo = Math.min(anchor * 0.65, Math.min.apply(null, base) * 0.65);
      let hi = Math.max(anchor * 1.45, Math.max.apply(null, base) * 1.45);
      if (typeof chartZoom !== 'undefined' && chartZoom && chartZoom.min > 0 && chartZoom.max > chartZoom.min) {
        lo = chartZoom.min; hi = chartZoom.max;
      }
      if (!(hi > lo)) { lo = anchor * 0.7; hi = anchor * 1.3; }
      return { lo: lo, hi: hi };
    }

    function renderPlTable() {
      const tbl = document.getElementById('plTable');
      if (!tbl) return;
      if (!legs.length) {
        tbl.innerHTML = '<tbody><tr><td style="padding:16px;color:var(--muted)">Add a leg to see the P&L table.</td></tr></tbody>';
        return;
      }
      const params = getParams();
      const S = params.S;
      const win = chartXWindowA();
      const ROWS = 11, COLS = 6;
      let minDte = 0;
      for (let i = 0; i < legs.length; i++) {
        const d = legs[i].dte;
        if (legs[i].type !== 'stock' && isFinite(d) && d > 0) minDte = minDte ? Math.min(minDte, d) : d;
      }
      minDte = Math.max(0, Math.round(minDte));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const colDefs = [];
      for (let j = 0; j < COLS; j++) {
        const f = j / (COLS - 1); // 0 = today … 1 = expiry
        const dl = Math.round(minDte * (1 - f));
        const elapsed = minDte - dl;
        const dt = new Date(today.getTime() + elapsed * 86400000).toISOString().slice(0, 10);
        colDefs.push({
          daysLeft: dl,
          head: j === 0 ? 'Today' : (j === COLS - 1 ? 'Expiry' : 'D-' + dl),
          sub: dt
        });
      }
      let html = '<thead><tr><th>Price</th>';
      for (let j = 0; j < colDefs.length; j++) {
        html += '<th>' + colDefs[j].head + '<br><span style="font-weight:400;text-transform:none;letter-spacing:0">' + colDefs[j].sub + '</span></th>';
      }
      html += '</tr></thead><tbody>';
      const prices = [];
      let spotRow = 0, best = Infinity;
      for (let i = 0; i < ROWS; i++) {
        const p = win.hi - (win.hi - win.lo) * (i / (ROWS - 1)); // high → low
        prices.push(p);
        const dd = Math.abs(p - S);
        if (dd < best) { best = dd; spotRow = i; }
      }
      for (let i = 0; i < ROWS; i++) {
        const p = prices[i];
        const pctMove = S > 0 ? (p - S) / S * 100 : 0;
        const vals = colDefs.map(function(c) { return plAt(p, c.daysLeft, legs); });
        let mx = 0;
        for (let j = 0; j < vals.length; j++) if (isFinite(vals[j])) mx = Math.max(mx, Math.abs(vals[j]));
        html += '<tr' + (i === spotRow ? ' class="spot-row"' : '') + '><th>$' + p.toFixed(1) +
          ' <span style="color:var(--muted);font-weight:400">(' + (pctMove >= 0 ? '+' : '') + pctMove.toFixed(0) + '%)</span></th>';
        for (let j = 0; j < vals.length; j++) {
          const v = vals[j];
          const cls = !isFinite(v) ? '' : (v > 0.005 ? 'pv-pos' : (v < -0.005 ? 'pv-neg' : ''));
          const be = isFinite(v) && Math.abs(v) < 1 ? ' be' : '';
          const alpha = mx > 0 && isFinite(v) ? Math.min(0.8, Math.abs(v) / mx * 0.8) : 0;
          const bg = v > 0 ? 'background:rgba(34,197,94,' + alpha.toFixed(2) + ');'
                   : (v < 0 ? 'background:rgba(239,68,68,' + alpha.toFixed(2) + ');' : '');
          html += '<td class="' + (cls + be).trim() + '" style="' + bg + '">' + formatPlMetric(v) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody>';
      tbl.innerHTML = html;
      const note = document.getElementById('plTableModeNote');
      if (note) note.textContent = 'mode: ' + (plMetric === '$' ? 'dollars' : (plMetric === 'risk' ? '% of max risk' : '% of entry cost'));
    }

    function recalc() {
      try { if (typeof updateShareUrlQuiet === "function") { /* share updated on button only */ } } catch (e) {}

      if (!legs.length) return;
      const params = getParams();
      const S = params.S;
      const daysLeft = params.daysLeft;
      const pl = plAt(S, daysLeft);
      const expPl = expiryPayoff(S);
      const net = initialCost();

      if (HAS_PAYOFF) {
        paintPL(document.getElementById('plValue'), pl);
        paintPL(document.getElementById('plExpiry'), expPl);
        paintNetPremium(document.getElementById('netPremium'), net);

        const data = buildChartData();
        const maxP = Math.max.apply(null, data.expiry);
        const minP = Math.min.apply(null, data.expiry);
        let maxProfitText = formatMoney(maxP);
        let maxLossText = formatMoney(minP);
        const tailSlope = rightTailSlope(legs);
        if (tailSlope > 0) maxProfitText = 'Unlimited';
        else if (tailSlope < 0) maxLossText = 'Unlimited';
        setText('maxProfit', maxProfitText);
        setText('maxLoss', maxLossText);
        const rrA = riskReturnStats(maxP, minP, tailSlope);
        // Stat-tile colors: profit green, loss red.
        var mpEl = document.getElementById('maxProfit');
        if (mpEl) { mpEl.classList.remove('pos', 'neg'); if (maxProfitText !== '—') mpEl.classList.add('pos'); }
        var mlEl = document.getElementById('maxLoss');
        if (mlEl) { mlEl.classList.remove('pos', 'neg'); if (maxLossText !== '—') mlEl.classList.add('neg'); }
        var capTileEl = document.getElementById('capitalAtRisk');
        if (capTileEl) { capTileEl.classList.remove('pos', 'neg', 'warn'); if (rrA.cap !== '—') capTileEl.classList.add('warn'); }
        // Chance of profit (lognormal estimate at nearest expiry).
        var cpEl = document.getElementById('chanceProfit');
        if (cpEl) {
          var popV = (typeof probOfProfit === 'function') ? probOfProfit() : null;
          cpEl.classList.remove('pos', 'neg', 'warn');
          if (popV == null || !isFinite(popV)) { cpEl.textContent = '—'; }
          else {
            cpEl.textContent = (popV * 100).toFixed(0) + '%';
            cpEl.classList.add(popV >= 0.5 ? 'pos' : (popV >= 0.3 ? 'warn' : 'neg'));
          }
        }
        const rorEl = document.getElementById('maxReturnRisk');
        const capEl = document.getElementById('capitalAtRisk');
        if (rorEl) rorEl.textContent = rrA.ror;
        if (capEl) capEl.textContent = rrA.cap;

        const bes = [];
        for (let i = 1; i < data.expiry.length; i++) {
          if (data.expiry[i - 1] * data.expiry[i] <= 0) {
            const x0 = data.labels[i - 1], x1 = data.labels[i];
            const y0 = data.expiry[i - 1], y1 = data.expiry[i];
            if (Math.abs(y1 - y0) > 1e-9) {
              bes.push((x0 - y0 * (x1 - x0) / (y1 - y0)).toFixed(1));
            }
          }
        }
        // Deduplicate: exact-zero samples can repeat the same level.
        const seenBE = {};
        const uniqBEs = bes.filter(function (b) { if (seenBE[b]) return false; seenBE[b] = 1; return true; });
        setText('breakevens', uniqBEs.length ? uniqBEs.map(function(b) { return '$' + b; }).join(' / ') : '—');
        currentBreakevens = uniqBEs.map(Number);
        setText('spotLabel', '$' + S.toFixed(2));
        setText('daysLeftLabel', daysLeft);

        crosshairS = S;
        crosshairPL = pl;
        updateChart();
        updateComparePanel(data, params);
      }

      if (HAS_GREEKS) updateGreeksUI();
      updateEduTip();

      if (HAS_SIM) {
        paintPL(document.getElementById('posExpiryPL'), expPl);
        paintNetPremium(document.getElementById('posNetPremium'), net);
        if (simHistory.length) {
          updateSimReadout();
          updateSimButtonsState();
          updatePositionSummary();
        }
      }
    }


    function updateGreeksUI() {
      if (!document.getElementById('gDelta')) return;
      if (!legs.length) {
        document.getElementById('gDelta').textContent = '—';
        document.getElementById('gGamma').textContent = '—';
        document.getElementById('gTheta').textContent = '—';
        document.getElementById('gVega').textContent = '—';
        document.getElementById('gRho').textContent = '—';
        return;
      }
      const g = positionGreeks();
      const fmt = function(x, d) {
        const n = (d === undefined) ? 2 : d;
        const s = x >= 0 ? '+' : '';
        return s + x.toFixed(n);
      };
      document.getElementById('gDelta').textContent = fmt(g.delta, 1);
      document.getElementById('gGamma').textContent = fmt(g.gamma, 2);
      document.getElementById('gTheta').textContent = fmt(g.theta, 1);
      document.getElementById('gVega').textContent = fmt(g.vega, 1);
      document.getElementById('gRho').textContent = fmt(g.rho, 1);

      // Impact blurbs (plain English)
      const d = g.delta;
      const th = g.theta;
      const vg = g.vega;
      const rh = g.rho;
      document.getElementById('gDeltaImpact').textContent =
        d > 5 ? 'Bullish tilt: if Underlying rises $1, P/L ≈ $' + Math.abs(d).toFixed(0) + ' increases.'
        : d < -5 ? 'Bearish tilt: if Underlying drops $1, P/L ≈ $' + Math.abs(d).toFixed(0) + ' increases.'
        : 'Near delta-neutral: a small price move has little directional P/L.';
      document.getElementById('gGammaImpact').textContent =
        Math.abs(g.gamma) > 1
          ? 'High Gamma: Delta shifts fast when Underlying moves — P/L can accelerate.'
          : 'Low Gamma: on small price moves Delta stays relatively stable.';
      document.getElementById('gThetaImpact').textContent =
        th < -5 ? 'Time against you: about $' + Math.abs(th).toFixed(0) + ' of Theta decay expected.'
        : th > 5 ? 'Time in your favor: about $' + Math.abs(th).toFixed(0) + ' of Theta expected.'
        : 'Daily Theta is small at these settings.';
      document.getElementById('gVegaImpact').textContent =
        vg > 5 ? 'Long volatility: +1% IV adds about $' + Math.abs(vg).toFixed(0) + '.'
        : vg < -5 ? 'Short volatility: +1% IV is about $' + Math.abs(vg).toFixed(0) + ' of loss; you profit if IV falls.'
        : 'Low Vega: IV moves matter little right now.';
      document.getElementById('gRhoImpact').textContent =
        rh > 5 ? 'Rates help: +1% rates adds about $' + Math.abs(rh).toFixed(0) + '.'
        : rh < -5 ? 'Rates hurt: +1% rates costs about $' + Math.abs(rh).toFixed(0) + '.'
        : 'Low Rho: rate moves matter little right now.';
    }

    // ===== Round 2: post-recalc hooks live here, NOT inside recalc() =====
    // partition.py (build step M3) replaces recalc() wholesale with a
    // section-guarded copy, so anything added inside the monolith's recalc()
    // would be silently dropped from the built site. Wrap it instead.
    const _recalcOrigR2 = recalc;
    recalc = function() {
      _recalcOrigR2.apply(null, arguments);
      try {
        // Item 1: keep the P&L data table in sync when legs/params change.
        if (typeof chartView !== 'undefined' && chartView === 'table') renderPlTable();
      } catch (e) { /* table refresh must never break recalc */ }
      try {
        // Item 3: snapshot recent builds (builder page only; debounced 1.5s).
        if (document.getElementById('legsList')) scheduleRecentSave();
      } catch (e) {}
      try {
        // Item 5: keep price slices in sync — auto-prefill ±1σ until the
        // user customizes; chips refresh every recalc without stealing
        // input focus (builder page only).
        if (document.getElementById('priceSlicesWrap')) refreshSlices();
      } catch (e) {}
      try {
        // Item 6: estimated margin tile (builder page only).
        const mEl = document.getElementById('estMargin');
        if (mEl) {
          const m = estimateMargin();
          if (m && isFinite(m.amount)) {
            mEl.textContent = formatMoney(m.amount) + ' est.';
            mEl.title = m.basis + ' — Reg-T-style estimate; your broker\u2019s rules vary.';
          } else {
            mEl.textContent = '—';
            mEl.title = '';
          }
        }
      } catch (e) {}
    };

    function onDaysChange() {
      document.getElementById('daysLeftLabel').textContent = document.getElementById('daysLeft').value;
      recalc();
    }

    function onSpotSlide() {
      const v = parseFloat(document.getElementById('spotSlider').value);
      document.getElementById('spot').value = v.toFixed(1);
      document.getElementById('spotLabel').textContent = '$' + v.toFixed(2);
      // Range slider locks the X window: keep it fixed while the price marker
      // travels inside it; recenter only if the price would leave the window.
      if (rangeZoomActive && chartZoom && (v < chartZoom.min || v > chartZoom.max)) applyRangeZoom(v);
      recalc();
    }

    function applyRangeZoom(S) {
      const pct = parseFloat(document.getElementById('chartRange').value) || 20;
      const r = pct / 100;
      chartZoom = { min: Math.max(0.01, S * (1 - r)), max: S * (1 + r) };
    }

    function onRangeChange() {
      const pct = parseFloat(document.getElementById('chartRange').value) || 20;
      const lbl = document.getElementById('rangeLabel');
      if (lbl) lbl.textContent = '±' + pct + '%';
      rangeZoomActive = true;
      const S = parseFloat(document.getElementById('spot').value) || 100;
      applyRangeZoom(S);
      updateChart();
    }

    function resetTime() {
      document.getElementById('daysLeft').value = maxDTE;
      document.getElementById('daysLeftLabel').textContent = maxDTE;
      recalc();
    }

    async function animateTheta() {
      if (animating || !legs.length) return;
      animating = true;
      const slider = document.getElementById('daysLeft');
      let current = parseInt(slider.value, 10);
      while (current > 0 && animating) {
        current -= 1;
        slider.value = current;
        document.getElementById('daysLeftLabel').textContent = current;
        recalc();
        await new Promise(function(r) { setTimeout(r, 220); });
      }
      animating = false;
    }

    function randomWalk() {
      let S = parseFloat(document.getElementById('spot').value);
      const iv = (parseFloat(document.getElementById('iv').value) || 25) / 100;
      const shock = (Math.random() * 2 - 1) * (iv / Math.sqrt(365)) * S * 2.5;
      S = Math.max(1, S + shock);
      document.getElementById('spot').value = S.toFixed(1);
      document.getElementById('spotSlider').value = S;
      document.getElementById('spotLabel').textContent = '$' + S.toFixed(2);
      recalc();
    }

    // ---------- Stock Price Simulator (educational random walk) ----------
    let simHistory = [];
    let simDayIndex = 0;
    let simPLLog = [];

    function simRandn() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function simGenCandle(openPrice, annualVol, annualDrift) {
      const dt = 1 / 365;
      const z = simRandn();
      let jump = 0;
      if (Math.random() < 0.08) jump = (Math.random() - 0.5) * annualVol * openPrice * 0.6;
      const ds = openPrice * (annualDrift * dt + annualVol * Math.sqrt(dt) * z) + jump;
      const close = Math.max(Math.round((openPrice + ds) * 100) / 100, 1);
      const intraVol = annualVol * Math.sqrt(dt) * openPrice;
      const highExtra = Math.abs(simRandn()) * intraVol * 0.8;
      const lowExtra = Math.abs(simRandn()) * intraVol * 0.8;
      const high = Math.round(Math.max(openPrice, close, openPrice + highExtra) * 100) / 100;
      const low = Math.round(Math.max(1, Math.min(openPrice, close, openPrice - lowExtra)) * 100) / 100;
      return { open: openPrice, high: high, low: low, close: close };
    }

    function simVolValue() {
      const el = document.getElementById('simVol');
      return (el ? parseFloat(el.value) : 25) / 100;
    }
    function simDriftValue() {
      const el = document.getElementById('simDrift');
      return (el ? parseFloat(el.value) : 0) / 100;
    }
    function onSimVolChange() {
      document.getElementById('simVolLabel').textContent = document.getElementById('simVol').value + '%';
    }
    function onSimDriftChange() {
      const v = parseFloat(document.getElementById('simDrift').value);
      document.getElementById('simDriftLabel').textContent = (v > 0 ? '+' : '') + v + '%';
    }

    function resetSimulation() {
      const S = parseFloat(document.getElementById('spot').value) || 100;
      chartRefSpot = S;
      simHistory = [{ day: 0, open: S, high: S, low: S, close: S }];
      simDayIndex = 0;
      simPLLog = [];
      const volSlider = document.getElementById('simVol');
      if (volSlider) {
        const iv = parseFloat(document.getElementById('iv').value) || 25;
        volSlider.value = Math.min(120, Math.max(5, Math.round(iv)));
        onSimVolChange();
      }
      const daysLeftEl = document.getElementById('daysLeft');
      if (daysLeftEl) {
        daysLeftEl.value = maxDTE;
        setText('daysLeftLabel', maxDTE);
      }
      recalc();
      if (HAS_SIM) {
        renderSimChart();
        renderSimLog();
        updateSimReadout();
        updateSimButtonsState();
      }
    }

    function advanceSimDays(n) {
      if (!legs.length) return;
      if (!simHistory.length) resetSimulation();
      const remaining = maxDTE - simDayIndex;
      const steps = Math.min(n, Math.max(0, remaining));
      if (steps <= 0) return;
      let p = simHistory[simHistory.length - 1].close;
      const vol = simVolValue();
      const drift = simDriftValue();
      for (let i = 0; i < steps; i++) {
        simDayIndex++;
        const c = simGenCandle(p, vol, drift);
        c.day = simDayIndex;
        simHistory.push(c);
        p = c.close;
      }
      document.getElementById('spot').value = p.toFixed(2);
      updateSpotSliderRange();
      const spotSlider = document.getElementById('spotSlider');
      if (spotSlider) spotSlider.value = p;
      const newDaysLeft = Math.max(0, maxDTE - simDayIndex);
      document.getElementById('daysLeft').value = newDaysLeft;
      const pl = plAt(p, newDaysLeft);
      simPLLog.push({ day: simDayIndex, price: p, pl: pl });
      recalc();
      renderSimChart();
      renderSimLog();
      updateSimReadout();
      updateSimButtonsState();
    }

    function updateSimButtonsState() {
      const atEnd = simDayIndex >= maxDTE;
      ['simAdvance1', 'simAdvance5'].forEach(function (id) {
        const b = document.getElementById(id);
        if (!b) return;
        b.disabled = atEnd;
        b.style.opacity = atEnd ? '0.5' : '1';
        b.style.cursor = atEnd ? 'not-allowed' : 'pointer';
      });
    }

    function updateSimReadout() {
      const el = document.getElementById('simReadout');
      const priceEl = document.getElementById('simPriceBig');
      if (!el || !simHistory.length) return;
      const first = simHistory[0].close;
      const last = simHistory[simHistory.length - 1].close;
      const chg = last - first;
      const pct = first ? (chg / first) * 100 : 0;
      const daysLeft = Math.max(0, maxDTE - simDayIndex);
      const pl = simPLLog.length ? simPLLog[simPLLog.length - 1].pl : plAt(last, daysLeft);
      const dirClass = chg > 0 ? 'up' : (chg < 0 ? 'down' : '');
      const arrow = chg > 0 ? '▲' : (chg < 0 ? '▼' : '·');
      const atEnd = simDayIndex >= maxDTE;

      if (priceEl) {
        priceEl.innerHTML = '$' + last.toFixed(2) +
          ' <span class="' + dirClass + '" style="font-size:1rem;font-weight:700;">' + arrow + ' ' +
          (chg >= 0 ? '+' : '') + chg.toFixed(2) + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)</span>';
      }

      el.innerHTML = '<strong>Day ' + simDayIndex + ' / ' + maxDTE + '</strong>' +
        ' · P/L now <strong class="' + (pl >= 0 ? 'up' : 'down') + '">' + (pl >= 0 ? '+' : '') + formatMoney(pl) + '</strong>' +
        (atEnd ? ' · <em>expiration reached</em>' : '');
    }

    function renderSimLog() {
      const el = document.getElementById('simLog');
      if (!el) return;
      if (!simPLLog.length) {
        el.innerHTML = '';
        return;
      }
      el.innerHTML = simPLLog.slice(-8).reverse().map(function (row) {
        const cls = row.pl >= 0 ? 'pos' : 'neg';
        return '<div class="sim-log-row"><span>Day ' + row.day + '</span><span>$' + row.price.toFixed(2) + '</span>' +
          '<span class="sl-pl ' + cls + '">' + (row.pl >= 0 ? '+' : '') + formatMoney(row.pl) + '</span></div>';
      }).join('');
    }

    // ---------- Earnings / ex-dividend markers on the day horizon ----------
    function eventMarkers() {
      const out = [];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      function add(id, label, color, name) {
        const el = document.getElementById(id);
        if (!el || !el.value) return;
        const d = new Date(el.value + 'T00:00:00');
        if (isNaN(d.getTime())) return;
        const day = Math.round((d - today) / 86400000);
        if (day < 0 || typeof maxDTE === 'undefined' || day > maxDTE) return;
        out.push({ day: day, label: label, color: color, name: name });
      }
      add('earnDate', 'E', '#f59e0b', 'Earnings');
      add('exDivDate', 'D', '#a78bfa', 'Ex-dividend');
      return out;
    }
    function onEventDateChange() {
      renderSimChart();
      updatePositionSummary();
    }
    // Inline Chart.js plugin drawing the same markers on the P/L path chart.
    const eventMarkerPlugin = {
      id: 'eventMarkers',
      afterDatasetsDraw: function (chart) {
        try {
          const cfg = chart.config.options.plugins.eventMarkers;
          const events = (cfg && cfg.events) || [];
          if (!events.length) return;
          const xS = chart.scales.x, yS = chart.scales.y;
          const labels = chart.data.labels || [];
          const ctx = chart.ctx;
          events.forEach(function (ev) {
            let x = null;
            for (let i = 0; i < labels.length; i++) {
              if (labels[i] === ev.day) { x = xS.getPixelForTick(i); break; }
              if (i < labels.length - 1 && labels[i] < ev.day && ev.day < labels[i + 1]) {
                const t = (ev.day - labels[i]) / (labels[i + 1] - labels[i]);
                x = xS.getPixelForTick(i) + t * (xS.getPixelForTick(i + 1) - xS.getPixelForTick(i));
                break;
              }
            }
            if (x == null || x < xS.left || x > xS.right) return;
            ctx.save();
            ctx.strokeStyle = ev.color; ctx.lineWidth = 1.4; ctx.setLineDash([5, 3]);
            ctx.beginPath(); ctx.moveTo(x, yS.top); ctx.lineTo(x, yS.bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = ev.color; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(ev.label, x + 4, yS.top + 12);
            ctx.restore();
          });
        } catch (e) { /* markers must never break the chart */ }
      }
    };
    function renderSimChart() {
      const svg = document.getElementById('simSvg');
      if (!svg || !simHistory.length) return;
      const width = 600, height = 200;
      const pad = { l: 46, r: 10, t: 10, b: 20 };
      const candles = simHistory;
      const xs = candles.map(function (c) { return c.day; });
      const xDomain = [Math.min.apply(null, xs) - 0.5, Math.max.apply(null, xs) + 0.5];
      let yMin = Math.min.apply(null, candles.map(function (c) { return c.low; }));
      let yMax = Math.max.apply(null, candles.map(function (c) { return c.high; }));
      if (yMin === yMax) { yMin -= 1; yMax += 1; }
      const yPad = (yMax - yMin) * 0.1;
      yMin -= yPad; yMax += yPad;
      const innerW = width - pad.l - pad.r, innerH = height - pad.t - pad.b;
      const xScale = function (x) { return pad.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerW; };
      const yScale = function (y) { return pad.t + innerH - ((y - yMin) / (yMax - yMin)) * innerH; };

      let svgHtml = '';
      const yTicks = 4;
      const yRange = yMax - yMin;
      // Narrow price ranges would print duplicate labels (e.g. "$771" twice)
      // when rounded to whole dollars — show one decimal instead.
      const yDec = yRange < 8 ? 1 : 0;
      for (let i = 0; i <= yTicks; i++) {
        const yVal = yMin + ((yMax - yMin) * i) / yTicks;
        const yPix = yScale(yVal);
        svgHtml += '<line x1="' + pad.l + '" y1="' + yPix + '" x2="' + (width - pad.r) + '" y2="' + yPix + '" stroke="var(--border)" stroke-width="1"/>';
        svgHtml += '<text x="' + (pad.l - 6) + '" y="' + (yPix + 3) + '" text-anchor="end" font-size="9.5" fill="var(--muted)">$' + yVal.toFixed(yDec) + '</text>';
      }
      const startXPix = xScale(0);
      svgHtml += '<line x1="' + startXPix + '" y1="' + pad.t + '" x2="' + startXPix + '" y2="' + (height - pad.b) + '" stroke="var(--spot-guide, var(--yellow))" stroke-width="1.2" stroke-dasharray="4,3"/>';

      const candleSpacing = innerW / (xDomain[1] - xDomain[0]);
      const candleWidth = Math.max(3, Math.min(14, candleSpacing * 0.6));

      candles.forEach(function (c) {
        const xCenter = xScale(c.day);
        const isUp = c.close >= c.open;
        const color = isUp ? 'var(--green)' : 'var(--red)';
        const yHigh = yScale(c.high), yLow = yScale(c.low), yOpen = yScale(c.open), yClose = yScale(c.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yOpen - yClose));
        svgHtml += '<line x1="' + xCenter + '" y1="' + yHigh + '" x2="' + xCenter + '" y2="' + yLow + '" stroke="' + color + '" stroke-width="1.4"/>';
        svgHtml += '<rect x="' + (xCenter - candleWidth / 2) + '" y="' + bodyTop + '" width="' + candleWidth + '" height="' + bodyHeight + '" fill="' + color + '"/>';
      });

      const step = Math.max(1, Math.ceil(candles.length / 8));
      for (let i = 0; i < candles.length; i += step) {
        const c = candles[i];
        const xPix = xScale(c.day);
        svgHtml += '<text x="' + xPix + '" y="' + (height - 5) + '" text-anchor="middle" font-size="9.5" fill="var(--muted)">' + c.day + 'd</text>';
      }

      // Earnings / ex-dividend markers on the day axis
      eventMarkers().forEach(function (ev) {
        if (ev.day < xDomain[0] || ev.day > xDomain[1]) return;
        const ex = xScale(ev.day);
        svgHtml += '<line x1="' + ex + '" y1="' + pad.t + '" x2="' + ex + '" y2="' + (height - pad.b) +
          '" stroke="' + ev.color + '" stroke-width="1.4" stroke-dasharray="5,3"><title>' + ev.name +
          ' — day ' + ev.day + '</title></line>';
        svgHtml += '<text x="' + (ex + 4) + '" y="' + (pad.t + 11) +
          '" font-size="10" font-weight="700" fill="' + ev.color + '">' + ev.label + '</text>';
      });

      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.innerHTML = svgHtml;
      wireSimTooltip(svg, candles, xScale, width, pad, innerW, xDomain);
    }

    function wireSimTooltip(svg, candles, xScale, width, pad, innerW, xDomain) {
      const tip = document.getElementById('simTooltip');
      const wrap = document.getElementById('simChartWrap');
      if (!tip || !wrap) return;
      svg.onmousemove = function (e) {
        const rect = svg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const mx = (e.clientX - rect.left) * scaleX;
        const dataX = xDomain[0] + ((mx - pad.l) / innerW) * (xDomain[1] - xDomain[0]);
        let nearest = candles[0], nd = Infinity;
        candles.forEach(function (c) { const dist = Math.abs(c.day - dataX); if (dist < nd) { nd = dist; nearest = c; } });
        const xPix = xScale(nearest.day);
        const wrapRect = wrap.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const tipX = ((xPix / width) * svgRect.width) + (svgRect.left - wrapRect.left);
        tip.style.left = Math.max(30, Math.min(wrapRect.width - 30, tipX)) + 'px';
        tip.style.top = '8px';
        tip.style.opacity = '1';
        const color = nearest.close >= nearest.open ? 'var(--green)' : 'var(--red)';
        tip.innerHTML = '<div style="color:var(--muted);">Day ' + nearest.day + '</div>' +
          '<div style="color:' + color + ';font-weight:700;">Close $' + nearest.close.toFixed(2) + '</div>' +
          '<div style="color:var(--muted);font-size:0.65rem;">O ' + nearest.open.toFixed(2) + ' H ' + nearest.high.toFixed(2) + ' L ' + nearest.low.toFixed(2) + '</div>';
      };
      svg.onmouseleave = function () { tip.style.opacity = '0'; };
    }

    // ---------- Position Summary (P/L across the simulated days) ----------
    let posChart = null;

    function buildPosSummarySeries() {
      const S0 = simHistory.length ? simHistory[0].close : (parseFloat(document.getElementById('spot').value) || 100);
      const labels = [0];
      const data = [plAt(S0, maxDTE)];
      simPLLog.forEach(function (row) {
        labels.push(row.day);
        data.push(row.pl);
      });
      return { labels: labels, data: data };
    }

    function updatePositionSummary() {
      const canvas = document.getElementById('posSummaryChart');
      if (!canvas) return;
      const series = buildPosSummarySeries();

      if (posChart) {
        posChart.data.labels = series.labels;
        posChart.data.datasets[0].data = series.data;
        if (posChart.options.plugins) posChart.options.plugins.eventMarkers = { events: eventMarkers() };
        posChart.update('none');
      } else {
        const tc = chartThemeColors();
        posChart = new Chart(canvas.getContext('2d'), {
          type: 'line',
          plugins: [eventMarkerPlugin],
          data: {
            labels: series.labels,
            datasets: [{
              label: 'P/L',
              data: series.data,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.12)',
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: '#3b82f6',
              tension: 0.25,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, eventMarkers: { events: eventMarkers() } },
            scales: {
              x: {
                title: { display: true, text: 'Simulation day', color: tc.text, font: { size: 10 } },
                ticks: { color: tc.text, font: { size: 10 } },
                grid: { color: tc.grid }
              },
              y: {
                ticks: { color: tc.text, font: { size: 10 }, callback: function (v) { return '$' + v; } },
                grid: { color: tc.grid }
              }
            }
          }
        });
      }

      const last = series.data[series.data.length - 1];
      const plEl = document.getElementById('posCurrentPL');
      if (plEl) {
        plEl.textContent = (last >= 0 ? '+' : '') + formatMoney(last);
        plEl.style.color = last >= 0 ? 'var(--green)' : 'var(--red)';
      }
      paintNetPremium(document.getElementById('posNetPremium'), initialCost());
      if (legs.length) {
        const g = positionGreeks();
        const deltaEl = document.getElementById('posDelta');
        const thetaEl = document.getElementById('posTheta');
        if (deltaEl) deltaEl.textContent = (g.delta >= 0 ? '+' : '') + g.delta.toFixed(1);
        if (thetaEl) thetaEl.textContent = (g.theta >= 0 ? '+' : '') + formatMoney(g.theta);
        const emEl = document.getElementById('posExpMove');
        if (emEl) {
          const em = expectedMove();
          emEl.textContent = (em == null || !isFinite(em)) ? '—' : '±' + formatMoney(em);
        }
        const popEl = document.getElementById('posPoP');
        if (popEl) {
          const pop = probOfProfit();
          popEl.textContent = (pop == null || !isFinite(pop)) ? '—' : (pop * 100).toFixed(0) + '%';
        }
      }
    }

    function updateEduTip() {
      const tip = document.getElementById('eduTip');
      if (!tip) return;
      // Keep template lesson bridge if a known template is selected
      const sel = document.getElementById('strategyTemplate');
      const key = sel && sel.value;
      if (key && TEMPLATE_LESSONS[key]) {
        setTemplateTip(key);
        return;
      }
      const hasLong = legs.some(function(l) { return l.side === 'buy'; });
      const hasShort = legs.some(function(l) { return l.side === 'sell'; });
      const hasStock = legs.some(function(l) { return l.type === 'stock'; });
      if (hasStock && hasShort) {
        tip.innerHTML = '<strong>Stock + option:</strong> Stock qty = shares, cost = entry price. Listed option qty = contracts (×100); futures options use the contract multiplier. For a Covered Call use 100 shares + 1 Short Call. <a href="/level2/">Fundamentals lesson</a>';
      } else if (hasStock) {
        tip.innerHTML = '<strong>Stock leg:</strong> Qty = shares, cost = entry price. Strike and DTE are unused. Add 1 Short Call for a Covered Call.';
      } else if (legs.length === 1 && hasLong) {
        tip.innerHTML = '<strong>Long option:</strong> You pay a Debit. Solid line = Expiry Payoff. Dotted line still has time value. Step days to watch Theta.';
      } else if (legs.length === 1 && hasShort) {
        tip.innerHTML = '<strong>Short option:</strong> You collect a Credit. Theta helps if Underlying stays near the Strike.';
      } else if (hasLong && hasShort) {
        tip.innerHTML = '<strong>Multi-leg:</strong> Net Debit/Credit is above. Edit any field live — the chart updates. Use a template for a ready structure.';
      } else {
        tip.innerHTML = 'Edit the legs or pick a strategy template. The chart is live.';
      }
    }


    function legsToQuery() {
      try {
        var payload = legs.map(function (l) {
          return {
            side: l.side,
            type: l.type,
            strike: l.strike,
            dte: l.dte,
            qty: l.qty,
            premium: l.premium
          };
        });
        var S = document.getElementById('spot') ? document.getElementById('spot').value : '';
        var tkrEl = document.getElementById('ticker');
        var commEl = document.getElementById('commission');
        var earnEl = document.getElementById('earnDate');
        var exdivEl = document.getElementById('exDivDate');
        var obj = { legs: payload, S: S, ticker: tkrEl ? tkrEl.value : '', comm: commEl ? commEl.value : '',
          earn: earnEl ? earnEl.value : '', exdiv: exdivEl ? exdivEl.value : '' };
        return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } catch (e) { return ''; }
    }

    function legsFromQuery(token) {
      try {
        var pad = token.length % 4 === 0 ? '' : '===='.slice(token.length % 4);
        var b64 = token.replace(/-/g, '+').replace(/_/g, '/') + pad;
        var json = decodeURIComponent(escape(atob(b64)));
        var obj = JSON.parse(json);
        if (!obj || !obj.legs || !obj.legs.length) return false;
        legs = obj.legs.map(function (l) {
          return {
            id: nextId++,
            side: l.side === 'sell' ? 'sell' : 'buy',
            type: (l.type === 'put' || l.type === 'stock') ? l.type : 'call',
            strike: Number(l.strike) || 100,
            dte: Number(l.dte) || 30,
            qty: Number(l.qty) || 1,
            premium: Number(l.premium) || 0,
            premiumManual: true
          };
        });
        if (obj.S && document.getElementById('spot')) {
          document.getElementById('spot').value = obj.S;
          var sl = document.getElementById('spotSlider');
          if (sl) sl.value = obj.S;
          if (parseFloat(obj.S) > 0) emAnchorSpot = parseFloat(obj.S); // loaded setup asserts a price
        }
        if (obj.ticker && document.getElementById('ticker')) {
          document.getElementById('ticker').value = obj.ticker;
        }
        if (obj.comm != null && obj.comm !== '' && document.getElementById('commission')) {
          document.getElementById('commission').value = obj.comm;
        }
        if (obj.earn && document.getElementById('earnDate')) {
          document.getElementById('earnDate').value = obj.earn;
        }
        if (obj.exdiv && document.getElementById('exDivDate')) {
          document.getElementById('exDivDate').value = obj.exdiv;
        }
        markBuildDirty(); // a loaded setup is worth remembering
        return true;
      } catch (e) { return false; }
    }

    function updateShareUrlQuiet() {
      try {
        if (!legs.length) return;
        var token = legsToQuery();
        if (!token) return;
        var url = new URL(window.location.href);
        url.searchParams.delete('template');
        url.searchParams.set('setup', token);
        window.history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString());
      } catch (e) {}
    }

    // ===== Round 2 item 3: recent-builds history (localStorage only) =====
    // Snapshots of the builder setup are saved (debounced) after edits settle.
    // Nothing leaves the browser; the panel offers one-click reload.
    const RECENT_KEY = 'jsm.recent.v1';
    const RECENT_MAX = 12;
    let recentSaveTimer = null;
    let buildDirty = false;
    function markBuildDirty(){ buildDirty = true; }
    function escapeHtml(s){
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
      });
    }
    function relTime(ts){
      const d = Date.now() - ts;
      if (!(d >= 0)) return 'just now';
      const m = Math.floor(d / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      const days = Math.floor(h / 24);
      if (days < 7) return days + 'd ago';
      return new Date(ts).toISOString().slice(0, 10);
    }
    // Short human label for a leg list, e.g. "Bull Call Spread".
    function describeLegs(list){
      const ls = (list || []).filter(function(l){ return l && l.type && l.type !== 'stock'; });
      const st = (list || []).filter(function(l){ return l && l.type === 'stock'; });
      if (!ls.length){
        if (st.length) return (st[0].side === 'sell' ? 'Short Stock' : 'Long Stock');
        return 'Empty';
      }
      if (st.length === 1 && ls.length === 1 && ls[0].type === 'call' && ls[0].side === 'sell') return 'Covered Call';
      if (st.length === 1 && ls.length === 1 && ls[0].type === 'put' && ls[0].side === 'sell') return 'Cash-Secured Put';
      if (ls.length === 1){
        const l = ls[0];
        return (l.side === 'sell' ? 'Short ' : 'Long ') + (l.type === 'put' ? 'Put ' : 'Call ') + l.strike;
      }
      if (ls.length === 2){
        let p1 = ls[0], p2 = ls[1];
        // a = lower strike; on equal strikes, put the put leg first
        if (p2.strike < p1.strike || (p2.strike === p1.strike && p2.type === 'put' && p1.type !== 'put')){
          const t = p1; p1 = p2; p2 = t;
        }
        const a = p1, b = p2;
        const sameQty = Math.abs(a.qty) === Math.abs(b.qty);
        if (a.dte === b.dte && sameQty){
          if (a.type === 'call' && b.type === 'call'){
            if (a.side === 'buy' && b.side === 'sell') return 'Bull Call Spread';
            if (a.side === 'sell' && b.side === 'buy') return 'Bear Call Spread';
          }
          if (a.type === 'put' && b.type === 'put'){
            if (a.side === 'buy' && b.side === 'sell') return 'Bull Put Spread';
            if (a.side === 'sell' && b.side === 'buy') return 'Bear Put Spread';
          }
          if (a.type === 'put' && b.type === 'call' && a.side === 'buy' && b.side === 'buy')
            return a.strike === b.strike ? 'Long Straddle' : 'Long Strangle';
          if (a.type === 'put' && b.type === 'call' && a.side === 'sell' && b.side === 'sell')
            return a.strike === b.strike ? 'Short Straddle' : 'Short Strangle';
        } else if (a.dte !== b.dte && a.type === b.type && a.strike === b.strike){
          return 'Calendar Spread';
        }
        return 'Custom (2 legs)';
      }
      if ((ls.length === 3 || ls.length === 4) && ls.every(function(l){ return l.dte === ls[0].dte; })){
        const types = {};
        ls.forEach(function(l){ types[l.type] = 1; });
        const nTypes = Object.keys(types).length;
        const shorts = ls.filter(function(l){ return l.side === 'sell'; }).length;
        if (ls.length === 4 && nTypes === 2 && shorts === 2) return 'Iron Condor';
        if (nTypes === 1) return ls.length === 3 ? 'Butterfly' : 'Condor';
      }
      return 'Custom (' + list.length + ' legs)';
    }
    function loadRecent(){
      try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(function(r){ return r && r.token; }) : [];
      } catch (e){ return []; }
    }
    function persistRecent(arr){
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, RECENT_MAX))); } catch (e){}
    }
    function scheduleRecentSave(){
      if (recentSaveTimer) clearTimeout(recentSaveTimer);
      recentSaveTimer = setTimeout(saveRecentBuild, 1500);
    }
    function saveRecentBuild(){
      try {
        if (!buildDirty || !legs.length) return;
        if (!document.getElementById('legsList')) return; // builder page only
        const token = legsToQuery();
        if (!token) return;
        let arr = loadRecent();
        if (arr.length && arr[0].token === token) return; // unchanged since last save
        arr = arr.filter(function(r){ return r.token !== token; });
        const tkrEl = document.getElementById('ticker');
        arr.unshift({
          ts: Date.now(),
          ticker: tkrEl ? (tkrEl.value || '').toUpperCase() : '',
          label: describeLegs(legs),
          token: token
        });
        persistRecent(arr);
        const p = document.getElementById('recentPanel');
        if (p && p.style.display !== 'none') renderRecentList();
      } catch (e){}
    }
    function renderRecentList(){
      const p = document.getElementById('recentPanel');
      if (!p) return;
      const arr = loadRecent();
      if (!arr.length){
        p.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:.8rem">No recent builds yet.<br>Setups you build will appear here.</div>';
        return;
      }
      let html = '';
      arr.forEach(function(r, i){
        html += '<div class="recent-item" role="button" tabindex="0" onclick="loadRecentBuild(' + i + ')">' +
          '<span class="rt">' + escapeHtml(r.ticker || '—') + '</span>' +
          '<span class="rl">' + escapeHtml(r.label || '') + '</span>' +
          '<span class="rw">' + escapeHtml(relTime(r.ts)) + '</span>' +
          '<button type="button" class="recent-del" title="Remove" onclick="event.stopPropagation();deleteRecentBuild(' + i + ')">✕</button></div>';
      });
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:2px 4px">' +
        '<span style="font-size:.68rem;color:var(--muted)">Stored only in this browser</span>' +
        '<button type="button" class="btn-secondary btn-sm" onclick="clearRecentBuilds()">Clear all</button></div>';
      p.innerHTML = html;
    }
    function toggleRecentPanel(){
      const p = document.getElementById('recentPanel');
      const btn = document.getElementById('recentBtn');
      if (!p || !btn) return;
      if (p.style.display !== 'none'){ p.style.display = 'none'; return; }
      renderRecentList();
      const r = btn.getBoundingClientRect();
      p.style.position = 'fixed';
      p.style.top = Math.min(r.bottom + 6, window.innerHeight - 120) + 'px';
      p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 360)) + 'px';
      p.style.display = '';
    }
    function loadRecentBuild(i){
      const arr = loadRecent();
      const r = arr[i];
      const p = document.getElementById('recentPanel');
      if (p) p.style.display = 'none';
      if (!r) return;
      if (legsFromQuery(r.token)){
        markBuildDirty();
        syncDTESlider(); updateSpotSliderRange(); renderLegs(); recalc(); resetSimulation();
        onRangeChange(); // re-lock the Range window around the loaded build's spot
        const tip = document.getElementById('templateTip');
        if (tip) tip.innerHTML = 'Loaded from recent builds. Edit freely.';
      } else {
        arr.splice(i, 1); persistRecent(arr); // token no longer decodes; drop it
      }
    }
    function deleteRecentBuild(i){
      const arr = loadRecent();
      arr.splice(i, 1); persistRecent(arr);
      renderRecentList();
    }
    function clearRecentBuilds(){
      persistRecent([]);
      renderRecentList();
    }
    // Close the panel on outside clicks (no-op under test DOM).
    document.addEventListener('click', function(ev){
      const p = document.getElementById('recentPanel');
      if (!p || p.style.display === 'none') return;
      const t = ev.target;
      if (p.contains(t)) return;
      const btn = document.getElementById('recentBtn');
      if (btn && (btn === t || btn.contains(t))) return;
      p.style.display = 'none';
    });

    var shareBtn = document.getElementById('shareSetup');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        updateShareUrlQuiet();
        var link = window.location.href;
        var status = document.getElementById('shareStatus');
        function ok() { if (status) status.textContent = 'Link copied — paste to share this setup.'; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(ok).catch(function () {
            if (status) status.textContent = 'Copy from the address bar.';
          });
        } else if (status) status.textContent = 'Copy from the address bar.';
      });
    }


    // Boot once: honor ?setup= or ?template= on every load/refresh
    // Shared JSM theme preference
    (function () {
      const root = document.documentElement;
      const toggle = document.getElementById('themeToggle');
      const icon = document.getElementById('themeIcon');
      const label = document.getElementById('themeLabel');
      function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
        if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
        if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        try { localStorage.setItem('jsm-theme', theme); } catch (e) {}
        if (typeof refreshChartsForTheme === 'function') refreshChartsForTheme();
      }
      let saved = null;
      try { saved = localStorage.getItem('jsm-theme'); } catch (e) {}
      if (saved === 'light' || saved === 'dark') applyTheme(saved);
      else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) applyTheme('light');
      else applyTheme('dark');
      if (toggle) toggle.addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    })();


    // ===== CBOE CHAIN — drives default spot / IV / DTE / premium =====
    window._cboeData = null;
    function midPrice(c){
      if(!c) return 0;
      const b = Number(c.bid), a = Number(c.ask), l = Number(c.last);
      if (isFinite(b) && isFinite(a) && b>0 && a>0) return (b+a)/2;
      if (isFinite(l) && l>0) return l;
      if (isFinite(a) && a>0) return a;
      if (isFinite(b) && b>0) return b;
      return 0;
    }
    function expirationDte(exp) {
      if (!exp) return 0;
      const d = new Date(String(exp) + 'T00:00:00');
      if (isNaN(d.getTime())) return 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.max(0, Math.round((d - today) / 86400000));
    }
    function pickDefaultExpiration(exps, preferDte, atLeast) {
      if (!exps || !exps.length) return '';
      const target = preferDte == null ? 30 : preferDte;
      if (atLeast) {
        // Prefer the smallest expiration that is at least `target` days out;
        // fall back to the closest-available if none qualify.
        let smallestQualifying = null;
        for (let i = 0; i < exps.length; i++) {
          const dte = expirationDte(exps[i]);
          if (dte >= target && (smallestQualifying == null || dte < expirationDte(smallestQualifying))) {
            smallestQualifying = exps[i];
          }
        }
        if (smallestQualifying) return smallestQualifying;
      }
      let best = exps[0];
      let bestDiff = Infinity;
      for (let i = 0; i < exps.length; i++) {
        const dte = expirationDte(exps[i]);
        if (dte < 1) continue;
        const diff = Math.abs(dte - target);
        if (diff < bestDiff) {
          best = exps[i];
          bestDiff = diff;
        }
      }
      return best;
    }
    function selectedExpiration() {
      const sel = document.getElementById('chainExpiration');
      return (sel && sel.value) || '';
    }
    function currentChainSlice(exp) {
      const data = window._cboeData;
      if (!data || !data.chains) return null;
      const key = exp || selectedExpiration();
      return key ? data.chains[key] : null;
    }
    function nearestListedStrike(strike, chain) {
      if (!chain || !chain.strikes || !chain.strikes.length) return strike;
      let best = chain.strikes[0];
      let bestDiff = Math.abs(best - strike);
      for (let i = 1; i < chain.strikes.length; i++) {
        const k = chain.strikes[i];
        const d = Math.abs(k - strike);
        if (d < bestDiff) {
          best = k;
          bestDiff = d;
        }
      }
      return best;
    }
    function findChainContract(type, strike, exp) {
      const chain = currentChainSlice(exp);
      if (!chain || type === 'stock') return null;
      const list = type === 'put' ? chain.puts : chain.calls;
      if (!list || !list.length) return null;
      const want = Number(strike);
      let found = null;
      for (let i = 0; i < list.length; i++) {
        if (Math.abs(Number(list[i].strike) - want) < 1e-6) {
          found = list[i];
          break;
        }
      }
      return found;
    }
    function quoteIvPct(q) {
      const v = Number(q && q.iv);
      if (!isFinite(v) || v <= 0) return null;
      const pct = v <= 3 ? v * 100 : v;
      return Math.max(1, Math.min(200, Math.round(pct)));
    }
    function seedIvFromAtm(data, exp) {
      const ivEl = document.getElementById('iv');
      if (!ivEl) return;
      const S = parseFloat(document.getElementById('spot').value) || Number(data && data.spot) || 0;
      const chain = currentChainSlice(exp);
      if (!chain || !S) return;
      const k = nearestListedStrike(S, chain);
      const call = findChainContract('call', k, exp);
      const put = findChainContract('put', k, exp);
      const iv = quoteIvPct(call) || quoteIvPct(put);
      if (iv) ivEl.value = iv;
    }
    function tryFillLegFromChain(leg, opts) {
      const options = opts || {};
      if (!leg || leg.type === 'stock') {
        if (leg && leg.type === 'stock' && window._cboeData && window._cboeData.spot && (!leg.premiumManual || options.force)) {
          leg.premium = Math.round(Number(window._cboeData.spot) * 100) / 100;
          return true;
        }
        return false;
      }
      const exp = selectedExpiration();
      const chain = currentChainSlice(exp);
      if (!chain) return false;
      // A chain quote belongs to the selected expiration. If this leg targets
      // a different expiration (e.g. chosen in the per-leg expiry dropdown), a
      // fill from the selected expiration would misprice it — leave the leg
      // for the modeled premium instead. Callers that sync DTEs pass
      // setDte/force and bypass this guard.
      if (!options.setDte && !options.force && exp) {
        if (Math.abs((Number(leg.dte) || 0) - expirationDte(exp)) > 0) return false;
      }
      if (options.snapStrikes) {
        leg.strike = nearestListedStrike(leg.strike || parseFloat(document.getElementById('spot').value) || 100, chain);
      }
      if (options.setDte && exp) leg.dte = Math.max(1, expirationDte(exp));
      const q = findChainContract(leg.type, leg.strike, exp);
      const px = midPrice(q);
      if (px > 0 && (!leg.premiumManual || options.force)) {
        leg.premium = Math.round(px * 100) / 100;
        leg.premiumFromChain = true;
        return true;
      }
      return false;
    }
    function applyChainQuotesToLegs(list, opts) {
      const arr = list || legs;
      if (!arr || !arr.length || !window._cboeData) return false;
      let changed = false;
      for (let i = 0; i < arr.length; i++) {
        if (tryFillLegFromChain(arr[i], opts)) changed = true;
      }
      return changed;
    }
    function onChainExpChange() {
      renderChainTable();
      const dte = expirationDte(selectedExpiration());
      applyChainQuotesToLegs(legs, { setDte: true });
      if (typeof compareMode !== 'undefined' && compareMode) {
        applyChainQuotesToLegs(legsB, { setDte: true });
      }
      if (dte && document.getElementById('daysLeft')) {
        syncDTESlider();
      }
      seedIvFromAtm(window._cboeData, selectedExpiration());
      renderLegs();
      if (typeof renderLegsB === 'function' && compareMode) renderLegsB();
      if (typeof resetSimulation === 'function') resetSimulation();
      else if (typeof recalc === 'function') recalc();
    }
    // If the current position is still exactly the untouched single default
    // leg (never priced from a chain, never manually edited), re-anchor its
    // strike to the freshly loaded spot before snapping to a listed strike.
    // Without this, a leg created before the chain loaded (e.g. against the
    // page's placeholder spot) snaps to the nearest *listed* strike to its
    // stale value — which can be the lowest strike on the whole chain if the
    // real spot is much higher — instead of landing at-the-money.
    function reanchorDefaultLegStrike(list, spot) {
      if (!list || list.length !== 1 || !spot) return;
      const leg = list[0];
      if (leg.type === 'call' && leg.side === 'buy' && !leg.premiumManual && !leg.premiumFromChain) {
        leg.strike = Math.round(spot);
      }
    }
    // Called whenever the current ticker has no usable market data (invalid
    // symbol, failed fetch, or a futures root — which this app never fetches
    // a live chain for). Rather than silently keep the previous ticker's
    // stale Spot/Strike/Premium around, this blanks the fields that would
    // normally come from the chain so the user notices they need to type
    // their own numbers, and immediately re-renders the legs, payoff chart
    // and Greeks so nothing misleading stays on screen.
    function enterManualDataMode(sym, message) {
      window._cboeData = null;
      emAnchorSpot = null; // no market price: band stays hidden until the user types one
      const spotInput = document.getElementById('spot');
      const ivInput = document.getElementById('iv');
      const spotRefEl = document.getElementById('chainSpotRef');
      if (spotInput) spotInput.value = '';
      if (ivInput) ivInput.value = '';
      if (spotRefEl) spotRefEl.value = '';
      [legs, legsB].forEach(function (list) {
        if (!list) return;
        list.forEach(function (leg) {
          if (leg.tickerManual) return; // leg pinned to its own symbol keeps its own data
          if (leg.type === 'stock') {
            leg.premium = null;
            leg.premiumManual = false;
          } else {
            leg.strike = null;
            leg.premium = null;
            leg.premiumManual = false;
            leg.premiumFromChain = false;
          }
        });
      });
      const chainStatus = document.getElementById('chainStatus');
      if (chainStatus) { chainStatus.textContent = message; chainStatus.className = 'quote-status err'; }
      const qStatus = document.getElementById('quoteStatus');
      if (qStatus) { qStatus.textContent = message; qStatus.className = 'quote-status err'; }
      const wrap = document.getElementById('chainTableWrap');
      if (wrap) wrap.innerHTML = '<div style="padding:14px;color:var(--muted)">No market data for this ticker — enter Spot, Strike and Premium manually below.</div>';
      syncDTESlider();
      updateSpotSliderRange();
      renderLegs();
      if (typeof renderLegsB === 'function' && typeof compareMode !== 'undefined' && compareMode) renderLegsB();
      recalc();
      // Batch C fix: no chain for this ticker — discovery expiry selects fall
      // back to modeled-DTE mode. Results are cleared (spot is empty here, so
      // a synthetic re-run would model the wrong scale), but remember a scan
      // existed so the next chain load re-runs it instead of leaving a stale
      // "No chain" note under a loaded chain.
      discOptHadScan = optResults.length > 0 || discOptStale;
      discFindHadScan = findResults.length > 0 || discFindStale;
      discOptStale = false;
      discFindStale = false;
      optResults = [];
      findResults = [];
      if (typeof syncDiscoveryExpiries === 'function') syncDiscoveryExpiries();
      var _obm = document.getElementById('optResults');
      if (_obm) _obm.innerHTML = '<p class="disc-empty">No chain for this ticker — enter a spot price, then scan to model candidates.</p>';
      var _fbm = document.getElementById('findResults');
      if (_fbm) _fbm.innerHTML = '<p class="disc-empty">No chain for this ticker — enter a spot price, then scan to model candidates.</p>';
    }
    async function loadCboeChain(){
      const reqId = ++_chainReqId; // Batch C fix: stale-response guard token
      const tickerEl = document.getElementById('ticker');
      const sym = normalizeTicker(tickerEl && tickerEl.value || 'SPY');
      const statusEl = document.getElementById('chainStatus');
      const spotRefEl = document.getElementById('chainSpotRef');
      const spotInput = document.getElementById('spot');
      if (!sym){ enterManualDataMode('', 'No ticker entered — enter Spot, Strike and Premium manually below.'); return; }
      const futures = isFuturesTicker(sym);
      if (futures) {
        const spec = futuresSpec(sym);
        enterManualDataMode(sym, `${sym} is a futures option — no live chain here (use a CME futures-option data source). Contract multiplier: ${spec ? spec.multiplier : '—'}. Enter Spot, Strike and Premium manually.`);
        return;
      }
      statusEl.textContent = sym + ' chain loading… (CBOE delayed)';
      statusEl.className='quote-status warn';
      try{
        let data = null;
        // Try Pages Function
        try{
          const r = await fetch(`/api/cboe/chain?symbol=${encodeURIComponent(sym)}`, { cache: 'no-store' });
          if (!r.ok) throw new Error('proxy '+r.status);
          data = await r.json();
          if (data.error) throw new Error(data.error);
        }catch(e){
          console.log('Proxy failed, fallback to allorigins', e);
          const cboeUrl = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(sym.startsWith('_')?sym: (sym==='SPX'?'_SPX': sym==='NDX'?'_NDX': sym==='RUT'?'_RUT': sym==='VIX'?'_VIX': sym))}.json`;
          const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(cboeUrl)}`;
          const r2 = await fetch(proxy);
          if (!r2.ok) throw new Error('CBOE fetch failed '+r2.status);
          const raw = await r2.json();
          const d = raw && raw.data ? raw.data : raw;
          const spot = d.close ?? d.current_price ?? null;
          const arr = Array.isArray(d.options) ? d.options : [];
          const expMap = new Map();
          const re = /(\d{6})([CP])(\d{8})$/;
          for (const o of arr){
            const occ = o.option || o.symbol || '';
            const mm = occ.match(re);
            if(!mm) continue;
            const yymmdd = mm[1];
            const cp = mm[2];
            const strikeRaw = mm[3];
            const yy = parseInt(yymmdd.slice(0,2),10);
            const mm2 = yymmdd.slice(2,4);
            const dd = yymmdd.slice(4,6);
            const yyyy = yy>=70?1900+yy:2000+yy;
            const expISO = `${yyyy}-${mm2}-${dd}`;
            const strike = parseInt(strikeRaw,10)/1000;
            if(!expMap.has(expISO)) expMap.set(expISO,{calls:new Map(),puts:new Map()});
            const bucket = expMap.get(expISO);
            const simp = {strike, bid:o.bid, ask:o.ask, last:o.last, iv:o.iv, oi:o.open_interest, vol:o.volume};
            if(cp==='C') bucket.calls.set(strike,simp); else bucket.puts.set(strike,simp);
          }
          const expirations = Array.from(expMap.keys()).sort();
          const chains = {};
          for(const exp of expirations){
            const b = expMap.get(exp);
            const cSt = Array.from(b.calls.keys()).sort((a,b)=>a-b);
            const pSt = Array.from(b.puts.keys()).sort((a,b)=>a-b);
            chains[exp]={calls:cSt.map(k=>b.calls.get(k)), puts:pSt.map(k=>b.puts.get(k)), strikes:Array.from(new Set([...cSt,...pSt])).sort((a,b)=>a-b)};
          }
          data={symbol:sym, spot, expirations, chains, source:'CBOE via allorigins'};
        }
        // Batch C fix: the ticker changed (or another load started) while
        // this request was in flight — drop the stale response so it can't
        // overwrite the new ticker's chain or re-run discovery on old data.
        if (reqId !== _chainReqId) return;
        if (!data || !data.expirations || !data.expirations.length) throw new Error('No expirations (try SPY, QQQ, AAPL)');
        const sel = document.getElementById('chainExpiration');
        const keepExp = sel && sel.value;
        sel.innerHTML = '';
        data.expirations.forEach(exp=>{
          const opt = document.createElement('option');
          opt.value = exp;
          const days = expirationDte(exp);
          opt.textContent = exp + (days?` (${days}d)`:'');
          sel.appendChild(opt);
        });
        const prefer = keepExp && data.expirations.indexOf(keepExp) >= 0
          ? keepExp
          : pickDefaultExpiration(data.expirations, 45, true);
        if (prefer) sel.value = prefer;
        window._cboeData = data;
        if (spotRefEl) spotRefEl.value = data.spot ? '$' + Number(data.spot).toFixed(2) : '—';
        if (spotInput && data.spot){
          spotInput.value = Number(data.spot).toFixed(2);
          emAnchorSpot = Number(data.spot); // fresh market price re-anchors the ±1σ band
        }
        seedIvFromAtm(data, sel.value);
        // The selected ticker owns inherited legs. Re-anchor every inherited
        // option to the new underlying before snapping to the new chain.
        [legs, legsB].forEach(function(list) {
          if (!list || !data.spot) return;
          list.forEach(function(leg) {
            if (leg.tickerManual || leg.type === 'stock') return;
            if (!leg.strike || leg.premiumFromChain || leg._tickerReanchorPending) {
              leg.strike = Number(data.spot);
            }
            leg._tickerReanchorPending = false;
          });
        });
        reanchorDefaultLegStrike(legs, data.spot);
        reanchorDefaultLegStrike(legsB, data.spot);
        applyChainQuotesToLegs(legs, { snapStrikes: true, setDte: true, force: true });
        if (typeof legsB !== 'undefined' && legsB && legsB.length) {
          applyChainQuotesToLegs(legsB, { snapStrikes: true, setDte: true, force: false });
        }
        syncDTESlider();
        updateSpotSliderRange();
        renderLegs();
        if (typeof renderLegsB === 'function' && compareMode) renderLegsB();
        renderChainTable();
        if (typeof resetSimulation === 'function') resetSimulation();
        else if (typeof liveUpdate === 'function') liveUpdate();
        onRangeChange(); // fresh market price asserted: re-lock the Range window around it
        // Batch C fix: new chain arrived — refresh discovery expiry selects
        // and re-run any scans invalidated by the ticker change.
        if (typeof resolveDiscoveryStale === 'function') resolveDiscoveryStale();
        else if (typeof syncDiscoveryExpiries === 'function') syncDiscoveryExpiries();
        const dteNow = expirationDte(sel.value);
        const qStatus = document.getElementById('quoteStatus');
        if (qStatus){
          qStatus.textContent = `${data.symbol} $${data.spot ? Number(data.spot).toFixed(2) : '?'} • exp ${sel.value} (${dteNow}d) • ${data.expirations.length} expirations • ${data.source || 'CBOE'} — fields stay editable`;
          qStatus.className='quote-status ok';
        }
        const filterSel = document.getElementById('chainFilterTop');
        const filterLabel = filterSel && filterSel.selectedIndex >= 0 ? filterSel.options[filterSel.selectedIndex].text : 'ATM ±20%';
        statusEl.textContent = `${data.symbol} spot $${data.spot ? Number(data.spot).toFixed(2) : '?'} • default exp ${sel.value} (${dteNow}d) • Filter ${filterLabel}`;
        statusEl.className='quote-status ok';
      }catch(err){
        // Batch C fix: a superseded request must not clear the new ticker's
        // UI into manual-data mode when its own (stale) fetch fails.
        if (reqId !== _chainReqId) return;
        console.error(err);
        enterManualDataMode(sym, `No market data found for ${sym} (${err && err.message ? err.message : err}). Enter Spot, Strike and Premium manually below — try a listed equity/index ticker such as SPY, QQQ, AAPL, or SPX for a live chain.`);
      }
    }
    // Round 2 item 2: clickable bid/ask on the chain. Clicking the bid
    // stages a SELL leg at the bid; clicking the ask stages a BUY leg at the
    // ask (thinkorswim-style). Falls back to the mid-price display when
    // bid/ask are missing or zero.
    function baCell(q, type, strike, expStr){
      if (!q) return `<td class="price">—</td>`;
      const b = Number(q.bid), a = Number(q.ask);
      if (b > 0 && a > 0){
        return `<td class="price has ba-cell">` +
          `<button type="button" class="ba ba-bid" title="Sell at the bid $${b.toFixed(2)}" onclick="addLegFromChain('${type}', ${strike}, ${b}, '${expStr}', 'sell')">${b.toFixed(2)}</button>` +
          `<span class="ba-sep">×</span>` +
          `<button type="button" class="ba ba-ask" title="Buy at the ask $${a.toFixed(2)}" onclick="addLegFromChain('${type}', ${strike}, ${a}, '${expStr}', 'buy')">${a.toFixed(2)}</button></td>`;
      }
      const m = midPrice(q);
      return `<td class="price ${m?'has':''}">${m? '$'+m.toFixed(2):'—'}</td>`;
    }
    function renderChainTable(){
      const wrap = document.getElementById('chainTableWrap');
      const sel = document.getElementById('chainExpiration');
      const filterTop = document.getElementById('chainFilterTop');
      const data = window._cboeData;
      if (!data || !sel || !sel.value){ wrap.innerHTML='<div style="padding:14px;color:var(--muted)">No chain loaded — pick or type a ticker above.</div>'; return; }
      const exp = sel.value;
      const chain = data.chains ? data.chains[exp] : null;
      if (!chain){ wrap.innerHTML='<div style="padding:14px">Empty chain for '+exp+'</div>'; return; }
      const callMap = new Map(chain.calls.map(c=>[c.strike,c]));
      const putMap = new Map(chain.puts.map(p=>[p.strike,p]));
      let strikes = chain.strikes;
      const spotManual = parseFloat(document.getElementById('spot').value) || Number(data.spot) || 100;
      const filt = filterTop ? filterTop.value : 'atm20';
      let visible = strikes;
      if (filt!=='all'){
        const pct = filt==='atm5'?0.05 : filt==='atm10'?0.10 : filt==='atm20'?0.20 : 0.30;
        const lo = spotManual * (1-pct);
        const hi = spotManual * (1+pct);
        visible = strikes.filter(s=>s>=lo && s<=hi);
        if (!visible.length){
          visible = strikes.map(k=>({k,d:Math.abs(k-spotManual)})).sort((a,b)=>a.d-b.d).slice(0, Math.min(40, strikes.length)).map(x=>x.k).sort((a,b)=>a-b);
        }
      }
      const p = getParams();
      const T = Math.max(0, expirationDte(exp)) / 365;
      function deltaFor(q, type, strikeVal) {
        if (!q) return '—';
        const ivPct = quoteIvPct(q);
        const sigma = (ivPct ? ivPct : p.iv * 100) / 100;
        if (!sigma || sigma <= 0) return '—';
        const d = isFuturesTicker(data.symbol)
          ? black76Delta(spotManual, strikeVal, T, p.r, sigma, type)
          : bsDelta(spotManual, strikeVal, T, p.r, p.q, sigma, type);
        if (!isFinite(d)) return '—';
        return d.toFixed(2);
      }
      let html = '<table class="chain-table"><thead><tr><th>Δ</th><th>Call</th><th></th><th>Strike</th><th></th><th>Put</th><th>Δ</th></tr></thead><tbody>';
      // Single strike nearest spot — gets the strong ATM marker (line + pill).
      let atmStrike = null, atmD = Infinity;
      visible.forEach(s => { const d = Math.abs(s - spotManual); if (d < atmD) { atmD = d; atmStrike = s; } });
      visible.slice().reverse().forEach(strike=>{
        const c = callMap.get(strike);
        const p2 = putMap.get(strike);
        const cPrice = c ? midPrice(c) : 0;
        const pPrice = p2 ? midPrice(p2) : 0;
        const isATM = Math.abs(strike-spotManual) < spotManual*0.02;
        const isExactATM = atmStrike !== null && strike === atmStrike;
        const cls = (isATM?'atm':'') + (isExactATM?' atm-exact':'');
        const dat = (isATM?' data-atm="1"':'') + (isExactATM?' data-atm-exact="1"':'');
        html += `<tr class="${cls.trim()}"${dat}>`;
        html += `<td class="delta">${deltaFor(c, 'call', strike)}</td>`;
        html += baCell(c, 'call', strike, exp);
        html += `<td><button class="btn-add" onclick="addLegFromChain('call', ${strike}, ${cPrice||0}, '${exp}')">Add Call</button></td>`;
        html += `<td class="strike">${strike}${isExactATM?'<span class="atm-tag">ATM</span>':''}</td>`;
        html += `<td><button class="btn-add" onclick="addLegFromChain('put', ${strike}, ${pPrice||0}, '${exp}')">Add Put</button></td>`;
        html += baCell(p2, 'put', strike, exp);
        html += `<td class="delta">${deltaFor(p2, 'put', strike)}</td>`;
        html += `</tr>`;
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
      centerChainOnAtm();
    }
    // Vertically center the strike nearest spot inside the chain's scroll
    // container only — the page itself must not move. Runs after every
    // chain render (load, expiry change, ATM% filter change).
    function centerChainOnAtm(){
      const wrap = document.getElementById('chainTableWrap');
      if (!wrap) return;
      const rows = wrap.querySelectorAll('tr[data-atm-exact="1"],tr[data-atm="1"]');
      if (!rows.length) return;
      const spotEl = document.getElementById('spot');
      const spot = (spotEl && parseFloat(spotEl.value)) || 0;
      let best = null, bestD = Infinity;
      rows.forEach(r => {
        const cell = r.querySelector('td.strike');
        const s = cell ? parseFloat(cell.textContent) : NaN;
        if (!isFinite(s)) return;
        const d = Math.abs(s - spot);
        if (d < bestD) { bestD = d; best = r; }
      });
      if (!best) return;
      const head = wrap.querySelector('thead');
      const headH = head ? head.getBoundingClientRect().height : 0;
      const wrapRect = wrap.getBoundingClientRect();
      const rowRect = best.getBoundingClientRect();
      const visibleH = wrap.clientHeight - headH;
      const target = wrap.scrollTop + (rowRect.top - wrapRect.top - headH) - visibleH / 2 + rowRect.height / 2;
      wrap.scrollTop = Math.max(0, target);
    }
    function addLegFromChain(type, strike, premium, expStr, side){
      markBuildDirty();
      const today = new Date(); today.setHours(0,0,0,0);
      const expDate = new Date(expStr);
      const dte = Math.max(0, Math.round((expDate - today)/86400000));
      const legSide = side === 'sell' ? 'sell' : 'buy'; // Round 2 item 2: bid click => sell, ask click => buy
      const leg = {
        id: nextId++,
        side: legSide,
        type: type,
        strike: Number(strike),
        dte: dte,
        qty: 1,
        premium: Number(premium) ? Math.round(Number(premium)*100)/100 : 0.05,
        premiumManual: true,
        ticker: normalizeTicker(document.getElementById('ticker').value)
      };
      legs.push(leg);
      renderLegs();
      recalc();
      if (typeof resetSimulation==='function') resetSimulation();
      const qs = document.getElementById('quoteStatus');
      if(qs){ qs.textContent = `Added ${legSide.toUpperCase()} ${type.toUpperCase()} ${strike} exp ${expStr} (DTE ${dte}) @ $${leg.premium} — editable`; qs.className='quote-status ok'; }
      if (typeof syncDTESlider === 'function') syncDTESlider();
    }
    // ---- Cross-page navigation ----
    // Where the analyzer/simulator page lives. Change this if you deploy it
    // somewhere else. The position travels as ?setup=<token>.
    const ANALYZER_URL = '/simulator/';

    function openInAnalyzer() {
      const token = (typeof legsToQuery === 'function') ? legsToQuery() : '';
      if (!token) return;
      window.open(ANALYZER_URL + '?setup=' + token, '_blank');
    }

    function showAnalyzeEmptyState() {
      const n = document.getElementById('analyzeEmpty');
      if (n) n.style.display = 'block';
      const main = document.getElementById('analyzeMain');
      if (main) main.style.display = 'none';
    }

    // Boot once: honor ?setup= or ?template= on every load/refresh.
    // The same engine powers the builder page (legs editor + payoff chart)
    // and the analyzer page (summary + Greeks + simulator); each boots only
    // the sections present in its DOM.
    (function bootBuilder() {
      var params = null;
      try { params = new URLSearchParams(window.location.search); } catch (e) {}
      var setupToken = params ? params.get('setup') : null;
      var templateKey = params ? params.get('template') : null;
      var spotEl = document.getElementById('spotSlider');
      if (spotEl) spotEl.value = 100;

      function bootShared() {
        if (typeof syncDTESlider === 'function') syncDTESlider();
        if (HAS_PAYOFF && typeof updateSpotSliderRange === 'function') updateSpotSliderRange();
        if (HAS_LEGS && typeof renderLegs === 'function') renderLegs();
        recalc();
        resetSimulation();
        // The payoff chart loads with the Range slider's window (±20%
        // default) locked around the asserted spot. Builder page only.
        if (HAS_PAYOFF && typeof onRangeChange === 'function') onRangeChange();
      }

      if (setupToken && legsFromQuery(setupToken)) {
        bootShared();
        var tip = document.getElementById('templateTip');
        if (tip) tip.innerHTML = 'Shared setup loaded from the URL. Edit freely.';
        if (HAS_CHAIN && typeof loadCboeChain === 'function') loadCboeChain();
        return;
      }

      if (templateKey && HAS_LEGS) {
        var sel = document.getElementById('strategyTemplate');
        var found = false;
        if (sel) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === templateKey) {
              sel.value = templateKey;
              found = true;
              break;
            }
          }
        }
        if (found && typeof applyTemplate === 'function') {
          applyTemplate();
          if (HAS_PAYOFF && typeof onRangeChange === 'function') onRangeChange();
          if (typeof loadCboeChain === 'function') loadCboeChain();
          return;
        }
      }

      if (!HAS_LEGS) {
        // Analyzer page opened without a position: show the empty state.
        if (typeof showAnalyzeEmptyState === 'function') showAnalyzeEmptyState();
        return;
      }

      legs = defaultLongCall();
      syncDTESlider();
      updateSpotSliderRange();
      renderLegs();
      recalc();
      resetSimulation();
      // The payoff chart loads with the Range slider's window (±20% default) locked.
      if (HAS_PAYOFF && typeof onRangeChange === 'function') onRangeChange();
      if (typeof loadCboeChain === 'function') loadCboeChain();
    })();
