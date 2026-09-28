/* Section scroll-spy for lesson pages (level1-level4).
 *
 * - Extends the breadcrumb trail to "Home / <Page> / <Current section>",
 *   updating the section crumb as the reader scrolls.
 * - Highlights the matching link in the on-page TOC / playbook nav.
 *
 * Pure enhancement: without JS the breadcrumb stays "Home / <Page>".
 */
(function () {
  'use strict';

  var nav = document.querySelector('nav.breadcrumbs');

  // Pin the sticky breadcrumb just below the sticky site header, whatever its
  // rendered height is (it changes with viewport width), and park the sticky
  // lesson TOC just below the breadcrumb so the two bars never overlap.
  // Re-measure on resize, full load, and once webfonts settle, so the offsets
  // never drift.
  function pinStickyOffsets() {
    var header = document.querySelector('.site-header');
    var h = header ? Math.ceil(header.getBoundingClientRect().height) : 68;
    document.documentElement.style.setProperty('--crumb-top', h + 'px');
    if (nav) {
      var ch = Math.ceil(nav.getBoundingClientRect().height) || 40;
      document.documentElement.style.setProperty('--toc-top', (h + ch) + 'px');
    }
  }
  pinStickyOffsets();
  window.addEventListener('resize', pinStickyOffsets);
  window.addEventListener('load', pinStickyOffsets);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(pinStickyOffsets).catch(function () {});
  }

  if (!nav || !('requestAnimationFrame' in window)) return;

  var pageCrumb = nav.querySelector('[aria-current="page"]');
  if (!pageCrumb) return;
  var pageLabel = pageCrumb.textContent.trim().replace(/\s+/g, ' ');
  var pageHref = window.location.pathname.replace(/index\.html?$/, '') || '/';
  // Keep the existing home link as-is (text + href), so Turkish pages stay Turkish.
  var homeA = nav.querySelector('a');
  if (!homeA) return;
  var OVERVIEW = document.documentElement.lang === 'tr' ? 'Genel Bakış' : 'Overview';

  /* ---------- collect sections ---------- */
  var labels = {};   // section id -> short label from the on-page nav
  var navLinks = []; // {id, a, cls} for active-link highlighting
  function collectLinks(scope, cls) {
    document.querySelectorAll(scope).forEach(function (n) {
      n.querySelectorAll('a[href^="#"]').forEach(function (a) {
        if (a.__spySeen) return;
        a.__spySeen = true;
        var id = a.getAttribute('href').slice(1);
        if (!id) return;
        // First label wins: the short pill-nav labels (collected first) take
        // precedence over the sidebar's full heading text for the breadcrumb.
        if (!labels[id]) labels[id] = a.textContent.trim().replace(/\s+/g, ' ');
        navLinks.push({ id: id, a: a, cls: cls });
      });
    });
  }
  collectLinks('nav.lesson-toc, nav.otp-nav', 'active');
  // The sidebar TOC (aside.page-toc) is built by site.js on DOMContentLoaded,
  // which runs after this defer script — its links are collected in collectLate() below.

  function cleanLabel(s) {
    // collapse whitespace, drop trailing arrow/dingbat ornaments (e.g. "Example ->")
    return s.trim().replace(/\s+/g, ' ')
      .replace(/[\s\u2190-\u21FF\u27A1\u2B05\u2B06\uFE0F]+$/, '');
  }

  var sections = [];
  var seen = {};
  function consider(el) {
    if (!el || !el.id || seen[el.id]) return;
    if (el.tagName === 'H1') return; // h1 is the page title: covered by the "Overview" default
    if (el.closest('header, footer, nav, .site-header, .site-footer')) return;
    seen[el.id] = true;
    var label = labels[el.id];
    if (!label) {
      var h = (el.tagName === 'H2' || el.tagName === 'H3') ? el : el.querySelector('h2, h3');
      label = h ? cleanLabel(h.textContent) : el.id;
    }
    sections.push({ id: el.id, el: el, label: label });
  }

  function collectSections() {
    // TOC targets first (any tag, e.g. div#risk-notes), then headings/articles.
    Object.keys(labels).forEach(function (id) { consider(document.getElementById(id)); });
    document.querySelectorAll('h2[id], h3[id], article[id]').forEach(consider);
    // Reading order (the TOC-first pass may be out of order).
    sections.sort(function (a, b) {
      if (a.el === b.el) return 0;
      return (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
  }
  collectSections();
  if (!sections.length) return;

  // site.js assigns sec-N ids to id-less headings on DOMContentLoaded — after
  // this defer script has run. Re-collect then so every section is tracked and
  // every sidebar link can highlight.
  function collectSideToc() { collectLinks('aside.page-toc nav', 'is-active'); }
  function collectLate() { collectSideToc(); collectSections(); update(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', collectLate);
  } else {
    collectLate();
  }

  /* ---------- restructure breadcrumb: Home / Page / Section ---------- */
  function sepEl() {
    var s = document.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = '/';
    return s;
  }
  var pageA = document.createElement('a');
  pageA.href = pageHref;
  pageA.textContent = pageLabel;
  var secSpan = document.createElement('span');
  secSpan.setAttribute('aria-current', 'page');
  secSpan.setAttribute('data-section-crumb', '');
  secSpan.textContent = OVERVIEW;
  nav.textContent = '';
  nav.appendChild(homeA); nav.appendChild(sepEl());
  nav.appendChild(pageA); nav.appendChild(sepEl());
  nav.appendChild(secSpan);

  /* ---------- scroll spy ---------- */
  var currentId = null; // null => "Overview" (above the first section)
  function byId(id) {
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].id === id) return sections[i];
    }
    return null;
  }
  function render() {
    var s = currentId ? byId(currentId) : null;
    secSpan.textContent = s ? s.label : OVERVIEW;
    navLinks.forEach(function (t) {
      t.a.classList.toggle(t.cls || 'active', t.id === currentId);
    });
  }
  function update() {
    // Current section = last one whose top has crossed 35% down the viewport.
    var line = window.innerHeight * 0.35;
    var cur = null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].el.getBoundingClientRect().top <= line) cur = sections[i].id;
    }
    if (cur !== currentId) { currentId = cur; render(); }
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
