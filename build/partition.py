#!/usr/bin/env python3
"""Partition the single-file builder into:
  assets/jsm-options-engine.js   shared engine (section-guarded)
  builder/index.html             slim builder (templates, legs, payoff, guide)
  simulator/index.html           analyzer (summary, Greeks, simulator)

Run from anywhere:  python3 partition.py
"""
import os

SRC = os.path.expanduser('~/workspace/your_files/jsm-options-builder-fixed.html')
OUT = os.path.expanduser('~/workspace/your_files/jsm-site')
for d in ('builder', 'simulator', 'assets'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

html = open(SRC, encoding='utf-8').read()

# ---------------------------------------------------------------- engine ---
script_marker = '  <script>\n    const MULTIPLIER = 100;'
si = html.find(script_marker)
assert si != -1, 'engine script start not found'
code_start = si + len('  <script>\n')
boot_i = html.find('(function bootBuilder() {')
assert boot_i != -1
se = html.find('</script>', boot_i)
assert se != -1
engine = html[code_start:se]


def rep(old, new, count=1, name='?'):
    global engine
    n = engine.count(old)
    assert n == count, f'{name}: expected {count} occurrence(s), found {n}'
    engine = engine.replace(old, new)


# M1: section presence flags + setText helper
rep("""    let legs = [];
    let chart = null;""",
    """    let legs = [];
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
    }""", name='M1 flags')

# M2: paintNetPremium helper after paintPL
rep("""    function paintPL(el, val) {
      if (!el) return;
      el.textContent = (val >= 0 ? '+' : '') + formatMoney(val);
      el.style.color = val >= 0 ? 'var(--green)' : 'var(--red)';
      el.classList.remove('pl-positive', 'pl-negative');
      el.classList.add(val >= 0 ? 'pl-positive' : 'pl-negative');
    }""",
    """    function paintPL(el, val) {
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
    }""", name='M2 paintNetPremium')

# M3: recalc() rewritten with section guards (+ dedup breakevens)
ri = engine.find('    function recalc() {')
rj = engine.find('    function updateGreeksUI() {', ri)
assert ri != -1 and rj != -1, 'recalc boundaries not found'
new_recalc = """    function recalc() {
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
        // Exact extremes over [0, ∞): the chart grid's locked ±20% window can
        // cut off the true worst/best case (see expiryExtremes).
        const ex = expiryExtremes(legs);
        const maxP = ex.maxP;
        const minP = ex.minP;
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


"""
engine = engine[:ri] + new_recalc + engine[rj:]

# M4: updateGreeksUI guard
rep("""    function updateGreeksUI() {
      if (!legs.length) {""",
    """    function updateGreeksUI() {
      if (!document.getElementById('gDelta')) return;
      if (!legs.length) {""", name='M4 greeks guard')

# M4b: IV shock reprices simulated day-by-day P/L history so "P/L now" and the
# P/L path stay consistent with the chosen scenario.
rep("""    function setIvShock(m) {
      ivShockMultVal = m;""",
    """    function setIvShock(m) {
      ivShockMultVal = m;
      // Reprice any simulated day-by-day P/L history under the new shock so
      // "P/L now" and the P/L path stay consistent with the chosen scenario.
      if (typeof simPLLog !== 'undefined' && simPLLog.length && typeof maxDTE !== 'undefined') {
        simPLLog.forEach(function (row) {
          row.pl = plAt(row.price, Math.max(0, maxDTE - row.day));
        });
      }""", name='M4b shock reprices sim log')

# M5: resetSimulation — guard sim-only renders (function-scoped)
fi = engine.find('    function resetSimulation() {')
fj = engine.find('\n    }\n', fi)
assert fi != -1 and fj != -1, 'resetSimulation boundaries not found'
block = engine[fi:fj]
old_tail = """      recalc();
      renderSimChart();
      renderSimLog();
      updateSimReadout();
      updateSimButtonsState();"""
assert block.count(old_tail) == 1, 'M5 tail not unique inside resetSimulation'
block = block.replace(old_tail, """      recalc();
      if (HAS_SIM) {
        renderSimChart();
        renderSimLog();
        updateSimReadout();
        updateSimButtonsState();
      }""")
old_dl = "        document.getElementById('daysLeftLabel').textContent = maxDTE;"
assert block.count(old_dl) == 1
block = block.replace(old_dl, "        setText('daysLeftLabel', maxDTE);")
engine = engine[:fi] + block + engine[fj:]

# M6: updateSpotSliderRange guard + thumb sync (now in the monolith; verify it
# survives into the built engine)
rep("""      const slider = document.getElementById('spotSlider');
      if (!slider) return;
      slider.min = Math.max(1, Math.floor(lo));
      slider.max = Math.ceil(hi);""",
    """      const slider = document.getElementById('spotSlider');
      if (!slider) return;
      slider.min = Math.max(1, Math.floor(lo));
      slider.max = Math.ceil(hi);""", name='M6 spot slider guard')

# M7: syncDTESlider guards
rep("""      const slider = document.getElementById('daysLeft');
      slider.max = maxDTE;
      if (parseInt(slider.value, 10) > maxDTE) slider.value = maxDTE;
      document.getElementById('daysLeftLabel').textContent = slider.value;""",
    """      const slider = document.getElementById('daysLeft');
      if (!slider) return;
      slider.max = maxDTE;
      if (parseInt(slider.value, 10) > maxDTE) slider.value = maxDTE;
      setText('daysLeftLabel', slider.value);""", name='M7 dte slider guard')

# M8: renderLegs guard
rep("""    function renderLegs() {
      const container = document.getElementById('legsList');
      if (!legs.length) {""",
    """    function renderLegs() {
      const container = document.getElementById('legsList');
      if (!container) return;
      if (!legs.length) {""", name='M8 renderLegs guard')

# M9: initTemplatePreviews guard
rep("""    function initTemplatePreviews() {
      bindTemplatePicker('strategyTemplate', 'tplPopover', 'tplTrigger');""",
    """    function initTemplatePreviews() {
      if (!HAS_LEGS) return;
      bindTemplatePicker('strategyTemplate', 'tplPopover', 'tplTrigger');""",
    name='M9 previews guard')

# M10: updatePositionSummary — compute net directly instead of copying builder's
rep("""      const netEl = document.getElementById('posNetPremium');
      const sourceNet = document.getElementById('netPremium');
      if (netEl && sourceNet) {
        netEl.textContent = sourceNet.textContent;
        netEl.style.color = sourceNet.style.color;
      }""",
    """      paintNetPremium(document.getElementById('posNetPremium'), initialCost());""",
    name='M10 summary net')

# M10b: earnings / ex-dividend markers on the simulation day horizon.
rep("""    function renderSimChart() {""",
    """    // ---------- Earnings / ex-dividend markers on the day horizon ----------
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
    function renderSimChart() {""",
    name='M10b event marker helpers')

# M10c: draw the markers on the SVG price-path chart
rep("""      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.innerHTML = svgHtml;""",
    """      // Earnings / ex-dividend markers on the day axis
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
      svg.innerHTML = svgHtml;""",
    name='M10c svg markers')

# M10d: same markers on the Chart.js P/L path (update + creation)
rep("""      if (posChart) {
        posChart.data.labels = series.labels;
        posChart.data.datasets[0].data = series.data;
        posChart.update('none');
      } else {""",
    """      if (posChart) {
        posChart.data.labels = series.labels;
        posChart.data.datasets[0].data = series.data;
        if (posChart.options.plugins) posChart.options.plugins.eventMarkers = { events: eventMarkers() };
        posChart.update('none');
      } else {""",
    name='M10d chart update markers')
rep("""        posChart = new Chart(canvas.getContext('2d'), {
          type: 'line',
          data: {""",
    """        posChart = new Chart(canvas.getContext('2d'), {
          type: 'line',
          plugins: [eventMarkerPlugin],
          data: {""",
    name='M10d chart plugin register')
rep("""          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },""",
    """          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, eventMarkers: { events: eventMarkers() } },""",
    name='M10d chart options markers')

# M10e: share URL carries the event dates too
rep("""        var obj = { legs: payload, S: S, ticker: tkrEl ? tkrEl.value : '', comm: commEl ? commEl.value : '' };""",
    """        var earnEl = document.getElementById('earnDate');
        var exdivEl = document.getElementById('exDivDate');
        var obj = { legs: payload, S: S, ticker: tkrEl ? tkrEl.value : '', comm: commEl ? commEl.value : '',
          earn: earnEl ? earnEl.value : '', exdiv: exdivEl ? exdivEl.value : '' };""",
    name='M10e share out')
rep("""        if (obj.comm != null && obj.comm !== '' && document.getElementById('commission')) {
          document.getElementById('commission').value = obj.comm;
        }""",
    """        if (obj.comm != null && obj.comm !== '' && document.getElementById('commission')) {
          document.getElementById('commission').value = obj.comm;
        }
        if (obj.earn && document.getElementById('earnDate')) {
          document.getElementById('earnDate').value = obj.earn;
        }
        if (obj.exdiv && document.getElementById('exDivDate')) {
          document.getElementById('exDivDate').value = obj.exdiv;
        }""",
    name='M10e share in')

# M11+M12: cross-page helpers + rewritten boot
bi = engine.find('    (function bootBuilder() {')
assert bi != -1, 'boot not found'
new_tail = """    // ---- Cross-page navigation ----
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
"""
engine = engine[:bi] + new_tail

open(os.path.join(OUT, 'assets', 'jsm-options-engine.js'), 'w', encoding='utf-8').write(engine)
print('engine written:', len(engine), 'chars')
# Content-hash cache buster so browsers never run a stale engine against new HTML.
import hashlib as _hl
engine_src = '/assets/jsm-options-engine.js?v=' + _hl.md5(engine.encode('utf-8')).hexdigest()[:8]
print('engine src:', engine_src)

# ------------------------------------------------------------ shared head ---
head_end = html.find('</head>') + len('</head>')
head = html[:head_end]
# fix pre-existing stray brace in the monolith's CSS (browsers tolerate it, keep output valid)
_stray = '#themeLabel{display:none}}.theme-toggle .theme-label,#themeLabel{display:none}}'
assert head.count(_stray) == 1, 'stray-brace pattern not found'
head = head.replace(_stray, _stray[:-1])
body_start = html.find('<body>')

# small scripts after the main one (nav toggle, offline stripper)
def script_block(after_idx, marker):
    i = html.find(marker, after_idx)
    j = html.find('</script>', i) + len('</script>')
    return html[i:j], j

nav_js, k1 = script_block(se, '<script>\n(function(){')
off_js, k2 = script_block(k1, '<script>')

# strategy guide drawer markup (sits between the main script and the nav script)
drawer_start = html.find('<!-- Strategy guide drawer -->', se)
drawer_end = html.find('</aside>', drawer_start) + len('</aside>')
guide_drawer = html[drawer_start:drawer_end]
assert 'id="guideDrawer"' in guide_drawer, 'guide drawer markup not found'

# --------------------------------------------------------------- pieces ----
charts_comment = '    <!-- Stock simulator (left) + Position Summary (right), same size -->'
ci = html.find(charts_comment)
greeks_comment = '    <!-- Option Greeks -->'
gi = html.find(greeks_comment)
assert ci != -1 and gi != -1

sim_h2 = html.find('<h2>📈 Simulate underlying price')
sim_card_start = html.rfind('      <div class="card">', 0, sim_h2)
sum_comment = '      <!-- Position Summary — how P/L has moved across the simulated days -->'
sum_i = html.find(sum_comment)
sim_card = html[sim_card_start:sum_i]
# Simulator card: cleaner heading + event-marker legend
assert 'Simulate underlying price ( Hypothetically )' in sim_card
sim_card = sim_card.replace(
    '<h2>📈 Simulate underlying price ( Hypothetically ) <span style="font-size:0.72rem;color:var(--muted);font-weight:500;">(step the trade day by day)</span></h2>',
    '<h2>📈 Day-by-day price simulator <span style="font-size:0.72rem;color:var(--muted);font-weight:500;">(step the trade forward)</span></h2>',
    1)
assert '<svg id="simSvg" viewBox="0 0 600 200" preserveAspectRatio="none"></svg>' in sim_card
sim_card = sim_card.replace(
    '''<div class="sim-chart-wrap" id="simChartWrap">
          <svg id="simSvg" viewBox="0 0 600 200" preserveAspectRatio="none"></svg>
          <div class="sim-tooltip" id="simTooltip"></div>
        </div>''',
    '''<div class="sim-chart-wrap" id="simChartWrap">
          <svg id="simSvg" viewBox="0 0 600 200" preserveAspectRatio="none"></svg>
          <div class="sim-tooltip" id="simTooltip"></div>
        </div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:4px;">📅 Day-axis markers: <strong style="color:#f59e0b;">E</strong> = earnings · <strong style="color:#a78bfa;">D</strong> = ex-dividend (set the dates in Assumptions above)</div>''',
    1)
assert '<label>Simulated drift (annual)' in sim_card
sim_card = sim_card.replace(
    '''<label>Simulated drift (annual) <strong id="simDriftLabel">0%</strong></label>''',
    '''<label>Simulated drift (annual) <strong id="simDriftLabel">0%</strong></label>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">Average yearly trend of the simulated price path — +10% drifts upward, −10% drifts downward, 0% = no trend.</div>''',
    1)
summary_card = html[sum_i:gi]
# Simulator: plain-English legend for model vs expiry P/L, and a gloss on 1σ.
assert '<div class="label">Model P/L</div>' in summary_card
summary_card = summary_card.replace(
    '<h2>Position summary <span style="font-size:0.72rem;color:var(--muted);font-weight:500;">model vs expiry</span></h2>',
    '<h2>Position summary <span style="font-size:0.72rem;color:var(--muted);font-weight:500;">model vs expiry</span></h2>\n'
    '        <div style="font-size:0.78rem;color:var(--muted);margin:-2px 0 10px;"><b>Model P/L</b> = what the position is worth <b>right now</b> (time value included). '
    '<b>Expiry P/L</b> = what it would be worth <b>at expiration</b> (intrinsic value only).</div>',
    1)
assert '<div class="label">Expected move (1σ)</div>' in summary_card
summary_card = summary_card.replace(
    '<div class="label">Expected move (1σ)</div>',
    '<div class="label" title="One-standard-deviation expected move: roughly two-thirds of the time, the stock is expected to stay within this range by expiration. Same idea as the ±1σ band on the Builder chart.">Expected move (±1σ)</div>',
    1)

# greeks card: from comment through the card's closing </div>
edu_i = html.find('id="eduTip"', gi)
gcard_end = html.find('      </div>\n    </div>\n', edu_i) + len('      </div>\n    </div>\n')
greeks_card = html[gi:gcard_end]

# header block (site header + breadcrumbs), to reuse on simulator
hdr_start = html.find('    <header class="site-header">')
crumb_end = html.find('</nav>', html.find('<nav class="breadcrumbs"')) + len('</nav>')
site_header = html[hdr_start:crumb_end]

# ----------------------------------------------------------- builder page ---
builder_body = html[body_start:si]
# h1
builder_body = builder_body.replace(
    '<h1>Options Strategy Builder &amp; Simulator</h1>',
    '<h1>Options Strategy Builder</h1>')
# drop sim+summary row and greeks card
builder_body = builder_body[:builder_body.find(charts_comment)] + builder_body[builder_body.find(greeks_comment):]
builder_body = builder_body.replace(greeks_card, '')
# visible chart controls
builder_body = builder_body.replace(
    """      <!-- Days Remaining drives the math (and stays in sync with the simulator
           below); it's just no longer shown as a separate slider since
           Advance Day covers that job now. The Implied volatility slider
           below replaces the old Underlying slider (per user request). -->
      <div class="hidden-controls">""",
    """      <!-- Days remaining & implied volatility drive the dashed "with time
           left" payoff line. -->
      <div class="chart-controls">""")
builder_body = builder_body.replace(
    '''        <div class="slider-group" style="margin-top:6px;">
          <label>Implied volatility <strong id="ivSliderLabel">25%</strong></label>''',
    '''        <div class="slider-group">
          <label>Implied volatility <strong id="ivSliderLabel">25%</strong></label>''')
# analyze button next to share — REMOVED 2026-09-27 per user request ("don't need
# it for now"). Kept here commented for easy restore; the openInAnalyzer()
# function stays in the engine and A6 still covers it.
# builder_body = builder_body.replace(
#     '''<button class="btn-secondary btn-sm" id="shareSetup">🔗 Share link</button>''',
#     '''<button class="btn-secondary btn-sm" id="shareSetup">🔗 Share link</button>
#             <button class="btn-secondary btn-sm" onclick="openInAnalyzer()" title="Open this position in the Analyzer &amp; Simulator">📊 Analyze →</button>''')

builder_head = head.replace(
    '    .hidden-controls { display: none; }',
    '''    .hidden-controls { display: none; }
    .chart-controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }''')

builder_html = (builder_head + '\n' + builder_body
                + '\n' + guide_drawer
                + '\n  <script src="' + engine_src + '"></script>\n'
                + nav_js + '\n' + off_js + '\n</body>\n</html>\n')
open(os.path.join(OUT, 'builder', 'index.html'), 'w', encoding='utf-8').write(builder_html)
print('builder written:', len(builder_html), 'chars')

# --------------------------------------------------------- simulator page ---
sim_header = site_header.replace(
    '<a href="/builder/" class="active">Builder</a>',
    '<a href="/builder/">Builder</a><a href="/simulator/" class="active">Simulator</a>')
sim_header = sim_header.replace(
    '<span aria-current="page">Builder</span>',
    '<span aria-current="page">Simulator</span>')

assumptions = """  <div class="card">
    <h2>Assumptions <span style="font-size:0.72rem;color:var(--muted);font-weight:500;">edit to re-run scenarios</span></h2>
    <div class="top-bar">
      <div class="field">
        <label>Symbol / Ticker</label>
        <input id="ticker" type="text" value="SPY" readonly style="opacity:.7" />
      </div>
      <div class="field">
        <label>Underlying price ($)</label>
        <input id="spot" type="number" value="100" step="0.5" min="1" oninput="onSpotInput()" onchange="resetSimulation()" />
      </div>
      <div class="field">
        <label>IV (%)</label>
        <input id="iv" type="number" value="25" step="1" min="1" max="200" oninput="recalc()" />
      </div>
      <div class="field">
        <label title="Risk-free interest rate used in option pricing. 5% is a typical default; it barely moves short-dated option values.">Rate (%)</label>
        <input id="rate" type="number" value="5" step="0.25" min="0" max="20" oninput="recalc()" />
      </div>
      <div class="field">
        <label title="Annual dividend yield of the stock. Dividends slightly lower call values and raise put values; 0% is fine for non-payers.">Dividend (%)</label>
        <input id="divYield" type="number" value="0" step="0.1" min="0" max="15" oninput="recalc()" />
      </div>
      <div class="field">
        <label title="Round-trip commission per option contract">Commission $/contract</label>
        <input id="commission" type="number" min="0" step="0.05" value="0" oninput="recalc()" />
      </div>
      <div class="field">
        <label title="Show an E marker on the simulation day-horizon">Next earnings</label>
        <input id="earnDate" type="date" oninput="onEventDateChange()" />
      </div>
      <div class="field">
        <label title="Show a D marker on the simulation day-horizon">Ex-dividend</label>
        <input id="exDivDate" type="date" oninput="onEventDateChange()" />
      </div>
      <div class="field">
        <label>Days remaining <strong id="daysLeftLabel">90</strong></label>
        <input type="range" id="daysLeft" min="0" max="90" value="90" oninput="onDaysChange()" />
      </div>
    </div>
  </div>
"""

sim_head = head.replace(
    '<title>Free Options Strategy Builder &amp; Payoff Calculator</title>',
    '<title>Position Analyzer &amp; Simulator | JSM Options</title>')

sim_body = """<body>
""" + sim_header + """
  <div class="builder-wrap">
  <h1>Position Analyzer &amp; Simulator</h1>
  <p class="subtitle"><a href="/builder/">← Back to Builder</a> · Full position detail and what-if simulation for the setup sent from the Builder</p>
  <p class="subtitle" style="margin-top:-8px;">New here? The <b>Builder</b> draws your strategy's profit/loss picture; this page takes that same position and <b>steps it forward day by day</b> — change the assumptions (price, volatility, time left) and watch what happens to its value <i>before</i> expiration. An educational model, not a prediction.</p>

  <div class="card" id="analyzeEmpty" style="display:none;">
    <h2>No position loaded</h2>
    <p>Open this page from the <a href="/builder/">Strategy Builder</a> with the <strong>📊 Analyze →</strong> button, or paste a shared setup link — the position travels in the URL.</p>
  </div>

  <div id="analyzeMain">
""" + assumptions + '\n' + summary_card + '\n' + greeks_card + '\n' + sim_card + """
  </div>
  </div>
  <script src="__ENGINE_SRC__"></script>
""" + nav_js + '\n' + off_js + '\n</body>\n</html>\n'

sim_html = sim_head + '\n' + sim_body
sim_html = sim_html.replace('__ENGINE_SRC__', engine_src)
open(os.path.join(OUT, 'simulator', 'index.html'), 'w', encoding='utf-8').write(sim_html)
print('simulator written:', len(sim_html), 'chars')

# ------------------------------------------------------------------ readme ---
readme = """# jsm-options.com — Builder + Simulator pages

Upload these three files (replacing the old single-file builder):

| File | Deploy to |
|---|---|
| `assets/jsm-options-engine.js` | `/assets/jsm-options-engine.js` (same folder as `site.js`) |
| `builder/index.html` | `/builder/index.html` (replaces the old builder file) |
| `simulator/index.html` | `/simulator/index.html` (new page) |

How it works
- Both pages load the same engine (`/assets/jsm-options-engine.js`). The engine
  detects which sections exist in the DOM and only updates those.
- The Builder keeps: templates, live chain, legs editor (A/B compare), payoff
  chart with compact summary, and the strategy guide drawer. New: visible
  "Days remaining" / "Underlying" sliders under the payoff chart, and a
  📊 Analyze → button that opens the position in the Simulator (new tab).
- The Simulator receives the position via `?setup=<token>` (same encoding as
  Share link). It shows: assumptions, full position summary, Greeks, and the
  day-by-day simulator with IV shock. "Next earnings" / "Ex-dividend" dates in
  Assumptions draw E / D markers on the simulation day-axis (also carried in
  the share token).
- Opening `/simulator/` with no `?setup=` shows a friendly empty state.

If you deploy the simulator somewhere other than `/simulator/`, update the
`ANALYZER_URL` constant at the bottom of `jsm-options-engine.js`.
"""
open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8').write(readme)
print('done')
