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
    const rawOptions = (raw && raw.data && raw.data.options) || raw.options || {};
    const spot = (raw && raw.data && (raw.data.close ?? raw.data.current_price)) ?? raw.close ?? null;
    const expirations = Object.keys(rawOptions).sort();

    return new Response(JSON.stringify({
      symbol: symbol.replace(/^_/, ''),
      cboeSymbol: symbol,
      spot,
      expirations,
      rawOptions, // client will filter/slice
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
