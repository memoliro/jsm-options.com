/**
 * Cloudflare Pages Function: /api/cboe/chain?symbol=SPY
 * Free educational proxy for CBOE delayed quotes (15m delayed)
 * Returns grouped chain + spot + DTE for builder. No IV calc needed - CBOE provides it.
 * Used by Strikebench lab for live payoff.
 */

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  let symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase().trim();

  const indexMap = { 'SPX': '_SPX', 'NDX': '_NDX', 'VIX': '_VIX', 'RUT': '_RUT', 'DJX': '_DJX', 'SPXW': '_SPXW', 'SPXW': '_SPXW' };
  if (indexMap[symbol]) symbol = indexMap[symbol];

  symbol = symbol.replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!symbol) symbol = 'SPY';

  const cboeUrl = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`;

  try {
    const r = await fetch(cboeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JSM Options Educational; +https://jsm-options.com)',
        'Accept': 'application/json',
        'Referer': 'https://www.cboe.com/',
      },
      cf: { cacheTtl: 60, cacheEverything: true }
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`CBOE ${r.status}: ${txt.slice(0,300)}`);
    }

    const raw = await r.json();
    const data = raw && raw.data ? raw.data : raw;
    const spot = data.close ?? data.current_price ?? data.last_sale_price ?? data.currentPrice ?? null;
    const optionsArray = Array.isArray(data.options) ? data.options : [];

    const expMap = new Map();
    const re = /(\d{6})([CP])(\d{8})$/;
    const today = new Date();

    for (const o of optionsArray) {
      const occ = o.option || o.symbol || '';
      const m = occ.match(re);
      if (!m) continue;
      const yymmdd = m[1];
      const cp = m[2];
      const strikeRaw = m[3];
      const yy = parseInt(yymmdd.slice(0,2),10);
      const mm = yymmdd.slice(2,4);
      const dd = yymmdd.slice(4,6);
      const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
      const expISO = `${yyyy}-${mm}-${dd}`;
      // DTE filter 0-365
      const expDate = new Date(`${expISO}T00:00:00Z`);
      const dte = Math.round((expDate - today)/86400000);
      if (dte < -2 || dte > 365) continue;

      const strike = parseInt(strikeRaw,10)/1000;

      if (!expMap.has(expISO)) expMap.set(expISO, { dte, calls: new Map(), puts: new Map() });
      const bucket = expMap.get(expISO);
      const simplified = {
        strike,
        occ,
        bid: o.bid ?? null,
        ask: o.ask ?? null,
        last: o.last ?? o.last_price ?? null,
        iv: o.iv ?? o.implied_volatility ?? null,
        oi: o.open_interest ?? o.openInterest ?? null,
        vol: o.volume ?? null,
        delta: o.delta ?? null,
        gamma: o.gamma ?? null,
        theta: o.theta ?? null,
        vega: o.vega ?? null,
      };
      if (cp === 'C') bucket.calls.set(strike, simplified);
      else bucket.puts.set(strike, simplified);
    }

    const expirations = Array.from(expMap.keys()).sort();
    const chains = {};
    for (const exp of expirations) {
      const b = expMap.get(exp);
      const callStrikes = Array.from(b.calls.keys()).sort((a,b)=>a-b);
      const putStrikes = Array.from(b.puts.keys()).sort((a,b)=>a-b);
      chains[exp] = {
        dte: b.dte,
        calls: callStrikes.map(k=>b.calls.get(k)),
        puts: putStrikes.map(k=>b.puts.get(k)),
        strikes: Array.from(new Set([...callStrikes, ...putStrikes])).sort((a,b)=>a-b),
      };
    }

    return new Response(JSON.stringify({
      symbol: symbol.replace(/^_/, ''),
      cboeSymbol: symbol,
      spot,
      expirations,
      chains,
      count: optionsArray.length,
      source: 'CBOE delayed (cdn.cboe.com) - ~15m delayed, free educational',
      note: 'For builder payoff. Historical backtest uses /data/surfaces/*.json',
      fetchedAt: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, symbol, hint: 'CBOE delayed endpoint may be rate-limited, try again in 60s' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
