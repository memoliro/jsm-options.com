/**
 * Cloudflare Pages Function: /api/cboe/chain?symbol=SPY
 * Free educational proxy for CBOE delayed quotes
 * Keeps Underlying price ($), IV (%), Rate (%), Dividend (%) MANUAL on frontend - this endpoint only returns chain + spot ref.
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

  // CBOE uses _ prefix for indexes
  const indexMap = { 'SPX': '_SPX', 'NDX': '_NDX', 'VIX': '_VIX', 'RUT': '_RUT', 'DJX': '_DJX', 'SPXW': '_SPXW' };
  if (indexMap[symbol]) symbol = indexMap[symbol];

  // Sanitize
  symbol = symbol.replace(/[^A-Z0-9_]/g, '').slice(0, 10);
  if (!symbol) symbol = 'SPY';

  const cboeUrl = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`;

  try {
    const r = await fetch(cboeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JSM Options Educational; +https://jsm-options.com)',
        'Accept': 'application/json',
        'Referer': 'https://www.cboe.com/',
      },
      cf: {
        cacheTtl: 60,
        cacheEverything: true,
      }
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`CBOE ${r.status}: ${txt.slice(0,200)}`);
    }

    const raw = await r.json();
    const data = raw && raw.data ? raw.data : raw;
    const spot = data.close ?? data.current_price ?? data.currentPrice ?? null;
    const optionsArray = Array.isArray(data.options) ? data.options : [];

    // Parse OCC symbol: e.g. SPX261218C00700000 -> expiry 26-12-18, C/P, strike 7000.000
    const expMap = new Map(); // expISO -> { calls: Map, puts: Map }
    const re = /(\d{6})([CP])(\d{8})$/;

    for (const o of optionsArray) {
      const occ = o.option || o.symbol || '';
      const m = occ.match(re);
      if (!m) continue;
      const yymmdd = m[1];
      const cp = m[2];
      const strikeRaw = m[3];
      const yy = parseInt(yymmdd.slice(0,2), 10);
      const mm = yymmdd.slice(2,4);
      const dd = yymmdd.slice(4,6);
      const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy; // CBOE uses 20xx for near dates
      const expISO = `${yyyy}-${mm}-${dd}`;
      const strike = parseInt(strikeRaw, 10) / 1000;

      if (!expMap.has(expISO)) expMap.set(expISO, { calls: new Map(), puts: new Map() });
      const bucket = expMap.get(expISO);
      const simplified = {
        strike,
        bid: o.bid ?? null,
        ask: o.ask ?? null,
        last: o.last ?? o.last_price ?? null,
        iv: o.iv ?? o.implied_volatility ?? null,
        oi: o.open_interest ?? o.openInterest ?? null,
        vol: o.volume ?? null,
        delta: o.delta ?? null,
      };
      if (cp === 'C') bucket.calls.set(strike, simplified);
      else bucket.puts.set(strike, simplified);
    }

    // Sort expirations and convert Maps to sorted arrays
    const expirations = Array.from(expMap.keys()).sort();
    const chains = {};
    for (const exp of expirations) {
      const b = expMap.get(exp);
      const callStrikes = Array.from(b.calls.keys()).sort((a,b)=>a-b);
      const putStrikes = Array.from(b.puts.keys()).sort((a,b)=>a-b);
      // Keep all strikes, but pre-sort
      chains[exp] = {
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
      chains, // grouped by expiration, already simplified
      source: 'CBOE delayed (cdn.cboe.com) - free, ~15m delayed',
      note: 'Educational only. Underlying/IV/Rate/Div remain manual on frontend.',
      fetchedAt: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, symbol }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
