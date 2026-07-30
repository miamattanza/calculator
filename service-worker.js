// service-worker.js — офлайн-кэш «оболочки приложения».
// При обновлении кода увеличивайте CACHE_VERSION, чтобы обновить кэш.

const CACHE_VERSION = 'fintracker-v41';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/i18n.js',
  './js/format.js',
  './js/models.js',
  './js/store.js',
  './js/dom.js',
  './js/icons.js',
  './js/charts.js',
  './js/keypad.js',
  './js/views/transactions.js',
  './js/views/analytics.js',
  './js/views/forecast.js',
  './js/views/planning.js',
  './js/views/budgets.js',
  './js/views/settings.js',
  './js/views/search.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/ui-icons.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // {cache:'reload'} — тянем свежие файлы в обход HTTP-кэша браузера,
      // иначе в новый кэш мог попасть старый JS (и версия «зависала»).
      .then((cache) => Promise.all(APP_SHELL.map((url) =>
        fetch(new Request(url, { cache: 'reload' }))
          .then((res) => (res && res.ok ? cache.put(url, res) : null))
          .catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Код приложения (навигация + html/js/css/manifest) — «сеть в приоритете»:
  // когда есть интернет, всегда берём свежую версию (иначе версия «зависала»
  // на старом кэше); офлайн — из кэша, для навигации фолбэк на index.html.
  const isCode = req.mode === 'navigate' || /\.(?:html|js|css|webmanifest)$/.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Остальное (иконки/картинки): cache-first с дозаписью в кэш.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
