/* Regression test for assets/section-spy.js — exercises the REAL boot order.
 *
 * What it simulates (mirrors a real browser page load):
 *  1. Real lesson HTML is parsed (not a fixture).
 *  2. readyState is forced to 'interactive' — what defer scripts actually see.
 *  3. The real site.js is eval'd first (document order): its boot() runs
 *     immediately (else-branch), building aside.page-toc and assigning sec-N
 *     ids to id-less h2s — all BEFORE the spy runs.
 *  4. The real section-spy.js is eval'd (defer, document order after site.js).
 *  5. DOMContentLoaded fires (spy's late-collection pass runs here).
 *  6. Fake scroll positions drive the scroll-spy.
 *
 * This catches the bug class that bit us on 2026-09-28: the spy crashed during
 * init because its "late" collection ran update() -> render() before `secSpan`
 * was assigned (defer scripts see readyState 'interactive', not 'loading', so
 * a naive `readyState === 'loading'` check ran the late path immediately and
 * the TypeError aborted the whole IIFE — breadcrumb AND sidebar stayed dead).
 * Direct eval of the spy file alone could never catch it; only the real
 * readyState + real document order reproduce it.
 *
 * Usage: node tests/spy-regression.js [page ...]
 *   default pages: level1-4 EN + TR index.html
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SITE_JS = fs.readFileSync(
  path.join(process.env.HOME, 'workspace/sitejs-push/assets/site.js'), 'utf8');
const SPY_JS = fs.readFileSync(path.join(ROOT, 'assets/section-spy.js'), 'utf8');

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  PASS', name); }
  else { failures++; console.log('  FAIL', name, extra || ''); }
}

// Zero-arg rect stub factory: jsdom gives every element a 0 rect, which would
// make every section look "scrolled past". We stack sections vertically.
function rectStub(top, height, scrollYRef) {
  return () => ({
    top: top - scrollYRef.y, bottom: top - scrollYRef.y + height,
    left: 0, right: 100, width: 100, height,
    x: 0, y: top - scrollYRef.y, toJSON: () => ({}),
  });
}

function testPage(rel) {
  console.log('\n== ' + rel + ' ==');
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://jsm-options.com/' + rel.replace(/index\.html$/, ''),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;

  // The readyState a defer script actually sees (NOT 'loading').
  Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true });
  window.innerHeight = 900;
  window.requestAnimationFrame = (fn) => { fn(); return 1; };

  // Sticky bars have no layout in jsdom: stub measurable heights BEFORE eval,
  // since pinStickyOffsets() runs during defer execution.
  const scrollYRef = { y: 0 };
  const header = document.querySelector('.site-header');
  if (header) header.getBoundingClientRect = rectStub(0, 77, scrollYRef);
  const crumbNav = document.querySelector('nav.breadcrumbs');
  if (crumbNav) crumbNav.getBoundingClientRect = rectStub(0, 40, scrollYRef);
  const hasCrumbs = !!crumbNav;

  let evalError = null;
  // 1) site.js first (document order) — its boot() runs immediately at
  //    readyState 'interactive': aside.page-toc built, sec-N ids assigned.
  try { window.eval(SITE_JS); } catch (e) { evalError = 'site.js: ' + e.message; }
  check('site.js boot: sidebar TOC built', !!document.querySelector('aside.page-toc nav'), evalError);
  const secNIds = [...document.querySelectorAll('h2[id]')]
    .map((h) => h.id).filter((id) => /^sec-\d+$/.test(id));

  // 2) Fake layout for every trackable section in document order, BEFORE the
  //    spy runs — so its boot-time update() must resolve to "Overview".
  //    Tops start at 600; the spy's trigger line is 35% of 900 = 315.
  const layout = [...document.querySelectorAll(
    '.wrap h2[id], .wrap h3[id], .wrap div[id], .wrap article[id]')]
    .filter((el) => el.tagName !== 'H1'
      && !el.closest('header, footer, nav, .site-header, .site-footer'));
  layout.forEach((el, i) => { el.getBoundingClientRect = rectStub(600 + i * 800, 100, scrollYRef); });

  // 3) section-spy.js, defer, document order after site.js.
  try { window.eval(SPY_JS); } catch (e) { evalError = 'section-spy.js: ' + e.message; }
  check('no exception during defer execution', !evalError, evalError);

  const nav = document.querySelector('nav.breadcrumbs');
  const crumb = document.querySelector('[data-section-crumb]');
  if (hasCrumbs) {
    check('breadcrumb restructured at defer time', !!crumb);
    if (crumb) {
      const txt = nav.textContent.replace(/\s+/g, ' ').trim();
      check('breadcrumb starts at Overview', /(^|\/) ?(Overview|Genel Bakış)$/.test(txt), txt);
    }
  } else {
    // Breadcrumb-less pages (homepages): no crumb, but the spy must stay alive.
    check('no breadcrumb markup inserted without breadcrumbs', !crumb);
  }

  // 4) DOMContentLoaded: spy's late-collection pass runs (idempotent here).
  try {
    document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  } catch (e) { evalError = 'DOMContentLoaded: ' + e.message; }
  check('no exception on DOMContentLoaded', !evalError, evalError);

  const crumbEl = () => document.querySelector('[data-section-crumb]');
  const crumbText = () => { const el = crumbEl(); return el ? el.textContent.trim() : ''; };
  const sideActive = (id) => {
    const esc = window.CSS ? window.CSS.escape(id) : id;
    const a = document.querySelector(`aside.page-toc nav a[href="#${esc}"]`);
    return !!(a && a.classList.contains('is-active'));
  };
  function scrollToId(id) {
    const i = layout.findIndex((el) => el.id === id);
    if (i < 0) return false;
    scrollYRef.y = 600 + i * 800 - 100; // heading just above the 35% line
    window.dispatchEvent(new window.Event('scroll'));
    return true;
  }

  // 5) Static-id section with a short pill label: crumb prefers the pill text,
  //    and both pill + sidebar links highlight.
  const bearPut = document.getElementById('bear-put');
  if (bearPut && scrollToId('bear-put')) {
    check('breadcrumb tracks Bear put (pill label)', /bear put/i.test(crumbText()), crumbText());
    check('sidebar highlights Bear put', sideActive('bear-put'));
    const pill = document.querySelector('nav.lesson-toc a[href="#bear-put"]');
    if (pill) check('pill nav highlights Bear put', pill.classList.contains('active'));
  } else {
    console.log('  SKIP bear-put checks (no #bear-put on this page)');
  }

  // 6) Id-less (sec-N) section: only tracked because site.js assigned the id
  //    before the spy ran. Crumb falls back to the full heading text
  //    (on pages with breadcrumbs).
  if (secNIds.length && scrollToId(secNIds[0])) {
    const h = document.getElementById(secNIds[0]);
    if (hasCrumbs) {
      check(`breadcrumb tracks sec-N section ("${h.textContent.trim().slice(0, 28)}…")`,
        crumbText().length > 0 && !/(Overview|Genel Bakış)$/.test(crumbText()), crumbText());
    }
    check('sidebar highlights sec-N section', sideActive(secNIds[0]));
  } else {
    console.log('  SKIP sec-N checks (no id-less h2s on this page)');
  }

  // 6b) Ancestor fallback: a tracked subsection with no sidebar link of its own
  //     (e.g. level4 article#otp-syn-long) keeps the parent h2 highlighted —
  //     the highlight must stick instead of blinking out.
  const escId = (id) => (window.CSS ? window.CSS.escape(id) : id);
  const subSec = layout.find((el) => {
    if (!el.id || el.tagName === 'H2' || el.tagName === 'H1') return false;
    if (el.closest('header, footer, nav, .site-header, .site-footer')) return false;
    return !document.querySelector(`aside.page-toc nav a[href="#${escId(el.id)}"]`);
  });
  if (subSec && scrollToId(subSec.id)) {
    const idx = layout.findIndex((el) => el.id === subSec.id);
    let parent = null;
    for (let j = idx - 1; j >= 0; j--) {
      if (layout[j].tagName === 'H2') { parent = layout[j]; break; }
    }
    if (parent) {
      check(`sidebar keeps parent h2 highlighted inside #${subSec.id}`,
        sideActive(parent.id), 'crumb: ' + crumbText());
    } else {
      console.log('  SKIP ancestor check (no preceding h2)');
    }
  } else {
    console.log('  SKIP ancestor check (no link-less subsection on this page)');
  }

  // 7) Sticky offsets measured from the real (stubbed) bar heights.
  const cs = document.documentElement.style;
  check('--crumb-top equals header height', cs.getPropertyValue('--crumb-top') === '77px',
    cs.getPropertyValue('--crumb-top'));
  if (hasCrumbs) {
    check('--toc-top stacks below breadcrumb', cs.getPropertyValue('--toc-top') === '117px',
      cs.getPropertyValue('--toc-top'));
  } else {
    check('--toc-top unset without breadcrumbs', cs.getPropertyValue('--toc-top') === '',
      cs.getPropertyValue('--toc-top'));
  }
}

const pages = process.argv.slice(2);
(pages.length ? pages : [
  'level1/index.html', 'level2/index.html', 'level3/index.html', 'level4/index.html',
  'tr/level1/index.html', 'tr/level2/index.html', 'tr/level3/index.html', 'tr/level4/index.html',
  'index.html', 'strategies/index.html', 'cheat-sheet/index.html',
  'tr/index.html', 'tr/strategies/index.html', 'tr/cheat-sheet/index.html',
]).forEach(testPage);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
