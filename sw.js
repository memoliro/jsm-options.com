const CACHE_NAME = 'jsm-options-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/style.css',
  '/favicon-32.png',
  '/favicon-48.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS.map(u => new Request(u, {cache: 'reload'}))).catch(()=>{}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match('/offline.html');
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        e.waitUntil(fetch(req).then(r => { if(r.ok) caches.open(CACHE_NAME).then(c => c.put(req, r)); }).catch(()=>{}));
        return cached;
      }
      return fetch(req).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
        return res;
      });
    })
  );
});
