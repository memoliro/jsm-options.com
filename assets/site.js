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

  var BMC_URL = 'https://www.buymeacoffee.com/memoliro';

  var NAV_TR = {
    '/': 'Ana Sayfa',
    '/level1/': 'Giriş',
    '/level2/': 'Temeller',
    '/level3/': 'Spreadler',
    '/level4/': 'İleri',
    '/strategies/': 'Stratejiler',
    '/cheat-sheet/': 'Özet',
    '/builder/': 'Builder'
  };

  function lang() {
    var p = location.pathname || '/';
    return (p === '/tr' || p === '/tr/' || p.indexOf('/tr/') === 0) ? 'tr' : 'en';
  }

  function prefix() {
    return lang() === 'tr' ? '/tr' : '';
  }

  function stripTr(p) {
    if (p === '/tr' || p === '/tr/') return '/';
    if (p.indexOf('/tr/') === 0) {
      var rest = p.slice(3);
      return rest || '/';
    }
    return p;
  }

  function switchHref() {
    var p = location.pathname || '/';
    var search = location.search || '';
    if (lang() === 'tr') {
      var rest = stripTr(p);
      return (rest === '/' ? '/' : rest) + search;
    }
    if (p === '/' || p === '') return '/tr/' + (search ? search : '');
    return '/tr' + (p.charAt(0) === '/' ? p : '/' + p) + search;
  }

  function path() {
    var p = (location.pathname || '/').replace(/index\.html$/, '');
    if (!p.endsWith('/')) p += '/';
    if (p === '//') p = '/';
    return p === '/./' ? '/' : p;
  }

  function isActive(href) {
    var cur = stripTr(path());
    if (href === '/') return cur === '/' || cur === '';
    return cur.indexOf(href) === 0;
  }

  function syncNav() {
    var nav = document.querySelector('.site-header .nav');
    if (!nav) return;
    nav.setAttribute('aria-label', 'Primary navigation');
    var pre = prefix();
    var L = lang();
    nav.innerHTML = NAV.map(function (item) {
      var cls = isActive(item.href) ? ' class="active"' : '';
      var href = pre + item.href;
      if (item.href === '/') href = pre ? '/tr/' : '/';
      var label = (L === 'tr' && NAV_TR[item.href]) ? NAV_TR[item.href] : item.label;
      return '<a href="' + href + '"' + cls + '>' + label + '</a>';
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
      '<div class="footer-note">' + (lang() === 'tr'
        ? 'Yalnızca eğitim amaçlıdır — yatırım tavsiyesi değildir. Opsiyon işlemleri zarar riski içerir.'
        : 'Educational only — not financial advice. Options involve risk of loss.') + '</div>' +
      '<div class="footer-links">' +
      FOOTER_LINKS.map(function (item) {
        var pre = prefix();
        var href = (item.href === '/') ? (pre ? '/tr/' : '/') : (pre + item.href);
        var label = item.label;
        if (lang() === 'tr') {
          var map = { 'Home':'Ana Sayfa','Basics':'Giriş','Fundamentals':'Temeller','Spreads':'Spreadler','Advanced':'İleri','Strategies':'Stratejiler','Cheat sheet':'Özet','Builder':'Builder','About':'Hakkında','Contact':'İletişim','Disclaimer':'Sorumluluk','Privacy':'Gizlilik' };
          label = map[item.label] || item.label;
        }
        return '<a href="' + href + '">' + label + '</a>';
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
    var headerRight = document.querySelector('.header-right');
    if (headerRight && !document.getElementById('langSwitch')) {
      var a = document.createElement('a');
      a.id = 'langSwitch';
      a.className = 'lang-switch';
      a.href = (function () {
        var p = location.pathname || '/';
        var q = location.search || '';
        if (lang() === 'tr') {
          if (p === '/tr' || p === '/tr/') return '/' + q;
          return p.replace(/^\/tr/, '') + q;
        }
        if (p === '/' || p === '') return '/tr/' + q;
        return '/tr' + p + q;
      })();
      a.textContent = lang() === 'tr' ? 'EN' : 'TR';
      a.setAttribute('aria-label', lang() === 'tr' ? 'English' : 'Türkçe');
      var themeBtn = document.getElementById('themeToggle');
      headerRight.insertBefore(a, themeBtn || null);
    }

  function injectTrGlossary() {
    if (lang() !== 'tr') return;
    if (document.getElementById('terimler')) return;
    var footer = document.querySelector('.site-footer');
    if (!footer) return;
    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = '<div class="card" id="terimler"><h2>Bu sitedeki İngilizce terimler</h2><p>Uluslararası borsalarda işlem yapmak için bu terimlere alışmalısınız.</p><dl class="term-glossary">'
      + '<dt>call</dt><dd>Strike’tan hisse alma hakkı.</dd>'
      + '<dt>put</dt><dd>Strike’tan hisse satma hakkı.</dd>'
      + '<dt>strike</dt><dd>Opsiyon kontratında baz alınan fiyat.</dd>'
      + '<dt>premium</dt><dd>Ödenen veya alınan prim.</dd>'
      + '<dt>expiry</dt><dd>Vade sonu.</dd>'
      + '<dt>long / short</dt><dd>Almış / satmış pozisyon.</dd>'
      + '<dt>Greeks</dt><dd>Delta, theta gibi duyarlılıklar.</dd>'
      + '<dt>assignment</dt><dd>Kontrat şartlarından olan, hisse alma / satma yükümlülüğünün gerçekleşmesi.</dd>'
      + '<dt>underlying</dt><dd>Baz alınan varlık (hisse veya ETF).</dd>'
      + '<dt>Covered Call</dt><dd>Hisse + short call; premium alınır, yükselişten kâr sınırlanır / tavanlanır.</dd>'
      + '<dt>Cash-Secured Put</dt><dd>Nakit teminatlı short put; assignment durumunda hisse alma yükümlülüğü vardır.</dd>'
      + '<dt>Iron Condor</dt><dd>İki kanatlı (4 bacaklı), belirlenmiş-risk, yatay / bant beklentisine uygun credit (gelir) stratejisi.</dd>'
      + '<dt>Bullish / Bearish / Neutral</dt><dd>Boğa / yükseliş · Ayı / düşüş · yatay beklenti.</dd>'
      + '<dt>Builder</dt><dd>Canlı strateji simülatörü.</dd>'
      + '</dl></div>';
    footer.parentNode.insertBefore(wrap, footer);
  }


  // PWA installation is intentionally disabled on JSM Options.
  // Also clean up service workers/caches from older versions of the site so
  // returning visitors are no longer offered an installable web app.
  function disablePwa() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(function (registration) {
        try { registration.unregister(); } catch (e) {}
      });
    }).catch(function () {});
    if ('caches' in window) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) {
          if (/^jsm-options-v/i.test(key)) {
            try { caches.delete(key); } catch (e) {}
          }
        });
      }).catch(function () {});
    }
  }

  function shouldUseRails() {
    var p = location.pathname || '/';
    if (p.indexOf('/builder') !== -1) return false;
    if (p.indexOf('/contact') !== -1) return false;
    return !!document.querySelector('.wrap');
  }

  function wrapPageRails() {
    if (!shouldUseRails()) return;
    if (document.querySelector('.page-rails')) return;
    var wrap = document.querySelector('.wrap');
    if (!wrap) return;
    var hs = Array.prototype.slice.call(wrap.querySelectorAll('h1,h2')).filter(function (h) {
      return h.textContent && h.textContent.trim().length > 1;
    }).slice(0, 14);
    var tocHtml = hs.map(function (h, i) {
      if (!h.id) h.id = 'sec-' + i;
      return '<a href="#' + h.id + '">' + h.textContent.trim() + '</a>';
    }).join('');
    if (!tocHtml) tocHtml = '<a href="#">' + (lang() === 'tr' ? 'Bu sayfa' : 'This page') + '</a>';

    var rails = document.createElement('div');
    rails.className = 'page-rails';
    var toc = document.createElement('aside');
    toc.className = 'page-toc';
    toc.innerHTML = '<div class="toc-kicker">' + (lang() === 'tr' ? 'Bu sayfada' : 'On this page') + '</div><nav>' + tocHtml + '</nav>';
    var main = document.createElement('div');
    main.className = 'page-main';
    wrap.parentNode.insertBefore(rails, wrap);
    rails.appendChild(toc);
    rails.appendChild(main);
    main.appendChild(wrap);
  }

    injectTrGlossary();
    initTheme();
    initNavToggle();
    disablePwa();
    wrapPageRails();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
