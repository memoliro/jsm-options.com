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

  // Real, native "Install the App" button — no unprompted browser banner.
  // We register the manifest + service worker quietly in the background
  // (required for the browser to consider the site installable at all),
  // then capture the browser's install event ourselves and suppress its
  // automatic mini-infobar. The install UI only ever appears when someone
  // clicks our button in the footer.
  var PWA_MANIFEST_HREF = '/site.webmanifest';
  var PWA_SW_HREF = '/sw.js';
  var deferredInstallPrompt = null;
  var installBtnEls = [];

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !window.MSStream;
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function refreshInstallButtons() {
    installBtnEls.forEach(function (btn) {
      if (!btn || !btn.isConnected) return;
      if (isStandalone()) { btn.hidden = true; return; }
      btn.hidden = !(deferredInstallPrompt || isIos());
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    refreshInstallButtons();
  });

  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    refreshInstallButtons();
  });

  function setManifestLink(on) {
    var link = document.querySelector('link[rel="manifest"]');
    if (on) {
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'manifest');
        document.head.appendChild(link);
      }
      link.setAttribute('href', PWA_MANIFEST_HREF);
    } else if (link) {
      link.parentNode.removeChild(link);
    }
  }

  function enablePwa() {
    setManifestLink(true);
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(PWA_SW_HREF).catch(function () {});
  }
  enablePwa();

  function installButtonHtml() {
    var tr = lang() === 'tr';
    return '<div class="footer-pwa">' +
      '<button type="button" id="installAppBtn" class="install-app-btn" hidden>' +
      '<span class="install-app-icon" aria-hidden="true">⬇</span>' +
      (tr ? 'Uygulamayı Yükle' : 'Install the App') +
      '</button>' +
      '<p class="pwa-toggle-hint" id="installAppHint">' + (tr
        ? 'Cihazınıza hızlı erişim için ekleyin — tamamen isteğe bağlı.'
        : 'Adds quick access to your device — totally optional.') + '</p>' +
      '</div>';
  }

  function showIosInstallHint(btn) {
    var hint = document.getElementById('installAppHint');
    var tr = lang() === 'tr';
    var msg = tr
      ? 'Paylaş simgesine, ardından "Ana Ekrana Ekle"ye dokunun.'
      : 'Tap the Share icon, then "Add to Home Screen".';
    if (hint) hint.textContent = msg;
    if (btn) btn.setAttribute('title', msg);
  }

  function initInstallButton() {
    var btn = document.getElementById('installAppBtn');
    if (!btn) return;
    if (installBtnEls.indexOf(btn) === -1) installBtnEls.push(btn);
    refreshInstallButtons();
    btn.addEventListener('click', function () {
      if (deferredInstallPrompt) {
        var promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = null;
        promptEvent.prompt();
        promptEvent.userChoice.catch(function () {}).then(refreshInstallButtons);
        return;
      }
      if (isIos()) {
        showIosInstallHint(btn);
        return;
      }
      refreshInstallButtons();
    });
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
    // Dark mode is the site default. If a visitor explicitly switches
    // to light mode, keep that preference for future visits.
    if (saved === 'light' || saved === 'dark') applyTheme(saved);
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
    if (document.getElementById('glossaryCard') || document.getElementById('terimler')) return;
    var footer = document.querySelector('.site-footer');
    if (!footer) return;
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'glossaryCard';
    card.innerHTML =
      '<h2>Terimler <span style="font-size:0.72rem;color:var(--muted);font-weight:500;">İngilizce bırakılan sözcüklerin kısa Türkçe açıklaması</span></h2>' +
      '<p style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;">Bu sitede terimler bilinçli olarak İngilizce durur; aşağıda her birinin anlamı vardır.</p>' +
      '<dl class="glossary-grid">' +
      '<div class="glossary-item"><dt>Call</dt><dd>Belirli bir Strike üzerinden Underlying’i alma hakkı veren opsiyon.</dd></div>' +
      '<div class="glossary-item"><dt>Put</dt><dd>Belirli bir Strike üzerinden Underlying’i satma hakkı veren opsiyon.</dd></div>' +
      '<div class="glossary-item"><dt>Strike</dt><dd>Opsiyonun alım veya satım hakkı tanıdığı sabit fiyat.</dd></div>' +
      '<div class="glossary-item"><dt>Expiry / expiration</dt><dd>Kontratın sona erdiği tarih; DTE bu güne kalan gün sayısıdır.</dd></div>' +
      '<div class="glossary-item"><dt>DTE</dt><dd>Days to expiration: expiration’a kalan takvim günü.</dd></div>' +
      '<div class="glossary-item"><dt>Moneyness</dt><dd>Strike’ın Underlying fiyatına göre konumu: ITM, ATM veya OTM.</dd></div>' +
      '<div class="glossary-item"><dt>ITM / In-the-money</dt><dd>Call’da Underlying &gt; Strike; Put’ta Underlying &lt; Strike. İçsel değeri vardır.</dd></div>' +
      '<div class="glossary-item"><dt>ATM / At-the-money</dt><dd>Strike, Underlying fiyatına çok yakındır.</dd></div>' +
      '<div class="glossary-item"><dt>OTM / Out-of-the-money</dt><dd>Call’da Underlying &lt; Strike; Put’ta Underlying &gt; Strike. Intrinsic değeri sıfırdır.</dd></div>' +
      '<div class="glossary-item"><dt>Premium</dt><dd>Opsiyonun pay başına fiyatı; Bid / Ask / Last ile görülür.</dd></div>' +
      '<div class="glossary-item"><dt>Bid / Ask / Last</dt><dd>Alış teklifi, satış teklifi ve son işlem fiyatı.</dd></div>' +
      '<div class="glossary-item"><dt>Long / Short</dt><dd>Long = satın almak (hak sahibi); Short = satmak / yazmak (yükümlülük).</dd></div>' +
      '<div class="glossary-item"><dt>Debit / Credit</dt><dd>Debit: net ödenen prim. Credit: net alınan prim.</dd></div>' +
      '<div class="glossary-item"><dt>Intrinsic / extrinsic</dt><dd>Intrinsic: ITM kısmı. Extrinsic: zaman ve IV’den gelen Premium artışı.</dd></div>' +
      '<div class="glossary-item"><dt>Underlying</dt><dd>Opsiyonun dayandığı hisse, endeks veya varlık.</dd></div>' +
      '<div class="glossary-item"><dt>Greeks</dt><dd>Risk ölçüleri: Delta, Gamma, Theta, Vega.</dd></div>' +
      '<div class="glossary-item"><dt>Delta</dt><dd>Underlying $1 hareketince opsiyon fiyatının yaklaşık değişimi.</dd></div>' +
      '<div class="glossary-item"><dt>Gamma</dt><dd>Underlying hareket edince Delta’nın ne kadar değiştiği.</dd></div>' +
      '<div class="glossary-item"><dt>Theta</dt><dd>Bir gün geçince beklenen zaman aşınması.</dd></div>' +
      '<div class="glossary-item"><dt>Vega</dt><dd>IV bir puan artınca Premium’un yaklaşık değişimi.</dd></div>' +
      '<div class="glossary-item"><dt>IV / implied volatility</dt><dd>Piyasanın fiyatladığı beklenen salınım; Premium’u şişirir veya söndürür.</dd></div>' +
      '<div class="glossary-item"><dt>Payoff</dt><dd>Fiyata göre kâr/zarar eğrisi; genelde expiration anı çizilir.</dd></div>' +
      '<div class="glossary-item"><dt>Break-Even</dt><dd>Expiration’da işlemin sıfır kâr/zarar ettiği Underlying fiyatı.</dd></div>' +
      '<div class="glossary-item"><dt>Assignment</dt><dd>Short opsiyonun kullanılması; hisse teslim veya teslim alma yükümlülüğü.</dd></div>' +
      '<div class="glossary-item"><dt>Spread</dt><dd>Aynı veya yakın vadelerde birden fazla bacaklı yapı.</dd></div>' +
      '<div class="glossary-item"><dt>Vertical</dt><dd>Aynı expiration, farklı Strike’lı Spread.</dd></div>' +
      '<div class="glossary-item"><dt>Calendar / horizontal</dt><dd>Aynı Strike, farklı expiration’lı Spread.</dd></div>' +
      '<div class="glossary-item"><dt>Butterfly</dt><dd>Ortada Short, kanatlarda Long (veya tersi) üç Strike’lı yapı.</dd></div>' +
      '<div class="glossary-item"><dt>Iron Condor</dt><dd>OTM Put Spread + OTM Call Spread; Neutral, sınırlı risk/kâr.</dd></div>' +
      '<div class="glossary-item"><dt>Covered Call</dt><dd>Long hisse + Short Call; sınırlı ek gelir, tavanlı yükseliş.</dd></div>' +
      '<div class="glossary-item"><dt>Cash-Secured Put / CSP</dt><dd>Nakit karşılığı Short Put; düşerse hisse alma taahhüdü.</dd></div>' +
      '<div class="glossary-item"><dt>Wheel</dt><dd>CSP ile hisse alma, sonra Covered Call yazma döngüsü.</dd></div>' +
      '<div class="glossary-item"><dt>LEAPS</dt><dd>Uzun vadeli opsiyonlar (genelde 1 yıldan uzun expiration).</dd></div>' +
      '<div class="glossary-item"><dt>Bullish / Bearish / Neutral</dt><dd>Yükseliş, düşüş veya yatay beklenti.</dd></div>' +
      '<div class="glossary-item"><dt>Hedge</dt><dd>Mevcut riski azaltmak için alınan karşı pozisyon.</dd></div>' +
      '<div class="glossary-item"><dt>Liquidity</dt><dd>Dar Bid–Ask ve işlem derinliği; kolay giriş/çıkış.</dd></div>' +
      '<div class="glossary-item"><dt>Roll / Roll-out</dt><dd>Açık bacağı kapatıp daha ileri expiration’a taşımak.</dd></div>' +
      '<div class="glossary-item"><dt>Earnings</dt><dd>Bilanço / kazanç açıklaması; IV genelde öncesinde şişer.</dd></div>' +
      '<div class="glossary-item"><dt>Builder</dt><dd>Bacakları kurup Payoff ve Greeks’i canlı görme aracı.</dd></div>' +
      '<div class="glossary-item"><dt>FAQ</dt><dd>Sık sorulan sorular bölümü.</dd></div>' +
      '</dl>';

    var host = document.querySelector('.page-main .wrap') || document.querySelector('main.wrap') || document.querySelector('.wrap') || footer.parentNode;
    if (host === footer.parentNode) host.insertBefore(card, footer);
    else host.appendChild(card);
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
    wrapPageRails();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
