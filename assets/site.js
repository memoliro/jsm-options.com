(function () {
  var NAV = [
    { href: '/', label: 'Home' },
    { href: '/level1/', label: 'Basics' },
    { href: '/level2/', label: 'Fundamentals' },
    { href: '/level3/', label: 'Spreads' },
    { href: '/level4/', label: 'Advanced' },
    { href: '/strategies/', label: 'Strategies' },
    { href: '/cheat-sheet/', label: 'Cheat sheet' },
    { href: '/builder/', label: 'Builder' }
  ];

  var FOOTER_LINKS = [
    { href: '/', label: 'Home' },
    { href: '/level1/', label: 'Basics' },
    { href: '/level2/', label: 'Fundamentals' },
    { href: '/level3/', label: 'Spreads' },
    { href: '/level4/', label: 'Advanced' },
    { href: '/strategies/', label: 'Strategies' },
    { href: '/cheat-sheet/', label: 'Cheat sheet' },
    { href: '/builder/', label: 'Builder' },
    { href: '/about/', label: 'About' },
    { href: '/contact/', label: 'Contact' },
    { href: '/disclaimer/', label: 'Disclaimer' },
    { href: '/privacy/', label: 'Privacy' }
  ];

  function path() {
    var p = (location.pathname || '/').replace(/index\.html$/, '');
    if (!p.endsWith('/')) p += '/';
    if (p === '//') p = '/';
    return p === '/./' ? '/' : p;
  }

  function isActive(href) {
    var cur = path();
    if (href === '/') return cur === '/' || cur === '';
    return cur.indexOf(href) === 0;
  }

  function syncNav() {
    var nav = document.querySelector('.site-header .nav');
    if (!nav) return;
    nav.setAttribute('aria-label', 'Primary navigation');
    nav.innerHTML = NAV.map(function (item) {
      var cls = isActive(item.href) ? ' class="active"' : '';
      return '<a href="' + item.href + '"' + cls + '>' + item.label + '</a>';
    }).join('');
  }

  function syncFooter() {
    var footer = document.querySelector('.site-footer');
    if (!footer) return;
    var tools = footer.querySelector('.footer-tools');
    var toolsHtml = tools ? tools.outerHTML : (
      '<div class="footer-tools" style="margin-top:12px;font-size:12px;opacity:.9">' +
      'More free tools: ' +
      '<a href="https://lyricprep.com/" target="_blank" rel="noopener">LyricPrep</a> · ' +
      '<a href="https://jsm-image.com/" target="_blank" rel="noopener">JSM Image</a> · ' +
      '<a href="https://jsm-video.com/" target="_blank" rel="noopener">JSM Video</a> · ' +
      '<a href="https://jsm-loudness.com/" target="_blank" rel="noopener">JSM Loudness</a>' +
      '</div>'
    );
    footer.innerHTML =
      '<div class="footer-note">Educational only — not financial advice. Options involve risk of loss.</div>' +
      '<div class="footer-links">' +
      FOOTER_LINKS.map(function (item) {
        return '<a href="' + item.href + '">' + item.label + '</a>';
      }).join('\n') +
      '</div>' + toolsHtml;
  }

  function initTheme() {
    var root = document.documentElement;
    var toggle = document.getElementById('themeToggle');
    var icon = document.getElementById('themeIcon');
    var label = document.getElementById('themeLabel');
    function applyTheme(theme) {
      root.setAttribute('data-theme', theme);
      if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
      if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
      if (toggle) toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
      try { localStorage.setItem('jsm-theme', theme); } catch (e) {}
    }
    var saved = null;
    try { saved = localStorage.getItem('jsm-theme'); } catch (e) {}
    if (saved === 'light' || saved === 'dark') applyTheme(saved);
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) applyTheme('light');
    else applyTheme('dark');
    if (toggle) {
      var fresh = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(fresh, toggle);
      fresh.setAttribute('data-theme-bound', '1');
      fresh.addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    }
  }

  function initNavToggle() {
    var btn = document.getElementById('navToggle');
    var nav = document.querySelector('.site-header .nav');
    if (!btn || !nav) return;
    if (btn.getAttribute('data-nav-bound') === '1') return;
    btn.setAttribute('data-nav-bound', '1');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Open menu');
      }
    });
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (btn.contains(e.target) || nav.contains(e.target)) return;
      nav.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    });
  }

  function boot() {
    syncNav();
    syncFooter();
    initTheme();
    initNavToggle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
