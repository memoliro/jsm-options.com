/**
 * Theme (localStorage) + language navigation to real HTML pages (no JS i18n).
 */
(function () {
  var THEME_KEY = 'jsm-theme';

  function preferredTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.textContent = theme === 'light' ? 'Dark' : 'Light';
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  }

  /** Detect language from path: /fr/... /tr/... else en */
  function detectLang() {
    var p = location.pathname || '/';
    if (p === '/fr' || p.indexOf('/fr/') === 0) return 'fr';
    if (p === '/tr' || p.indexOf('/tr/') === 0) return 'tr';
    return 'en';
  }

  /**
   * Map current path to another language's path.
   * EN lives at site root; FR/TR under /fr and /tr.
   */
  function pathForLang(targetLang) {
    var path = location.pathname || '/';
    // strip language prefix
    if (path.indexOf('/fr/') === 0) path = path.slice(3);
    else if (path === '/fr') path = '/';
    else if (path.indexOf('/tr/') === 0) path = path.slice(3);
    else if (path === '/tr') path = '/';
    if (!path) path = '/';
    // ensure leading slash
    if (path.charAt(0) !== '/') path = '/' + path;
    if (targetLang === 'en') return path;
    // /index.html -> /fr/ or /fr/index.html
    if (path === '/' || path === '/index.html') return '/' + targetLang + '/';
    return '/' + targetLang + path;
  }

  function onLangChange(sel) {
    var lang = sel.value;
    var dest = pathForLang(lang);
    if (location.search) dest += location.search;
    if (location.hash) dest += location.hash;
    location.href = dest;
  }

  function init() {
    applyTheme(preferredTheme());
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    var sel = document.getElementById('langSelect');
    if (sel) {
      sel.value = detectLang();
      sel.addEventListener('change', function () { onLangChange(sel); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.jsmThemeToggle = toggleTheme;
})();
