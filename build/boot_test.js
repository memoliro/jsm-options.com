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
    Chart: function () {
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
    const before = el(els, 'posCurrentPL').textContent;
    if (/NaN/.test(before)) throw new Error('P/L NaN before shock: ' + before);
    vm.runInContext('setIvShock(2)', ctx);
    const after = el(els, 'posCurrentPL').textContent;
    if (/NaN/.test(after)) throw new Error('P/L NaN after shock');
    if (before === after) throw new Error('P/L unchanged by shock: ' + before);
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

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
