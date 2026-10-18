// OtakuChore — offline-capable service worker.
// network-first for the app shell (so updates land immediately), cache-first
// for fonts/icons. Only same-origin GETs are handled; cross-origin requests
// (e.g. the sync Worker on *.workers.dev) pass straight through, untouched.
const CACHE = 'otakuchore-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/fonts.css',
  './css/theme.css',
  './css/avatar.css',
  './js/config.js',
  './js/store.js',
  './js/engine.js',
  './js/sync.js',
  './js/avatar.js',
  './js/booth.js',
  './js/chat.js',
  './js/ui.js',
  './js/app.js',
  './fonts/bangers.woff2',
  './fonts/nunito-400.woff2',
  './fonts/nunito-700.woff2',
  './fonts/nunito-900.woff2',
  './fonts/send-flowers.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))) // tolerate any single miss
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CACHE_FIRST = /\.(?:woff2|png|ico|svg|jpg|jpeg)$/i;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never touch POST/sync writes
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;       // let cross-origin (sync Worker) pass through

  if (CACHE_FIRST.test(url.pathname)) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit =>
        hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      )
    );
    return;
  }

  // app shell (html/css/js): network-first, fall back to cache offline
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(hit =>
        hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
      )
    )
  );
});
