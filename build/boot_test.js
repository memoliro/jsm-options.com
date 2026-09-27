#!/usr/bin/env node
// Boots the engine under a fake DOM for each page and asserts no-throw + key behavior.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SITE = '/home/hatch/workspace/your_files/jsm-site';
const engineSrc = fs.readFileSync(path.join(SITE, 'assets/jsm-options-engine.js'), 'utf8');

function idsIn(file) {
  const html = fs.readFileSync(file, 'utf8');
  const ids = new Set();
  const re = /id="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

function defaultValues(pageFile) {
  const html = fs.readFileSync(pageFile, 'utf8');
  const map = {};
  const re = /<[^>]*\bid="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const vm2 = tag.match(/\bvalue="([^"]*)"/);
    if (vm2) map[m[1]] = vm2[1];
  }
  return map;
}
function makeCtx(pageFile, search) {
  const ids = idsIn(pageFile);
  const defaults = defaultValues(pageFile);
  const els = new Map();
  function makeEl(id) {
    const el = {
      __id: id,
      value: (id in defaults ? defaults[id] : ''), textContent: '', innerHTML: '', innerText: '',
      style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return makeEl(id + ':q'); },
      querySelectorAll() { return []; },
      appendChild() {}, insertBefore() {}, remove() {},
      focus() {}, click() {}, select() {},
      getContext() { return { canvas: el }; },
      getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
      hasAttribute() { return false; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 }; },
      closest() { return null; }, matches() { return false; },
      scrollIntoView() {}, dispatchEvent() { return true; },
      options: [], selectedIndex: 0,
      disabled: false, min: '', max: '', step: '', width: 300, height: 150,
      parentNode: null, children: [], childNodes: [],
    };
    return el;
  }
  const docEl = makeEl(':root');
  const body = makeEl('body');
  const document = {
    getElementById(id) {
      if (!ids.has(id)) return null;
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    querySelector() { return makeEl(':qs'); },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl('created:' + tag); },
    addEventListener() {}, removeEventListener() {},
    body, documentElement: docEl,
    readyState: 'complete',
    title: '',
  };
  const localStore = {};
  const sandbox = {
    document,
    window: {},
    localStorage: {
      getItem: k => (k in localStore ? localStore[k] : null),
      setItem: (k, v) => { localStore[k] = String(v); },
      removeItem: k => { delete localStore[k]; },
    },
    fetch: () => Promise.reject(new Error('offline in test')),
    Chart: function (ctx2d, config) {
      sandbox.__chartConfigs = sandbox.__chartConfigs || [];
      if (config) sandbox.__chartConfigs.push(config);
      return {
        destroy() {}, update() {},
        data: { labels: [], datasets: [{ data: [] }] },
        options: { scales: { x: {}, y: {} } },
      };
    },
    requestAnimationFrame: () => 0,
    navigator: {},
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, URL,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.window = sandbox;
  sandbox.window.location = { search, href: 'http://test.local' + search };
  sandbox.window.history = { replaceState() {} };
  sandbox.window.open = () => {};
  sandbox.window.matchMedia = () => ({ matches: false });
  sandbox.window.getComputedStyle = () => ({ getPropertyValue: () => '' });
  sandbox.getComputedStyle = sandbox.window.getComputedStyle;
  const ctx = vm.createContext(sandbox);
  return { ctx, els, sandbox };
}

function tokenFor(payload) {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const setupPayload = {
  legs: [
    { side: 'buy', type: 'call', strike: 100, dte: 30, qty: 1, premium: 3.2 },
    { side: 'sell', type: 'call', strike: 110, dte: 30, qty: 1, premium: 1.1 },
  ],
  S: '105', ticker: 'SPY', comm: '0.65',
};
const TOKEN = tokenFor(setupPayload);

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '—', e.message.split('\n')[0]);
  }
}
// Chain loads are async: microtasks never drain inside a sync check(), so
// async discovery tests use acheck() and flush() to yield to the VM's
// promise continuations before asserting.
async function acheck(name, fn) {
  try {
    await fn();
    console.log('PASS', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '—', e.message.split('\n')[0]);
  }
}
const flush = () => new Promise(r => setTimeout(r, 20));
function run(page, search) {
  const { ctx, els } = makeCtx(path.join(SITE, page, 'index.html'), search);
  vm.runInContext(engineSrc, ctx, { filename: 'engine.js' });
  return { ctx, els };
}
const el = (els, id) => els.get(id);

// ---------- A: builder boots clean with no params ----------
{
  const { ctx, els } = run('builder', '');
  check('A1 builder: HAS flags', () => {
    if (vm.runInContext('HAS_PAYOFF', ctx) !== true) throw new Error('HAS_PAYOFF');
    if (vm.runInContext('HAS_SIM', ctx) !== false) throw new Error('HAS_SIM should be false');
    if (vm.runInContext('HAS_GREEKS', ctx) !== false) throw new Error('HAS_GREEKS should be false');
    if (vm.runInContext('HAS_LEGS', ctx) !== true) throw new Error('HAS_LEGS');
    if (vm.runInContext('HAS_CHAIN', ctx) !== true) throw new Error('HAS_CHAIN');
  });
  check('A2 builder: default long call loaded', () => {
    const n = vm.runInContext('legs.length', ctx);
    if (n !== 1) throw new Error('legs=' + n);
  });
  check('A3 builder: payoff stats painted', () => {
    const t = el(els, 'netPremium').textContent;
    if (!/Debit/.test(t)) throw new Error('netPremium=' + JSON.stringify(t));
    if (!el(els, 'maxProfit').textContent) throw new Error('maxProfit empty');
    if (!el(els, 'breakevens').textContent) throw new Error('breakevens empty');
  });
  check('A4 builder: days slider visible & synced', () => {
    const dl = el(els, 'daysLeft');
    if (!dl) throw new Error('no daysLeft');
    if (String(dl.max) !== '90') throw new Error('daysLeft.max=' + dl.max); // default long call: 90 DTE
  });
  check('A5 builder: breakeven dedup sane', () => {
    const t = el(els, 'breakevens').textContent;
    const parts = t.split('/').map(s => s.trim());
    if (new Set(parts).size !== parts.length) throw new Error('dupes: ' + t);
  });
  check('A6 builder: openInAnalyzer builds URL', () => {
    let opened = null;
    // re-run openInAnalyzer with a spying window.open
    vm.runInContext(`(function(){ var _o = window.open; window.__opened=null; window.open=function(u,t){ window.__opened=u; }; openInAnalyzer(); window.open=_o; })()`, ctx);
    opened = vm.runInContext('window.__opened', ctx);
    if (!opened || !opened.startsWith('/simulator/?setup=')) throw new Error('opened=' + opened);
  });
}

// ---------- B: simulator boots with ?setup= ----------
{
  const { ctx, els } = run('simulator', '?setup=' + TOKEN);
  check('B1 sim: HAS flags', () => {
    if (vm.runInContext('HAS_PAYOFF', ctx) !== false) throw new Error('HAS_PAYOFF should be false');
    if (vm.runInContext('HAS_SIM', ctx) !== true) throw new Error('HAS_SIM');
    if (vm.runInContext('HAS_GREEKS', ctx) !== true) throw new Error('HAS_GREEKS');
    if (vm.runInContext('HAS_LEGS', ctx) !== false) throw new Error('HAS_LEGS should be false');
  });
  check('B2 sim: legs decoded from URL', () => {
    const n = vm.runInContext('legs.length', ctx);
    if (n !== 2) throw new Error('legs=' + n);
    const s = vm.runInContext('legs[0].strike', ctx);
    if (s !== 100) throw new Error('strike=' + s);
  });
  check('B3 sim: spot/ticker/commission from URL', () => {
    if (el(els, 'spot').value !== '105') throw new Error('spot=' + el(els, 'spot').value);
    if (el(els, 'ticker').value !== 'SPY') throw new Error('ticker');
    if (el(els, 'commission').value !== '0.65') throw new Error('comm=' + el(els, 'commission').value);
  });
  check('B4 sim: summary + greeks painted', () => {
    if (!el(els, 'posNetPremium').textContent) throw new Error('posNetPremium empty');
    if (!el(els, 'posPoP').textContent) throw new Error('posPoP empty');
    if (el(els, 'gDelta').textContent === '') throw new Error('gDelta empty');
    if (el(els, 'gRho').textContent === '') throw new Error('gRho empty');
  });
  check('B5 sim: commission affects net (debit 212.30)', () => {
    // 3.20-1.10 = 2.10*100 = 210 + 0.65*2*2 = 2.60 -> 212.60
    const t = el(els, 'posNetPremium').textContent;
    if (!/21[23]/.test(t)) throw new Error('posNetPremium=' + JSON.stringify(t)); // 212.60 -> $213
  });
  check('B6 sim: advance days works', () => {
    vm.runInContext('advanceSimDays(5)', ctx);
    const d = vm.runInContext('simDayIndex', ctx);
    if (d !== 5) throw new Error('simDayIndex=' + d);
    const ro = el(els, 'simReadout').innerHTML;
    if (!ro || /NaN/.test(ro)) throw new Error('readout bad: ' + ro.slice(0, 80));
  });
  check('B7 sim: IV shock reprices', () => {
    const rawBefore = vm.runInContext('simPLLog[simPLLog.length-1].pl', ctx);
    if (!isFinite(rawBefore)) throw new Error('P/L not finite before shock: ' + rawBefore);
    vm.runInContext('setIvShock(2)', ctx);
    const rawAfter = vm.runInContext('simPLLog[simPLLog.length-1].pl', ctx);
    const after = el(els, 'posCurrentPL').textContent;
    if (/NaN/.test(after)) throw new Error('P/L NaN after shock');
    // Compare raw (unrounded) P/L: near spot≈104 this spread's net vega is ~0,
    // so a 2x shock can move true P/L by <$1 and whole-dollar rounding hides it.
    if (!(Math.abs(rawAfter - rawBefore) > 1e-9)) throw new Error('P/L unchanged by shock: ' + rawBefore + ' -> ' + rawAfter);
  });
  check('B8 sim: empty state hidden when loaded', () => {
    const n = els.get('analyzeEmpty');
    if (n && n.style.display === 'block') throw new Error('empty shown');
  });
}

// ---------- B9-B12: earnings / ex-div markers ----------
{
  const { ctx, els } = run('simulator', '?setup=' + TOKEN);
  const fmt = d => d.toISOString().slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in5 = new Date(today.getTime() + 5 * 86400000);
  const in9 = new Date(today.getTime() + 9 * 86400000);
  check('B9 sim: earnings marker drawn on day axis', () => {
    el(els, 'earnDate').value = fmt(in5);
    el(els, 'exDivDate').value = fmt(in9);
    vm.runInContext('advanceSimDays(10)', ctx);
    const html = el(els, 'simSvg').innerHTML;
    if (!html.includes('stroke="#f59e0b"')) throw new Error('no earnings marker line');
    if (!html.includes('stroke="#a78bfa"')) throw new Error('no ex-div marker line');
    if (!html.includes('>E</text>')) throw new Error('no E label');
    if (!html.includes('>D</text>')) throw new Error('no D label');
  });
  check('B10 sim: eventMarkers() day math', () => {
    const evs = vm.runInContext('eventMarkers()', ctx);
    const e = evs.find(x => x.label === 'E');
    const d = evs.find(x => x.label === 'D');
    if (!e || e.day !== 5) throw new Error('E day=' + (e && e.day));
    if (!d || d.day !== 9) throw new Error('D day=' + (d && d.day));
  });
  check('B11 sim: out-of-horizon events hidden', () => {
    const far = new Date(today.getTime() + 500 * 86400000);
    el(els, 'earnDate').value = fmt(far);
    const evs = vm.runInContext('eventMarkers()', ctx);
    if (evs.some(x => x.label === 'E')) throw new Error('far-future E shown');
    const past = new Date(today.getTime() - 3 * 86400000);
    el(els, 'exDivDate').value = fmt(past);
    const evs2 = vm.runInContext('eventMarkers()', ctx);
    if (evs2.some(x => x.label === 'D')) throw new Error('past D shown');
  });
  check('B12 sim: share URL round-trips event dates', () => {
    el(els, 'earnDate').value = fmt(in5);
    const t = vm.runInContext('legsToQuery()', ctx);
    const json = JSON.parse(Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (json.earn !== fmt(in5)) throw new Error('earn not in token: ' + json.earn);
  });
}

// ---------- C: simulator with no setup -> empty state ----------
{
  const { ctx, els } = run('simulator', '');
  check('C1 sim: empty state shown, main hidden', () => {
    if (el(els, 'analyzeEmpty').style.display !== 'block') throw new Error('empty not shown');
    if (el(els, 'analyzeMain').style.display !== 'none') throw new Error('main not hidden');
  });
  check('C2 sim: no legs, no throw', () => {
    if (vm.runInContext('legs.length', ctx) !== 0) throw new Error('legs not empty');
  });
}

// ---------- D: builder with ?setup= ----------
{
  const { ctx, els } = run('builder', '?setup=' + TOKEN);
  check('D1 builder: shared setup loads', () => {
    if (vm.runInContext('legs.length', ctx) !== 2) throw new Error('legs!=2');
    if (!/Debit/.test(el(els, 'netPremium').textContent)) throw new Error('net=' + el(els, 'netPremium').textContent);
  });
}

// ---------- E: payoff chart shading + stat strip + range slider ----------
{
  const { ctx, els } = run('builder', '');
  check('E1 builder: 6 payoff datasets (2 lines + 4 shade fills)', () => {
    const n = vm.runInContext('window.__chartConfigs[window.__chartConfigs.length-1].data.datasets.length', ctx);
    if (n !== 6) throw new Error('datasets=' + n);
  });
  check('E2 builder: shade datasets fill to origin, no marks', () => {
    const r = vm.runInContext(`(function(){
      var ds = window.__chartConfigs[window.__chartConfigs.length-1].data.datasets;
      var sh = ds.filter(function(d){ return d._shade; });
      if (sh.length !== 4) return 'shades=' + sh.length;
      for (var i = 0; i < sh.length; i++) {
        if (sh[i].fill !== 'origin') return 'fill=' + sh[i].fill;
        if (sh[i].pointRadius !== 0 || sh[i].borderWidth !== 0) return 'visible marks';
        if (sh[i].spanGaps !== false) return 'spanGaps';
      }
      return 'ok';
    })()`, ctx);
    if (r !== 'ok') throw new Error(r);
  });
  check('E3 builder: pos/neg fills split at zero and cover both sides', () => {
    const r = vm.runInContext(`(function(){
      var ds = window.__chartConfigs[window.__chartConfigs.length-1].data.datasets;
      var line = ds[2], pos = ds[0].data, neg = ds[1].data; // expiry line + its fills
      if (pos.length !== line.data.length) return 'length mismatch';
      var sawPos = false, sawNeg = false;
      for (var i = 0; i < line.data.length; i++) {
        var y = line.data[i];
        if (y > 0) { if (pos[i] !== y) return 'pos not filled @' + i; sawPos = true; }
        else if (pos[i] !== null) return 'pos not null @' + i;
        if (y < 0) { if (neg[i] !== y) return 'neg not filled @' + i; sawNeg = true; }
        else if (neg[i] !== null) return 'neg not null @' + i;
      }
      if (!sawPos || !sawNeg) return 'one side empty';
      return 'ok';
    })()`, ctx);
    if (r !== 'ok') throw new Error(r);
  });
  check('E4 builder: chance of profit painted', () => {
    const t = el(els, 'chanceProfit').textContent;
    if (!/%|—/.test(t)) throw new Error('chanceProfit=' + JSON.stringify(t));
  });
  check('E5 builder: range slider present with default 20', () => {
    const r = vm.runInContext("document.getElementById('chartRange')", ctx);
    if (!r) throw new Error('no chartRange');
    if (el(els, 'chartRange').value !== '20') throw new Error('chartRange.value=' + el(els, 'chartRange').value);
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    if (!html.includes('id="rangeLabel">±20%<')) throw new Error('rangeLabel default missing in HTML');
  });
  check('E6 builder: stat strip has 10 tiles (A) + 7 (B)', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    const aPart = html.split('Compare legs')[0];
    const bPart = html.split('Compare legs')[1] || '';
    const aCount = (aPart.match(/class="stat-tile/g) || []).length;
    const bCount = (bPart.match(/class="stat-tile/g) || []).length;
    if (aCount !== 10) throw new Error('A tiles=' + aCount); // Item 6 added Est. margin
    if (bCount !== 7) throw new Error('B tiles=' + bCount);
  });
  check('E7 builder: stat tiles use flat background (no gradient)', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    const m = html.match(/\.stat-tile\s*\{[^}]*\}/);
    if (!m) throw new Error('no .stat-tile rule found');
    if (/gradient/i.test(m[0])) throw new Error('gradient still in .stat-tile: ' + m[0].slice(0, 90));
  });
  check('E8 builder: range slider locks X window; spot moves marker, not window', () => {
    const r = vm.runInContext(`(function(){
      var rng = document.getElementById('chartRange');
      rng.value = '20';
      onRangeChange();
      var lo1 = chartZoom.min, hi1 = chartZoom.max;
      if (!(hi1 > lo1)) return 'bad lock ' + lo1 + ',' + hi1;
      var spot = document.getElementById('spotSlider');
      spot.value = String((lo1 + hi1) / 2); // inside the locked window
      onSpotSlide();
      if (chartZoom.min !== lo1 || chartZoom.max !== hi1) return 'window moved with spot';
      spot.value = String(hi1 * 3); // far outside the window
      onSpotSlide();
      if (chartZoom.min === lo1 && chartZoom.max === hi1) return 'window did not follow escaped spot';
      var v = hi1 * 3;
      if (!(chartZoom.min < v && chartZoom.max > v)) return 'escaped spot still outside window';
      return 'ok';
    })()`, ctx);
    if (r !== 'ok') throw new Error(r);
  });
}

// ---------- F: Round 2 item 1 — Price×date P&L data table ----------
{
  const { ctx, els } = run('builder', '');
  check('F0 table: ids present in builder HTML', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    for (const id of ['viewChartBtn', 'viewTableBtn', 'plTableWrap', 'plTable', 'plTableNote', 'plTableModeNote']) {
      if (!html.includes('id="' + id + '"')) throw new Error('missing ' + id);
    }
    if (!html.includes('data-plmetric="risk"') || !html.includes('data-plmetric="cost"')) throw new Error('metric buttons missing');
  });
  check('F1 table: view toggle renders 11 rows x 6 cols, no NaN', () => {
    vm.runInContext("setChartView('table')", ctx);
    if (el(els, 'plTableWrap').style.display === 'none') throw new Error('wrap hidden');
    if (el(els, 'chartContainer').style.display !== 'none') throw new Error('chart not hidden');
    const html = el(els, 'plTable').innerHTML;
    if (/NaN/.test(html)) throw new Error('NaN in table');
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    const rows = body.split('</tr>').filter(s => s.indexOf('<td') >= 0);
    if (rows.length !== 11) throw new Error('rows=' + rows.length);
    const tds = (body.match(/<td/g) || []).length;
    if (tds !== 66) throw new Error('tds=' + tds);
    const ths = (html.split('<thead>')[1].split('</thead>')[0].match(/<th/g) || []).length;
    if (ths !== 7) throw new Error('header cols=' + ths); // Price + 6 dates
  });
  check('F2 table: spot row highlighted', () => {
    const html = el(els, 'plTable').innerHTML;
    if ((html.match(/class="spot-row"/g) || []).length !== 1) throw new Error('spot-row count wrong');
  });
  check('F3 table: expiry column flips sign at the breakeven (long call)', () => {
    const info = vm.runInContext(`(function(){
      var K = legs[0].strike, p = legs[0].premium;
      var be = K + p; // long-call breakeven, per share
      var html = document.getElementById('plTable').innerHTML;
      var body = html.split('<tbody>')[1].split('</tbody>')[0];
      var rows = body.split('</tr>').filter(function(s){ return s.indexOf('<td') >= 0; });
      var data = rows.map(function(rh){
        var pm = rh.match(/<th>\\$([0-9.]+)/);
        var cells = rh.split('</td>');
        var tm = cells[cells.length - 2].match(/>([^<>]*)$/);
        return { price: parseFloat(pm[1]), txt: tm[1].trim() };
      });
      for (var i = 0; i < data.length - 1; i++) {
        if (data[i].price >= be && data[i + 1].price <= be) {
          return JSON.stringify({ be: be, above: data[i].txt, below: data[i + 1].txt });
        }
      }
      return 'no-straddle be=' + be;
    })()`, ctx);
    if (info.indexOf('no-straddle') === 0) throw new Error(info);
    const o = JSON.parse(info);
    const num = t => parseFloat(String(t).replace(/[^0-9.\-]/g, ''));
    if (!(num(o.above) > 0)) throw new Error('above BE not positive: ' + o.above + ' (BE ' + o.be + ')');
    if (!(num(o.below) < 0)) throw new Error('below BE not negative: ' + o.below + ' (BE ' + o.be + ')');
  });
  check('F4 table: % risk mode shows +pct matching $/maxLoss', () => {
    vm.runInContext("setPlMetric('risk')", ctx);
    const cell = vm.runInContext(`(function(){
      var html = document.getElementById('plTable').innerHTML;
      var body = html.split('<tbody>')[1].split('</tbody>')[0];
      var first = body.split('</tr>').filter(function(s){ return s.indexOf('<td') >= 0; })[0];
      var tm = first.split('</td>')[0].match(/>([^<>]*)$/);
      return tm[1].trim();
    })()`, ctx);
    if (!/\+[0-9]+%/.test(cell)) throw new Error('cell=' + cell);
    const cross = vm.runInContext(`(function(){
      var html = document.getElementById('plTable').innerHTML;
      var body = html.split('<tbody>')[1].split('</tbody>')[0];
      var first = body.split('</tr>').filter(function(s){ return s.indexOf('<td') >= 0; })[0];
      var price = parseFloat(first.match(/<th>\\$([0-9.]+)/)[1]);
      var minDte = 0;
      for (var i = 0; i < legs.length; i++) {
        var d = legs[i].dte;
        if (legs[i].type !== 'stock' && isFinite(d) && d > 0) minDte = minDte ? Math.min(minDte, d) : d;
      }
      var dollar = plAt(price, Math.round(minDte), legs); // col 0 = Today
      // lazy denom, same inputs recalc() uses
      var tail = rightTailSlope(legs);
      var data = buildChartData();
      var minP = Math.min.apply(null, data.expiry);
      return JSON.stringify({ dollar: dollar, minP: minP, tail: tail, denom: plMetricDenom() });
    })()`, ctx);
    const co = JSON.parse(cross);
    if (!(co.tail >= 0 && co.minP < 0)) throw new Error('unexpected risk shape: ' + cross);
    if (Math.abs(co.denom - (-co.minP)) > 1e-9) throw new Error('denom != -minP: ' + cross);
    const expected = co.dollar / (-co.minP) * 100;
    const got = parseFloat(cell.replace(/[^0-9.\-]/g, ''));
    if (Math.abs(got - expected) > 2) throw new Error('pct mismatch: got ' + got + ' expected ' + expected.toFixed(1));
  });
  check('F5 table: % cost mode has no NaN and shows % cells', () => {
    vm.runInContext("setPlMetric('cost')", ctx);
    const html = el(els, 'plTable').innerHTML;
    if (/NaN/.test(html)) throw new Error('NaN in % cost mode');
    if (html.indexOf('%') < 0) throw new Error('no % cells');
    vm.runInContext("setPlMetric('$')", ctx);
  });
  check('F6 table: back to chart view restores canvas', () => {
    vm.runInContext("setChartView('chart')", ctx);
    if (el(els, 'chartContainer').style.display === 'none') throw new Error('chart hidden');
    if (el(els, 'plTableWrap').style.display !== 'none') throw new Error('table shown');
  });
  check('F7 table: recalc() refreshes the table via the post-recalc wrapper', () => {
    vm.runInContext("setChartView('table'); setPlMetric('$')", ctx);
    const before = el(els, 'plTable').innerHTML;
    vm.runInContext('legs[0].premium = legs[0].premium + 1; recalc();', ctx);
    const after = el(els, 'plTable').innerHTML;
    if (before === after) throw new Error('table not refreshed by recalc');
    if (/NaN/.test(after)) throw new Error('NaN after refresh');
    vm.runInContext("setChartView('chart')", ctx); // leave clean
  });
}

// ---------- G: Round 2 item 2 — clickable bid/ask on the chain ----------
{
  const { ctx, els } = run('builder', '');
  const setupChain = () => {
    vm.runInContext(`(function(){
      window._cboeData = {
        symbol: 'SPY', spot: 100,
        chains: { '2026-11-20': {
          strikes: [95, 100, 105],
          calls: [
            {strike:95,bid:6.10,ask:6.40,last:6.25,iv:0.25},
            {strike:100,bid:3.10,ask:3.40,last:3.25,iv:0.25},
            {strike:105,bid:0,ask:0,last:1.20,iv:0.25}
          ],
          puts: [
            {strike:95,bid:1.00,ask:1.30,last:1.15,iv:0.26},
            {strike:100,bid:3.00,ask:3.30,last:3.15,iv:0.26},
            {strike:105,bid:6.00,ask:6.30,last:6.15,iv:0.26}
          ]
        }}
      };
      document.getElementById('chainExpiration').value = '2026-11-20';
      document.getElementById('spot').value = '100';
      document.getElementById('ticker').value = 'SPY';
      renderChainTable();
    })()`, ctx);
  };
  check('G0 chain: bid/ask buttons render with titles', () => {
    setupChain();
    const html = els.get('chainTableWrap').innerHTML;
    if (!html.includes('class="ba ba-bid"')) throw new Error('no bid buttons');
    if (!html.includes('class="ba ba-ask"')) throw new Error('no ask buttons');
    if (!html.includes('title="Sell at the bid $3.10"')) throw new Error('no bid title');
    if (!html.includes('title="Buy at the ask $3.40"')) throw new Error('no ask title');
    if (!html.includes('6.10') || !html.includes('6.40')) throw new Error('bid/ask values missing');
  });
  check('G1 chain: missing bid/ask falls back to mid, not clickable', () => {
    const html = els.get('chainTableWrap').innerHTML;
    if (!html.includes('$1.20')) throw new Error('mid fallback missing');
    const nBid = (html.match(/ba-bid/g) || []).length;
    const nAsk = (html.match(/ba-ask/g) || []).length;
    if (nBid !== 5 || nAsk !== 5) throw new Error('bid/ask buttons=' + nBid + '/' + nAsk);
  });
  check('G2 chain: bid click stages SELL at bid (credit applied)', () => {
    const net0 = vm.runInContext('initialCost()', ctx);
    const n0 = vm.runInContext('legs.length', ctx);
    vm.runInContext("addLegFromChain('call', 100, 3.10, '2026-11-20', 'sell')", ctx);
    if (vm.runInContext('legs.length', ctx) !== n0 + 1) throw new Error('leg not added');
    const leg = vm.runInContext('legs[legs.length-1]', ctx);
    if (leg.side !== 'sell') throw new Error('side=' + leg.side);
    if (leg.premium !== 3.1) throw new Error('premium=' + leg.premium);
    if (leg.type !== 'call' || leg.strike !== 100) throw new Error('leg identity wrong');
    const net1 = vm.runInContext('initialCost()', ctx);
    if (Math.abs((net0 - net1) - 310) > 1) throw new Error('credit not applied: ' + net0 + ' -> ' + net1);
  });
  check('G3 chain: ask click stages BUY at ask', () => {
    vm.runInContext("addLegFromChain('put', 100, 3.30, '2026-11-20', 'buy')", ctx);
    const leg = vm.runInContext('legs[legs.length-1]', ctx);
    if (leg.side !== 'buy') throw new Error('side=' + leg.side);
    if (leg.premium !== 3.3) throw new Error('premium=' + leg.premium);
    if (leg.type !== 'put' || leg.strike !== 100) throw new Error('leg identity wrong');
  });
  check('G4 chain: Add buttons still default to buy at mid', () => {
    vm.runInContext("addLegFromChain('call', 95, 6.25, '2026-11-20')", ctx);
    const leg = vm.runInContext('legs[legs.length-1]', ctx);
    if (leg.side !== 'buy') throw new Error('side=' + leg.side);
    if (leg.premium !== 6.25) throw new Error('premium=' + leg.premium);
  });
}

// ---------- H: Round 2 item 3 — recent-builds history ----------
{
  const { ctx, els } = run('builder', '');
  const stored = () => JSON.parse(vm.runInContext("localStorage.getItem('jsm.recent.v1')", ctx) || '[]');
  check('H0 recent: button + panel ids present', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    if (!html.includes('id="recentBtn"')) throw new Error('no recentBtn');
    if (!html.includes('id="recentPanel"')) throw new Error('no recentPanel');
  });
  check('H1 recent: save round-trips ticker, label and token', () => {
    vm.runInContext("(function(){ buildDirty = true; document.getElementById('ticker').value = 'SPY'; saveRecentBuild(); })()", ctx);
    const arr = stored();
    if (arr.length !== 1) throw new Error('not saved: ' + JSON.stringify(arr).slice(0, 80));
    if (arr[0].ticker !== 'SPY') throw new Error('ticker=' + arr[0].ticker);
    if (arr[0].label !== 'Long Call 100') throw new Error('label=' + arr[0].label);
    if (!arr[0].token) throw new Error('no token');
    if (vm.runInContext('legsFromQuery(' + JSON.stringify(arr[0].token) + ')', ctx) !== true) throw new Error('token does not reload');
  });
  check('H2 recent: cap at 12, newest first', () => {
    vm.runInContext("(function(){ buildDirty = true; for (var i = 0; i < 14; i++){ legs[0].premium = 5 + i; saveRecentBuild(); } })()", ctx);
    const arr = stored();
    if (arr.length !== 12) throw new Error('len=' + arr.length);
    const t0 = JSON.parse(Buffer.from(arr[0].token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (t0.legs[0].premium !== 18) throw new Error('newest not first: ' + t0.legs[0].premium);
  });
  check('H3 recent: unchanged build does not add a duplicate', () => {
    const before = stored().length;
    vm.runInContext('saveRecentBuild()', ctx);
    if (stored().length !== before) throw new Error('duplicate added');
  });
  check('H4 recent: panel renders entries + privacy note', () => {
    vm.runInContext('renderRecentList()', ctx);
    const html = els.get('recentPanel').innerHTML;
    if (!html.includes('SPY')) throw new Error('ticker not in panel');
    if (!html.includes('Stored only in this browser')) throw new Error('privacy note missing');
    if (!html.includes('loadRecentBuild(')) throw new Error('no load handler');
  });
  check('H5 recent: loadRecentBuild applies the saved setup', () => {
    vm.runInContext('legs[0].strike = 999; loadRecentBuild(0)', ctx);
    const s = vm.runInContext('legs[0].strike', ctx);
    if (s === 999) throw new Error('setup not applied');
  });
  check('H6 recent: delete one + clear all', () => {
    const n0 = stored().length;
    vm.runInContext('deleteRecentBuild(0)', ctx);
    if (stored().length !== n0 - 1) throw new Error('delete failed');
    vm.runInContext('clearRecentBuilds()', ctx);
    if (stored().length !== 0) throw new Error('clear failed');
  });
  check('H7 recent: corrupt JSON is safe', () => {
    vm.runInContext("localStorage.setItem('jsm.recent.v1', 'not-json{{{')", ctx);
    const arr = vm.runInContext('loadRecent()', ctx);
    if (!Array.isArray(arr) || arr.length !== 0) throw new Error('not safe');
    vm.runInContext('renderRecentList()', ctx); // must not throw
  });
  check('H8 recent: describeLegs names common structures', () => {
    const t = vm.runInContext("(function(){" +
      "const mk = (side, type, strike) => ({side, type, strike, dte: 30, qty: 1});" +
      "return [" +
      " describeLegs([mk('buy','call',100), mk('sell','call',110)])," +
      " describeLegs([mk('buy','put',100), mk('sell','put',90)])," +
      " describeLegs([mk('sell','call',100)])," +
      " describeLegs([mk('buy','call',100), mk('buy','put',100)])," +
      " describeLegs([mk('buy','call',95), mk('sell','call',100), mk('sell','call',100), mk('buy','call',105)])" +
      "].join('|'); })()", ctx);
    if (t !== 'Bull Call Spread|Bear Put Spread|Short Call 100|Long Straddle|Condor') throw new Error(t);
  });
}

// ---------- I: Round 2 item 4 — chart $ / % risk / % cost modes ----------
{
  const { ctx, els } = run('builder', '?setup=' + TOKEN);
  const lastDS = (c) => vm.runInContext(
    'window.__chartConfigs[window.__chartConfigs.length-1].data.datasets', c || ctx);
  check('I0 chart: $ mode is default, axis title P/L ($)', () => {
    if (vm.runInContext('yAxisTitle()', ctx) !== 'P/L ($)') throw new Error('title');
    if (vm.runInContext('yTickFormat(50)', ctx) !== '$50') throw new Error('tick');
    const o = JSON.parse(vm.runInContext(
      `(function(){ var l = window.__chartConfigs[window.__chartConfigs.length-1].data.datasets[2];
        return JSON.stringify({label: l.label, ymode: l._ymode}); })()`, ctx));
    if (o.label !== 'Payoff (Expiry)') throw new Error('label=' + o.label);
    if (o.ymode !== 'usd') throw new Error('ymode=' + o.ymode);
  });
  check('I1 chart: % risk rescales datasets by exactly 1/maxLoss', () => {
    const usd = JSON.parse(vm.runInContext(
      'JSON.stringify(window.__chartConfigs[window.__chartConfigs.length-1].data.datasets[2].data)', ctx));
    vm.runInContext("setPlMetric('risk')", ctx);
    const o = JSON.parse(vm.runInContext(`(function(){
      var cfgs = window.__chartConfigs[window.__chartConfigs.length-1];
      var line = cfgs.data.datasets[2];
      var data = buildChartData();
      var denom = plDenomFor(legs, data.expiry);
      var minP = Math.min.apply(null, data.expiry);
      var pos = cfgs.data.datasets[0].data;
      return JSON.stringify({ data: line.data, label: line.label, ymode: line._ymode,
        denom: denom, minP: minP, title: yAxisTitle(), tick: yTickFormat(50),
        modeA: chartModeA, denomA: chartDenomA, pos: pos });
    })()`, ctx));
    if (o.title !== 'P/L (% of max risk)') throw new Error('title=' + o.title);
    if (o.tick !== '50%') throw new Error('tick=' + o.tick);
    if (o.ymode !== 'pct' || o.modeA !== 'pct') throw new Error('ymode=' + o.ymode + '/' + o.modeA);
    if (o.label !== 'Payoff (Expiry)') throw new Error('label=' + o.label);
    if (!(o.denom > 0)) throw new Error('denom=' + o.denom);
    if (Math.abs(o.denom - (-o.minP)) > 1e-9) throw new Error('denom != -minP');
    if (Math.abs(o.denomA - o.denom) > 1e-12) throw new Error('module denomA');
    if (usd.length !== o.data.length) throw new Error('length');
    for (let i = 0; i < usd.length; i++) {
      if (!isFinite(o.data[i])) throw new Error('NaN @' + i);
      if (Math.abs(o.data[i] - usd[i] / o.denom) > 1e-9) throw new Error('rescale mismatch @' + i);
      const wantPos = o.data[i] > 0 ? o.data[i] : null;
      if (o.pos[i] !== wantPos) throw new Error('shade not following @' + i);
    }
  });
  check('I2 chart: % cost rescales by 1/|initialCost|, axis title updates', () => {
    vm.runInContext("setPlMetric('cost')", ctx);
    const o = JSON.parse(vm.runInContext(`(function(){
      var line = window.__chartConfigs[window.__chartConfigs.length-1].data.datasets[2];
      return JSON.stringify({ ymode: line._ymode, denom: plDenomFor(legs, buildChartData().expiry),
        cost: Math.abs(initialCost(legs)), title: yAxisTitle(), tick: yTickFormat(-25) });
    })()`, ctx));
    if (o.title !== 'P/L (% of entry cost)') throw new Error('title=' + o.title);
    if (o.tick !== '-25%') throw new Error('tick=' + o.tick);
    if (o.ymode !== 'pct') throw new Error('ymode=' + o.ymode);
    if (Math.abs(o.denom - o.cost) > 1e-9) throw new Error('denom != |cost|');
    vm.runInContext("setPlMetric('$')", ctx); // leave clean
  });
  check('I3 chart: tooltip formats % and $ per dataset mode', () => {
    const o = JSON.parse(vm.runInContext(`(function(){
      var cb = window.__chartConfigs[window.__chartConfigs.length-1].options.plugins.tooltip.callbacks.label;
      return JSON.stringify({
        pct: cb({ dataset: { label: 'Payoff (Expiry)', _ymode: 'pct' }, parsed: { y: 45.678 } }),
        usd: cb({ dataset: { label: 'Payoff (Expiry) ($)', _ymode: 'usd' }, parsed: { y: 123.4 } }),
        neg: cb({ dataset: { label: 'Payoff (Expiry)', _ymode: 'pct' }, parsed: { y: -12.34 } })
      });
    })()`, ctx));
    if (o.pct !== 'Payoff (Expiry): +45.7%') throw new Error('pct=' + o.pct);
    if (o.usd !== 'Payoff (Expiry) ($): $123') throw new Error('usd=' + o.usd);
    if (o.neg !== 'Payoff (Expiry): -12.3%') throw new Error('neg=' + o.neg);
  });
}

// ---------- I4: Round 2 item 4 — undefined denominator falls back to $ ----------
{
  const { ctx, els } = run('builder', '?setup=' + TOKEN);
  check('I4 chart: unbounded-loss position falls back to $, tooltip notes it', () => {
    const o = JSON.parse(vm.runInContext(`(function(){
      legs = [{ side: 'sell', type: 'call', strike: 100, dte: 30, qty: 1, premium: 3.2 }];
      recalc();
      setPlMetric('risk');
      var cfgs = window.__chartConfigs[window.__chartConfigs.length-1];
      var line = cfgs.data.datasets[2];
      var raw = buildChartData().expiry;
      var same = line.data.length === raw.length;
      for (var i = 0; same && i < raw.length; i++) same = (line.data[i] === raw[i]);
      return JSON.stringify({ label: line.label, ymode: line._ymode, modeA: chartModeA,
        denomA: chartDenomA, title: yAxisTitle(), same: same,
        denomNull: plDenomFor(legs, raw) === null });
    })()`, ctx));
    if (!o.denomNull) throw new Error('denom should be null for naked short call');
    if (o.modeA !== 'usd' || o.ymode !== 'usd') throw new Error('mode=' + o.modeA + '/' + o.ymode);
    if (o.label.indexOf('($)') < 0) throw new Error('no ($) fallback note: ' + o.label);
    if (!o.same) throw new Error('fallback datasets are not raw dollars');
    if (o.title !== 'P/L (% of max risk)') throw new Error('title=' + o.title);
  });
}

// ---------- J: ±1σ band anchored to reference price, not the scenario slider ----------
{
  const { ctx, els } = run('builder', '?setup=' + TOKEN);
  const j = (expr) => vm.runInContext(expr, ctx);
  const jj = (expr) => JSON.parse(j(expr));
  check('J1 band: anchor captured from loaded setup price', () => {
    const a = j('emRefSpot()');
    if (Math.abs(a - 105) > 1e-9) throw new Error('anchor=' + a);
  });
  check('J2 band: slider drag does not move band center or width', () => {
    const before = jj(`JSON.stringify({em: expectedMove(), c: emRefSpot()})`);
    if (!(before.em > 0)) throw new Error('no EM before: ' + before.em);
    j(`(function(){ var sl = document.getElementById('spotSlider'); sl.value = 150; onSpotSlide(); })()`);
    const after = jj(`JSON.stringify({em: expectedMove(), c: emRefSpot(), spot: parseFloat(document.getElementById('spot').value)})`);
    if (Math.abs(after.spot - 150) > 1e-9) throw new Error('slider did not move spot: ' + after.spot);
    if (Math.abs(after.c - before.c) > 1e-9) throw new Error('band center moved: ' + before.c + ' -> ' + after.c);
    if (Math.abs(after.em - before.em) > 1e-9) throw new Error('band width moved: ' + before.em + ' -> ' + after.em);
  });
  check('J3 band: IV change resizes band, center stays fixed', () => {
    const before = jj(`JSON.stringify({em: expectedMove(), c: emRefSpot()})`);
    j(`(function(){ document.getElementById('iv').value = '50'; liveUpdate(); })()`);
    const after = jj(`JSON.stringify({em: expectedMove(), c: emRefSpot()})`);
    if (Math.abs(after.c - before.c) > 1e-9) throw new Error('center moved on IV change');
    if (!(after.em > before.em * 1.5)) throw new Error('width did not scale with IV: ' + before.em + ' -> ' + after.em);
  });
  check('J4 band: manual spot edit re-anchors (EM = S*IV*sqrt(T))', () => {
    j(`(function(){ document.getElementById('spot').value = '200'; onSpotInput(); })()`);
    const a = j('emRefSpot()');
    if (Math.abs(a - 200) > 1e-9) throw new Error('anchor=' + a);
    const em = j('expectedMove()');
    const want = 200 * 0.50 * Math.sqrt(30 / 365); // IV was set to 50 in J3
    if (Math.abs(em - want) / want > 1e-9) throw new Error('em=' + em + ' want=' + want);
  });
  check('J5 band: stat tile follows the anchor, not the slider', () => {
    j(`(function(){ var sl = document.getElementById('spotSlider'); sl.value = 120; onSpotSlide(); })()`);
    // The Expected-move tile lives on the simulator page; the builder shows
    // the band on the chart instead. The overlay reads the same emRefSpot(),
    // already covered by J1-J4, so assert the anchor is untouched here.
    const a = j('emRefSpot()');
    if (Math.abs(a - 200) > 1e-9) throw new Error('anchor moved by slider: ' + a);
  });
}

// ---------- J6: simulator Expected-move tile follows the anchor ----------
{
  const { ctx, els } = run('simulator', '?setup=' + TOKEN);
  const j = (expr) => vm.runInContext(expr, ctx);
  check('J6 sim: EM tile anchored to setup price, manual edit re-anchors', () => {
    const t1 = el(els, 'posExpMove').textContent;
    if (/NaN/.test(t1)) throw new Error('tile NaN: ' + t1);
    // TOKEN: S=105, IV=25, DTE=30 -> EM = 105*0.25*sqrt(30/365) = 7.53
    if (!/±\$7\.53/.test(t1)) throw new Error('tile=' + JSON.stringify(t1));
    j(`(function(){ document.getElementById('spot').value = '200'; onSpotInput(); })()`);
    const t2 = el(els, 'posExpMove').textContent;
    if (/NaN/.test(t2)) throw new Error('tile NaN after edit');
    // EM = 200*0.25*sqrt(30/365) = 14.33
    if (!/±\$14\.33/.test(t2)) throw new Error('tile after edit=' + JSON.stringify(t2));
  });
}

// ---------- K: Item 5 — probability of touch + price slices ----------
// TOKEN: S=105, IV=25%, DTE=30, r=5%, q=0 (fresh ctx; J's ctx is separate).
{
  const { ctx, els } = run('builder', '?setup=' + TOKEN);
  const j = (expr) => vm.runInContext(expr, ctx);
  const jj = (expr) => JSON.parse(j(expr));
  check('K1 touch: PoT(K) >= P(expire beyond K) for OTM strikes', () => {
    const v = jj(`JSON.stringify({
      up: [probTouch(120), probExpireBeyond(120)],
      dn: [probTouch(90), probExpireBeyond(90)]
    })`);
    if (!(v.up[0] >= v.up[1])) throw new Error('up: ' + v.up);
    if (!(v.dn[0] >= v.dn[1])) throw new Error('dn: ' + v.dn);
    if (!(v.up[0] > 0 && v.up[0] < 1)) throw new Error('up PoT out of range: ' + v.up[0]);
  });
  check('K2 touch: PoT(S) = 1 (path starts at S)', () => {
    const p = j('probTouch(105)');
    if (p !== 1) throw new Error('PoT(105)=' + p);
  });
  check('K3 touch: far OTM strike -> PoT < 5%', () => {
    const p = j('probTouch(200)');
    if (!(p < 0.05)) throw new Error('PoT(200)=' + p);
  });
  check('K4 touch: frozen (sigma=0 / T=0) edges', () => {
    const v = jj(`JSON.stringify([
      probTouchRaw(100, 110, 1, 0, 0.05, 0),
      probTouchRaw(100, 100, 1, 0, 0.05, 0),
      probTouchRaw(100, 110, 0, 0.20, 0.05, 0),
      probTouchRaw(100, 90, 1, 0, 0.05, 0)
    ])`);
    if (v[0] !== 0 || v[1] !== 1 || v[2] !== 0 || v[3] !== 0) throw new Error('frozen=' + v);
  });
  check('K5 touch: hand-verified fixture S=100,K=110,T=1,sig=.20,r=.05 -> 0.531', () => {
    const p = j('probTouchRaw(100, 110, 1, 0.20, 0.05, 0)');
    if (Math.abs(p - 0.531) > 0.0005) throw new Error('fixture=' + p);
  });
  check('K6 slices: auto-prefill is anchor ±1sigma (2 rows)', () => {
    const v = jj(`JSON.stringify({ n: priceSlices.length, p: sliceMarkerPrices(), em: expectedMove(), s: emRefSpot() })`);
    if (v.n !== 2) throw new Error('rows=' + v.n);
    if (Math.abs(v.s - 105) > 1e-9) throw new Error('anchor=' + v.s);
    const want = [105 - v.em, 105 + v.em];
    v.p.forEach((x, i) => {
      if (Math.abs(x - want[i]) > 0.011) throw new Error('slice ' + i + '=' + x + ' want~' + want[i].toFixed(2));
    });
  });
  check('K7 slices: add caps at 4, remove works, markers follow', () => {
    j('addSlice(); addSlice(); addSlice();'); // 2 -> 4, third add is a no-op
    let n = j('priceSlices.length');
    if (n !== 4) throw new Error('after adds=' + n);
    j('removeSlice(0)');
    n = j('priceSlices.length');
    if (n !== 3) throw new Error('after remove=' + n);
    const m = j('sliceMarkerPrices().length');
    if (m !== 3) throw new Error('markers=' + m);
    const auto = j('slicesAuto');
    if (auto !== false) throw new Error('manual edit should clear auto mode');
  });
  check('K8 slices: reset restores ±1sigma auto prefill', () => {
    j('resetSlices()');
    const v = jj(`JSON.stringify({ n: priceSlices.length, auto: slicesAuto, p: sliceMarkerPrices(), em: expectedMove() })`);
    if (v.n !== 2 || v.auto !== true) throw new Error('reset=' + JSON.stringify(v));
    const want = [105 - v.em, 105 + v.em];
    v.p.forEach((x, i) => {
      if (Math.abs(x - want[i]) > 0.011) throw new Error('slice ' + i + '=' + x);
    });
  });
}

// ---------- L: Item 6 — margin requirement estimates ----------
// Legs are set directly; spot is set via the spot input (estimateMargin
// reads the live price from getParams).
{
  const { ctx, els } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  const setLegs = (legsJson, spot) => {
    j(`(function(){
      document.getElementById('spot').value = '${spot}';
      legs = ${legsJson};
      recalc();
    })()`);
  };
  check('L1 margin: naked short put S=100,K=100,prem=3 -> $2,300 (Reg-T)', () => {
    setLegs(`[{id:1,side:'sell',type:'put',strike:100,dte:30,qty:1,premium:3}]`, 100);
    const m = j('estimateMargin()');
    if (m.amount !== 2300) throw new Error('amount=' + m.amount);
  });
  check('L2 margin: bull put spread -> max loss of spread', () => {
    setLegs(`[{id:1,side:'sell',type:'put',strike:110,dte:30,qty:1,premium:2.5},
             {id:2,side:'buy',type:'put',strike:100,dte:30,qty:1,premium:1.0}]`, 105);
    const m = j('estimateMargin()');
    if (m.amount !== 850) throw new Error('amount=' + m.amount + ' basis=' + m.basis);
  });
  check('L3 margin: all-long -> debit (cash)', () => {
    setLegs(`[{id:1,side:'buy',type:'call',strike:105,dte:30,qty:1,premium:8.5}]`, 105);
    const m = j('estimateMargin()');
    if (m.amount !== 850) throw new Error('amount=' + m.amount);
  });
  check('L4 margin: covered call -> max loss (stock cost - premium)', () => {
    setLegs(`[{id:1,side:'buy',type:'stock',strike:0,dte:0,qty:100,premium:100},
             {id:2,side:'sell',type:'call',strike:110,dte:30,qty:1,premium:2}]`, 100);
    const m = j('estimateMargin()');
    if (Math.abs(m.amount - 9799) > 1) throw new Error('amount=' + m.amount);
  });
  check('L5 margin: short stock -> 50% of notional', () => {
    setLegs(`[{id:1,side:'sell',type:'stock',strike:0,dte:0,qty:10,premium:100}]`, 100);
    const m = j('estimateMargin()');
    if (m.amount !== 500) throw new Error('amount=' + m.amount);
  });
  check('L6 margin: naked OTM short call uses OTM haircut + floor', () => {
    setLegs(`[{id:1,side:'sell',type:'call',strike:110,dte:30,qty:1,premium:2}]`, 100);
    const m = j('estimateMargin()');
    // (2 + 20 - 10) = 12/share, floor (2 + 10) = 12 -> $1,200
    if (m.amount !== 1200) throw new Error('amount=' + m.amount);
  });
  check('L7 margin: tile shows "$2300 est." for the naked-put fixture', () => {
    setLegs(`[{id:1,side:'sell',type:'put',strike:100,dte:30,qty:1,premium:3}]`, 100);
    const t = els.get('estMargin').textContent;
    if (!/2300/.test(t) || !/est\./.test(t)) throw new Error('tile=' + JSON.stringify(t));
  });
}

// ---------- M: range default 20%, slider thumb sync, slices bell visual ----------
// TOKEN ctx: S=105, IV=25%, DTE=30 (same token as K).
{
  const { ctx, els } = run('builder', '?setup=' + TOKEN);
  const j = (expr) => vm.runInContext(expr, ctx);
  check('M1 slider: updateSpotSliderRange keeps the thumb on the current spot', () => {
    const v = j(`(function(){
      document.getElementById('spot').value = '771.35';
      var sl = document.getElementById('spotSlider');
      sl.min = '40'; sl.max = '180'; sl.value = '100'; // stale pre-chain state
      updateSpotSliderRange();
      return sl.value + '|' + sl.min + '|' + sl.max;
    })()`);
    const val = parseFloat(String(v).split('|')[0]);
    if (val !== 771.35) throw new Error('thumb did not follow spot: ' + v);
  });
  check('M2 range: chart loads with the Range window locked (±20% of spot)', () => {
    const o = JSON.parse(j('JSON.stringify({min: chartZoom.min, max: chartZoom.max, active: rangeZoomActive})'));
    if (o.active !== true) throw new Error('range not locked at boot');
    if (Math.abs(o.min - 84) > 1e-9 || Math.abs(o.max - 126) > 1e-9) throw new Error('window=' + JSON.stringify(o));
  });
  check('M3 gestures: resetChartGestures restores the ±20% range window', () => {
    const o = JSON.parse(j(`(function(){
      document.getElementById('spot').value = '105'; // M1 left 771.35 behind
      chartZoom = { min: 1, max: 2 }; rangeZoomActive = false; // simulate pinch zoom
      resetChartGestures();
      return JSON.stringify({min: chartZoom.min, max: chartZoom.max, active: rangeZoomActive});
    })()`));
    if (o.active !== true) throw new Error('range not re-locked');
    if (Math.abs(o.min - 84) > 1e-9 || Math.abs(o.max - 126) > 1e-9) throw new Error('window=' + JSON.stringify(o));
  });
  check('M4 slices: section lives below the sliders in the builder HTML', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    const iSlices = html.indexOf('id="priceSlicesWrap"');
    const iRange = html.indexOf('id="chartRange"');
    if (iSlices < 0 || iRange < 0) throw new Error('section or slider missing');
    if (!(iSlices > iRange)) throw new Error('slices not below sliders');
  });
  check('M5 slices: chips are teal, no amber/yellow left', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    const m = html.match(/\.slice-chip\s*\{[^}]*\}/);
    if (!m) throw new Error('no .slice-chip rule');
    if (!/45,212,191/.test(m[0])) throw new Error('chip not teal: ' + m[0].slice(0, 80));
    if (/245,158,11/.test(html)) throw new Error('amber still present in builder HTML');
  });
  check('M6 slices: bell SVG present in the builder HTML', () => {
    const html = fs.readFileSync(path.join(SITE, 'builder', 'index.html'), 'utf8');
    if (!html.includes('id="sliceBell"')) throw new Error('sliceBell missing');
  });
  check('M7 bell: auto ±1σ prefill draws 2 teal markers + σ-band labels', () => {
    const v = j(`(function(){
      renderSliceBell();
      return document.getElementById('sliceBell').innerHTML;
    })()`);
    const n = (v.match(/mk-line/g) || []).length;
    if (n !== 2) throw new Error('markers=' + n);
    if (!/34\.1%/.test(v) || !/13\.6%/.test(v)) throw new Error('band labels missing');
    if (!/μ \$105/.test(v)) throw new Error('ref tick missing');
  });
}
{
  const { ctx } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  check('M8 range: default boot path locks ±20% around spot 100', () => {
    const o = JSON.parse(j('JSON.stringify({min: chartZoom.min, max: chartZoom.max, active: rangeZoomActive})'));
    if (o.active !== true) throw new Error('range not locked at boot');
    if (Math.abs(o.min - 80) > 1e-9 || Math.abs(o.max - 120) > 1e-9) throw new Error('window=' + JSON.stringify(o));
  });
}

// ---------- O: Batch C item 7 — optimizer lite (synthetic grid, no chain) ----------
{
  const { ctx, els } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  // NOTE: the fake-DOM els map only fills when the engine calls
  // getElementById, so drive everything through j() here.
  const set = (id, v) => j('document.getElementById("' + id + '").value = "' + v + '"');
  const exists = (id) => j('document.getElementById("' + id + '") !== null');
  check('O1 discovery: card + controls exist on builder, synthetic universe sane', () => {
    for (const id of ['discoveryCard', 'optFamily', 'optTarget', 'optExpiry', 'optGoal', 'optResults']) {
      if (!exists(id)) throw new Error('missing ' + id);
    }
    const u = JSON.parse(j(`(function(){ const u = discoveryUniverse('', 30); return JSON.stringify({n: u.strikes.length, lo: u.strikes[0], hi: u.strikes[u.strikes.length-1], dte: u.dte, iv: u.ivOf('call', 100)}); })()`));
    if (u.n !== 61 || u.lo !== 70 || u.hi !== 130) throw new Error('grid=' + JSON.stringify(u));
    if (u.dte !== 30) throw new Error('dte=' + u.dte);
    if (Math.abs(u.iv - 0.25) > 1e-12) throw new Error('iv=' + u.iv);
  });
  check('O2 optimizer: bull-call scan ranks top 5 by max profit, winner > 0', () => {
    set('optFamily', 'bullcall'); set('optTarget', '110'); set('optGoal', 'profit');
    j('runOptimizerScan()');
    const n = j('optResults.length');
    if (!(n > 0 && n <= 5)) throw new Error('rows=' + n);
    const rows = JSON.parse(j('JSON.stringify(optResults.map(c => ({mp: c.st.maxProfit, net: c.st.net, label: c.label})))'));
    for (const r of rows) { if (!isFinite(r.net)) throw new Error('non-finite net ' + r.label); }
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].mp > rows[i - 1].mp + 1e-9) throw new Error('not sorted: ' + JSON.stringify(rows.map(r => r.mp)));
    }
    if (!(rows[0].mp > 0)) throw new Error('top maxProfit=' + rows[0].mp);
  });
  check('O3 optimizer: debit spread structural invariant maxProfit = width − debit', () => {
    set('optFamily', 'bullcall'); set('optTarget', '110'); set('optGoal', 'profit');
    j('runOptimizerScan()');
    const rows = JSON.parse(j('JSON.stringify(optResults.map(c => ({k1: c.k1, k2: c.k2, mp: c.st.maxProfit, net: c.st.net})))'));
    for (const r of rows) {
      if (r.net <= 0) continue; // debit spreads only for this invariant
      const expect = (r.k2 - r.k1) * 100 - r.net;
      if (Math.abs(r.mp - expect) > 0.02) throw new Error(r.k1 + '/' + r.k2 + ' mp=' + r.mp + ' expect=' + expect);
    }
  });
  check('O4 optimizer: modeled ATM call premium matches independent Black-Scholes', () => {
    // Independent reference (Simpson-integrated normal CDF): S=100 K=100
    // T=30/365 σ=0.25 r=0.05 q=0 → 3.062600 per share.
    const v = j(`(function(){ const u = discoveryUniverse('', 30); return discoveryPremium('call', 100, u); })()`);
    if (Math.abs(v - 3.062600) > 0.001) throw new Error('premium=' + v);
  });
  check('O5 optimizer: ROC goal sorts by ROC desc, all defined', () => {
    set('optFamily', 'bullcall'); set('optTarget', '110'); set('optGoal', 'roc');
    j('runOptimizerScan()');
    const rocs = JSON.parse(j('JSON.stringify(optResults.map(c => c.st.roc))'));
    if (!rocs.length) throw new Error('no rows');
    for (const r of rocs) { if (r == null || !(r > 0)) throw new Error('roc=' + r); }
    for (let i = 1; i < rocs.length; i++) {
      if (rocs[i] > rocs[i - 1] + 1e-9) throw new Error('not sorted: ' + JSON.stringify(rocs));
    }
  });
  check('O6 optimizer: POP goal sorts by POP desc', () => {
    set('optFamily', 'bullput'); set('optTarget', '105'); set('optGoal', 'pop');
    j('runOptimizerScan()');
    const pops = JSON.parse(j('JSON.stringify(optResults.map(c => c.st.pop))'));
    if (!pops.length) throw new Error('no rows');
    for (let i = 1; i < pops.length; i++) {
      if (pops[i] > pops[i - 1] + 1e-9) throw new Error('not sorted');
    }
  });
  check('O7 optimizer: Apply loads 2 legs into A', () => {
    set('optFamily', 'bullcall'); set('optTarget', '110'); set('optGoal', 'profit');
    j('runOptimizerScan()');
    j('legs = []; applyDiscoveryLegs("opt", 0)');
    const n = j('legs.length');
    if (n !== 2) throw new Error('legs=' + n);
    const types = j('JSON.stringify(legs.map(l => l.side + " " + l.type))');
    if (!/buy call/.test(types) || !/sell call/.test(types)) throw new Error(types);
  });
  check('O8 optimizer: probOfProfit delegates to popOf without behavior change', () => {
    const a = j('probOfProfit()'), b = j('popOf(legs)');
    if (Math.abs(a - b) > 1e-12) throw new Error(a + ' vs ' + b);
  });
  check('O9 discovery: expiry selects initialized at boot (no-chain fallback)', () => {
    const disp = j('document.getElementById("optDteWrap").style.display');
    if (disp !== '') throw new Error('optDteWrap display=' + JSON.stringify(disp));
  });
}

// ---------- P: Batch C item 8 — option finder ----------
{
  const { ctx, els } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  const set = (id, v) => j('document.getElementById("' + id + '").value = "' + v + '"');
  const exists = (id) => j('document.getElementById("' + id + '") !== null');
  check('P1 finder: controls exist; target >> spot + Long → calls/bull-calls on top', () => {
    for (const id of ['findTarget', 'findExpiry', 'findDir', 'findCap', 'findResults']) {
      if (!exists(id)) throw new Error('missing ' + id);
    }
    set('findTarget', '130'); set('findDir', 'long'); set('findCap', '');
    j('runFinder()');
    const n = j('findResults.length');
    if (!(n > 0 && n <= 5)) throw new Error('rows=' + n);
    const labels = JSON.parse(j('JSON.stringify(findResults.map(c => c.label))'));
    for (const l of labels) {
      if (!/^(Long call|Bull call)/.test(l)) throw new Error('unexpected top row: ' + l);
    }
  });
  check('P2 finder: profit@target equals recomputed expiryPayoff', () => {
    const rows = JSON.parse(j('JSON.stringify(findResults.map(c => ({pat: c.profitAtTarget, legs: c.legs})))'));
    for (const r of rows) {
      const re = j(`expiryPayoff(130, JSON.parse('${JSON.stringify(r.legs).replace(/'/g, "\\'")}'))`);
      if (Math.abs(r.pat - re) > 0.01) throw new Error('pat=' + r.pat + ' recomputed=' + re);
    }
  });
  check('P3 finder: results ranked by profit@target desc', () => {
    const pats = JSON.parse(j('JSON.stringify(findResults.map(c => c.profitAtTarget))'));
    for (let i = 1; i < pats.length; i++) {
      if (pats[i] > pats[i - 1] + 1e-9) throw new Error('not sorted: ' + JSON.stringify(pats));
    }
  });
  check('P4 finder: max-loss cap filters rows', () => {
    set('findTarget', '130'); set('findDir', 'auto'); set('findCap', '50');
    j('runFinder()');
    const mls = JSON.parse(j('JSON.stringify(findResults.map(c => c.st.maxLoss))'));
    if (!mls.length) throw new Error('no rows under cap');
    for (const m of mls) { if (!(m <= 50)) throw new Error('maxLoss=' + m + ' over cap'); }
  });
  check('P5 finder: Apply loads the pick into legs A', () => {
    set('findTarget', '130'); set('findDir', 'long'); set('findCap', '');
    j('runFinder()');
    j('legs = []; applyDiscoveryLegs("find", 0)');
    const n = j('legs.length');
    if (!(n >= 1 && n <= 2)) throw new Error('legs=' + n);
  });
}

// ---------- T: Batch C fix — discovery follows ticker changes ----------
{
  const { ctx, els } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  const set = (id, v) => j('document.getElementById("' + id + '").value = "' + v + '"');
  const fakeChain = (sym, spot, exp, strikes) => j(`(function(){
    window._cboeData = {
      symbol: '${sym}', spot: ${spot},
      expirations: ['${exp}'],
      chains: { '${exp}': {
        strikes: ${JSON.stringify(strikes)},
        calls: ${JSON.stringify(strikes.map(k => ({ strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.25 })))},
        puts: ${JSON.stringify(strikes.map(k => ({ strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.26 })))}
      }}
    };
    document.getElementById('spot').value = '${spot}';
  })()`);
  const AAPL = [320, 330, 340, 350, 360];
  check('T1 ticker change: absolute target prices reset (old underlying scale)', () => {
    j('loadCboeChain = function(){}'); // stub network for this ctx
    j(`_lastTickerLoaded = 'SPY'`);
    set('ticker', 'QQQ');
    set('optTarget', '801.35'); set('findTarget', '831.35');
    j('onTickerChange()');
    if (j('document.getElementById("optTarget").value') !== '') throw new Error('optTarget not reset');
    if (j('document.getElementById("findTarget").value') !== '') throw new Error('findTarget not reset');
  });
  check('T2 ticker change: prior optimizer scan marked stale with loading note', () => {
    set('spot', '100');
    set('optFamily', 'bullcall'); set('optGoal', 'profit');
    j('runOptimizerScan()');
    if (!j('optResults.length')) throw new Error('setup: no scan rows');
    set('ticker', 'AAPL');
    j('onTickerChange()');
    if (!j('discOptStale')) throw new Error('discOptStale not set');
    if (j('discFindStale')) throw new Error('discFindStale spuriously set');
    const html = j('document.getElementById("optResults").innerHTML');
    if (html.indexOf('loading new chain') < 0) throw new Error('no loading note: ' + html.slice(0, 80));
  });
  check('T3 chain arrival: stale optimizer scan re-runs on the new chain', () => {
    fakeChain('AAPL', 340, '2026-11-20', AAPL);
    j('resolveDiscoveryStale()');
    if (j('discOptStale')) throw new Error('flag not consumed');
    if (!j('optUsedChain')) throw new Error('re-run did not use the chain');
    const ks = JSON.parse(j('JSON.stringify(optResults.map(c => c.k1))'));
    if (!ks.length) throw new Error('no rows after re-run');
    for (const k of ks) { if (AAPL.indexOf(k) < 0) throw new Error('old-ticker strike survived: ' + k); }
  });
  check('T4 scan during chain load (synthetic) is upgraded on chain arrival', () => {
    j('window._cboeData = null'); // chain "in flight"
    set('spot', '100');
    set('findTarget', '110'); set('findDir', 'long'); set('findCap', '');
    j('runFinder()');
    if (!j('findResults.length')) throw new Error('setup: no finder rows');
    if (j('findUsedChain')) throw new Error('should be synthetic while loading');
    fakeChain('AAPL', 340, '2026-11-20', AAPL);
    j('resolveDiscoveryStale()');
    if (!j('findUsedChain')) throw new Error('not upgraded to chain quotes');
    const ks = JSON.parse(j('JSON.stringify(findResults.map(c => c.legs[0].strike))'));
    for (const k of ks) { if (AAPL.indexOf(k) < 0) throw new Error('synthetic strike survived: ' + k); }
  });
  check('T5 manual-data mode: stale results cleared, selects fall back', () => {
    if (!j('findResults.length')) throw new Error('setup: no finder rows');
    j('enterManualDataMode("ZZZ", "No market data found for ZZZ.")');
    if (j('findResults.length')) throw new Error('findResults not cleared');
    if (j('optResults.length')) throw new Error('optResults not cleared');
    if (j('discOptStale') || j('discFindStale')) throw new Error('stale flags not cleared');
    const html = j('document.getElementById("findResults").innerHTML');
    if (html.indexOf('No chain for this ticker') < 0) throw new Error('no cleared message');
    const disp = j('document.getElementById("findDteWrap").style.display');
    if (disp !== '') throw new Error('findDteWrap not shown, display=' + JSON.stringify(disp));
  });
  check('T6 chain arrival with no prior scans: no-op, no phantom results', () => {
    const r6 = run('builder', '');
    const j6 = (expr) => vm.runInContext(expr, r6.ctx);
    j6(`(function(){
      window._cboeData = {
        symbol: 'MSFT', spot: 200, expirations: ['2026-11-20'],
        chains: { '2026-11-20': { strikes: [190, 200, 210],
          calls: [190, 200, 210].map(function (k) { return { strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.25 }; }),
          puts: [190, 200, 210].map(function (k) { return { strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.26 }; }) } }
      };
      document.getElementById('spot').value = '200';
    })()`);
    j6('resolveDiscoveryStale()');
    if (j6('optResults.length') || j6('findResults.length')) throw new Error('phantom scan ran');
    if (j6('discOptStale') || j6('discFindStale') || j6('discOptHadScan') || j6('discFindHadScan')) {
      throw new Error('stale flags set with no prior scans');
    }
  });
}

// ---------- T7/T8 run async: chain loads are async (see acheck/flush) ----------
async function runAsyncDiscoveryTests() {
  // T7: a stale chain response (superseded by a newer request) is dropped;
  // the current request's response still applies.
  {
    const { ctx } = run('builder', '');
    const j = (expr) => vm.runInContext(expr, ctx);
    const set = (id, v) => j('document.getElementById("' + id + '").value = "' + v + '"');
    // Fake-DOM fix: the apply path reads the selected filter option's text;
    // give the fake select one option like a real browser would have.
    j(`(function(){
      var sel = document.getElementById('chainFilterTop');
      if (sel) { sel.options = [{ text: 'ATM \\u00b120%' }]; sel.selectedIndex = 0; }
    })()`);
    const fetchData = (sym, spot, strikes) => `(function(){
      return { ok: true, json: function(){ return Promise.resolve({
        symbol: '${sym}', spot: ${spot}, source: 'test',
        expirations: ['2026-11-20'],
        chains: { '2026-11-20': { strikes: ${JSON.stringify(strikes)},
          calls: ${JSON.stringify(strikes.map(k => ({ strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.25 })))},
          puts: ${JSON.stringify(strikes.map(k => ({ strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.26 }))) } } }
      }); } };
    })()`;
    await acheck('T7 stale chain response dropped; current response applied', async () => {
      j('var __resolveFetch, __fetchCalls = 0; fetch = function(){ __fetchCalls++; return new Promise(function(res){ __resolveFetch = res; }); }');
      set('ticker', 'SPY');
      const idBefore = j('_chainReqId');
      const p1 = j('loadCboeChain()');
      if (j('_chainReqId') !== idBefore + 1) throw new Error('request token not taken');
      j('_chainReqId++'); // a newer request supersedes it (ticker changed mid-flight)
      j('__resolveFetch(' + fetchData('SPY', 100, [90, 100, 110]) + ')');
      await p1; // stale response dropped by the guard -> resolves without applying
      if (j('window._cboeData && window._cboeData.symbol') === 'SPY') throw new Error('stale SPY chain applied');
      const p2 = j('loadCboeChain()');
      j('__resolveFetch(' + fetchData('SPY', 100, [90, 100, 110]) + ')');
      await p2; // current response applies (a throw here fails the test with the real error)
      if (j('window._cboeData && window._cboeData.symbol') !== 'SPY') throw new Error('current chain not applied');
    });
  }

  // T8: a no-chain ticker clears results but remembers the scan; the next
  // chain load re-runs it on the new ticker's strikes. Full async path:
  // onTickerChange -> loadCboeChain -> sandbox fetch rejects -> manual mode.
  {
    const { ctx } = run('builder', '');
    const j = (expr) => vm.runInContext(expr, ctx);
    const set = (id, v) => j('document.getElementById("' + id + '").value = "' + v + '"');
    const QQQ = [180, 190, 200, 210, 220];
    const qqqData = {
      symbol: 'QQQ', spot: 200, expirations: ['2026-11-20'],
      chains: {
        '2026-11-20': {
          strikes: QQQ,
          calls: QQQ.map(k => ({ strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.25 })),
          puts: QQQ.map(k => ({ strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.26 })),
        },
      },
    };
    await acheck('T8 no-chain clears, next chain re-runs prior scan', async () => {
      set('spot', '100');
      set('optFamily', 'bullcall'); set('optGoal', 'profit');
      j('runOptimizerScan()');
      if (!j('optResults.length')) throw new Error('setup: no scan rows');
      j(`_lastTickerLoaded = 'SPY'`);
      set('ticker', 'ZZZ');
      j('onTickerChange()');
      await flush();
      if (j('optResults.length')) throw new Error('results not cleared');
      if (!j('discOptHadScan')) throw new Error('hadScan not set');
      const html = j('document.getElementById("optResults").innerHTML');
      if (html.indexOf('No chain for this ticker') < 0) throw new Error('no cleared note');
      j('window._cboeData = ' + JSON.stringify(qqqData) + '; document.getElementById("spot").value = "200";');
      j('resolveDiscoveryStale()');
      if (j('discOptHadScan')) throw new Error('hadScan not consumed');
      if (!j('optUsedChain')) throw new Error('re-run did not use the chain');
      const ks = JSON.parse(j('JSON.stringify(optResults.map(function (c) { return c.k1; }))'));
      if (!ks.length) throw new Error('no rows after re-run');
      for (const k of ks) { if (QQQ.indexOf(k) < 0) throw new Error('wrong strike: ' + k); }
    });
  }
}

// ---------- T9: stale "No chain" note clears when a chain arrives (never scanned) ----------
{
  const { ctx } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  check('T9 no-chain note clears to default prompt on chain arrival', () => {
    j('enterManualDataMode("ZZZ", "No market data found for ZZZ.")');
    const html0 = j('document.getElementById("findResults").innerHTML');
    if (html0.indexOf('No chain for this ticker') < 0) throw new Error('setup: note missing');
    j(`(function(){
      window._cboeData = {
        symbol: 'QQQ', spot: 200, expirations: ['2026-11-20'],
        chains: { '2026-11-20': { strikes: [180, 190, 200, 210, 220],
          calls: [180, 190, 200, 210, 220].map(function (k) { return { strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.25 }; }),
          puts: [180, 190, 200, 210, 220].map(function (k) { return { strike: k, bid: 1, ask: 1.2, last: 1.1, iv: 0.26 }; }) } }
      };
    })()`);
    j('resolveDiscoveryStale()');
    const htmlF = j('document.getElementById("findResults").innerHTML');
    if (htmlF.indexOf('No chain for this ticker') >= 0) throw new Error('finder stale note survived');
    if (htmlF.indexOf('Enter where you think the price goes') < 0) throw new Error('finder default prompt not restored');
    const htmlO = j('document.getElementById("optResults").innerHTML');
    if (htmlO.indexOf('No chain for this ticker') >= 0) throw new Error('optimizer stale note survived');
    if (htmlO.indexOf('Pick a family and scan') < 0) throw new Error('optimizer default prompt not restored');
    if (j('findResults.length') || j('optResults.length')) throw new Error('phantom scan ran');
  });
}

// ---------- R: Round 2 item 9 — roll analyzer ----------
{
  const { ctx, els } = run('builder', '');
  const j = (expr) => vm.runInContext(expr, ctx);
  const set = (id, v) => j('document.getElementById("' + id + '").value = "' + v + '"');
  j(`(function(){
    function dstr(days){ var d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); }
    window.__exp30 = dstr(30); window.__exp60 = dstr(60);
    window.__seedRollChain = function(){
      window._cboeData = {
        symbol: 'TEST', spot: 100,
        expirations: [window.__exp30, window.__exp60],
        chains: {}
      };
      window._cboeData.chains[window.__exp30] = { strikes: [90, 100, 105, 110],
        calls: [{strike:100,bid:2.00,ask:2.20,last:2.10,iv:0.25},{strike:105,bid:1.50,ask:1.65,last:1.58,iv:0.25},{strike:110,bid:1.00,ask:1.15,last:1.08,iv:0.25}],
        puts: [{strike:100,bid:3.00,ask:3.20,last:3.10,iv:0.26},{strike:90,bid:1.50,ask:1.70,last:1.60,iv:0.26}] };
      window._cboeData.chains[window.__exp60] = { strikes: [90, 100, 110],
        calls: [{strike:100,bid:3.00,ask:3.25,last:3.12,iv:0.27},{strike:110,bid:1.90,ask:2.10,last:2.00,iv:0.27}],
        puts: [{strike:90,bid:2.00,ask:2.20,last:2.10,iv:0.28}] };
      document.getElementById('spot').value = '100';
    };
    window.__seedRollChain();
  })()`);
  const buyCall100 = () => j(`legs = [{ side: 'buy', type: 'call', strike: 100, dte: 30, qty: 1, premium: 2.10, ticker: 'TEST' }]`);
  check('R1 roll long call: close at bid, open at ask, net debit', () => {
    buyCall100();
    const r = JSON.parse(j(`JSON.stringify((function(){
      var res = computeRoll(legs[0], 110, window.__exp60, 60);
      return { closePx: res.closeQ.px, closeSrc: res.closeQ.src, openPx: res.openQ.px, openSrc: res.openQ.src,
               perShare: res.perShare, netCash: res.netCash, modeled: res.modeled,
               ns: res.newLeg.strike, ndte: res.newLeg.dte, nside: res.newLeg.side, ntype: res.newLeg.type };
    })())`));
    if (r.closePx !== 2.00 || r.closeSrc !== 'bid') throw new Error('close should be bid 2.00, got ' + r.closePx + '/' + r.closeSrc);
    if (r.openPx !== 2.10 || r.openSrc !== 'ask') throw new Error('open should be ask 2.10, got ' + r.openPx + '/' + r.openSrc);
    if (Math.abs(r.perShare - (-0.10)) > 1e-9) throw new Error('perShare=' + r.perShare + ' (want close-open = -0.10)');
    if (Math.abs(r.netCash - (-10)) > 1e-9) throw new Error('netCash=' + r.netCash + ' (want -10)');
    if (r.ns !== 110 || r.ndte !== 60 || r.nside !== 'buy' || r.ntype !== 'call') throw new Error('newLeg wrong: ' + JSON.stringify(r));
    if (r.modeled) throw new Error('should not be modeled with chain quotes');
  });
  check('R2 roll short put: close at ask, open at bid, net debit', () => {
    j(`legs = [{ side: 'sell', type: 'put', strike: 100, dte: 30, qty: 1, premium: 3.10, ticker: 'TEST' }]`);
    const r = JSON.parse(j(`JSON.stringify((function(){
      var res = computeRoll(legs[0], 90, window.__exp60, 60);
      return { closePx: res.closeQ.px, closeSrc: res.closeQ.src, openPx: res.openQ.px, openSrc: res.openQ.src,
               perShare: res.perShare, netCash: res.netCash };
    })())`));
    if (r.closePx !== 3.20 || r.closeSrc !== 'ask') throw new Error('close should be ask 3.20, got ' + r.closePx + '/' + r.closeSrc);
    if (r.openPx !== 2.00 || r.openSrc !== 'bid') throw new Error('open should be bid 2.00, got ' + r.openPx + '/' + r.openSrc);
    if (Math.abs(r.perShare - (-1.20)) > 1e-9) throw new Error('perShare=' + r.perShare + ' (want open-close = -1.20)');
    if (Math.abs(r.netCash - (-120)) > 1e-9) throw new Error('netCash=' + r.netCash + ' (want -120)');
  });
  check('R3 modelRoll renders cost + before/after table + Apply', () => {
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '110');
    j('document.getElementById("rollExpiry").value = window.__exp60');
    j('modelRoll()');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('Debit') < 0) throw new Error('expected Debit, got: ' + html.slice(0, 200));
    if (html.indexOf('Apply roll') < 0) throw new Error('no Apply button');
    if (html.indexOf('Before') < 0 || html.indexOf('After roll') < 0) throw new Error('no before/after table');
    if (html.indexOf('Breakeven') < 0 || html.indexOf('Chance of profit') < 0) throw new Error('missing stat rows');
    if (!j('lastRoll')) throw new Error('lastRoll not set');
  });
  check('R4 applyRoll is two-step: first click arms, second applies the swap', () => {
    j('applyRoll()');
    if (!j('rollArmed')) throw new Error('first click should arm');
    if (j('legs[0].strike') !== 100) throw new Error('armed click must not swap yet');
    j('applyRoll()');
    if (j('rollArmed')) throw new Error('should disarm after applying');
    if (j('legs[0].strike') !== 110) throw new Error('strike=' + j('legs[0].strike'));
    if (j('legs[0].dte') !== 60) throw new Error('dte=' + j('legs[0].dte'));
    if (j('legs.length') !== 1) throw new Error('legs length changed');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('Rolled to') < 0) throw new Error('no success message: ' + html.slice(0, 150));
  });
  check('R5 modelRoll with no legs shows the empty message', () => {
    j('legs = []');
    j('modelRoll()');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('nothing to roll') < 0) throw new Error('got: ' + html.slice(0, 150));
  });
  check('R6 modelRoll rejects same strike and expiry', () => {
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '100');
    j('document.getElementById("rollExpiry").value = window.__exp30');
    j('modelRoll()');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('same strike and expiry') < 0) throw new Error('got: ' + html.slice(0, 150));
    if (j('lastRoll')) throw new Error('lastRoll should be null');
  });
  check('R7 breakevensOf finds the long-call breakeven near strike+premium', () => {
    const bes = JSON.parse(j('JSON.stringify(breakevensOf([{side:"buy",type:"call",strike:100,dte:30,qty:1,premium:3}]))'));
    if (bes.length !== 1 || Math.abs(bes[0] - 103) > 0.5) throw new Error('bes=' + JSON.stringify(bes));
  });
  check('R8 computeRoll without a chain falls back to modeled prices', () => {
    j('window._cboeData = null');
    buyCall100();
    const r = JSON.parse(j(`JSON.stringify((function(){
      var res = computeRoll(legs[0], 110, '', 60);
      return { modeled: res.modeled, closePx: res.closeQ.px, openPx: res.openQ.px };
    })())`));
    if (!r.modeled) throw new Error('expected modeled=true');
    if (!(r.closePx > 0) || !(r.openPx > 0) || !isFinite(r.closePx) || !isFinite(r.openPx)) throw new Error('bad modeled prices');
  });
  check('R9 modelRoll without chain shows the modeled note', () => {
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '105');
    j('document.getElementById("rollExpiry").value = ""');
    j('modelRoll()');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('Modeled prices') < 0) throw new Error('no modeled note: ' + html.slice(0, 200));
  });
  check('R10 armed click never swaps; a fresh model disarms', () => {
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '110');
    j('document.getElementById("rollExpiry").value = window.__exp60');
    j('modelRoll()');
    j('applyRoll()');
    if (!j('rollArmed')) throw new Error('should be armed');
    if (j('legs[0].strike') !== 100) throw new Error('must not swap while armed');
    j('modelRoll()'); // re-model disarms
    if (j('rollArmed')) throw new Error('re-model should disarm');
  });
  check('R11 confirm recomputes from the edited leg (no stale quote)', () => {
    j('window.__seedRollChain()'); // R8/R9 run with the chain nulled; restore it
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '110');
    j('document.getElementById("rollExpiry").value = window.__exp60');
    j('modelRoll()');
    j('legs[0].strike = 105'); // user edits the leg after modeling
    j('applyRoll()'); // arm
    j('applyRoll()'); // confirm: must price the close off the 105 bid (1.50), not the stale 100 bid (2.00)
    if (j('legs[0].strike') !== 110) throw new Error('new strike not applied');
    const html = j('document.getElementById("rollResults").innerHTML');
    // close 1.50 - open 2.10 = -0.60/share -> Debit $60.00 (stale would be $10.00)
    if (html.indexOf('Debit $60.00') < 0) throw new Error('expected recomputed Debit $60.00, got: ' + html.slice(0, 200));
  });
  check('R12 confirm with the leg removed shows a graceful message', () => {
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '110');
    j('document.getElementById("rollExpiry").value = window.__exp60');
    j('modelRoll()');
    j('legs = []');
    j('applyRoll()');
    j('applyRoll()');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('That leg is gone') < 0) throw new Error('got: ' + html.slice(0, 150));
  });
  check('R13 form change disarms a pending confirm', () => {
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '110');
    j('document.getElementById("rollExpiry").value = window.__exp60');
    j('modelRoll()');
    j('applyRoll()');
    if (!j('rollArmed')) throw new Error('should be armed');
    j('disarmRollQuiet()'); // what the form oninput/onchange handlers call
    if (j('rollArmed')) throw new Error('form change should disarm');
  });
  check('R14 disarm re-renders the model from the new inputs', () => {
    j('window.__seedRollChain()');
    buyCall100();
    j('syncRollLegs()');
    set('rollLeg', '0');
    set('rollStrike', '110');
    j('document.getElementById("rollExpiry").value = window.__exp60');
    j('modelRoll()');
    j('applyRoll()'); // arm
    set('rollStrike', '105'); // user edits the strike while armed
    j('disarmRollQuiet()');
    if (j('rollArmed')) throw new Error('should be disarmed');
    const html = j('document.getElementById("rollResults").innerHTML');
    if (html.indexOf('Buy call 105') < 0) throw new Error('model should refresh to the 105 inputs, got: ' + html.slice(0, 200));
  });
}

runAsyncDiscoveryTests().then(() => {
  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error('async tests crashed:', e); process.exit(1); });
