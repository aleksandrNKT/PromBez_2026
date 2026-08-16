const CACHE_NAME = 'pb-trainer-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './firebase-config.js',
  './data.json',
  './manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Стратегия: сначала сеть (чтобы данные/статистика были свежими),
// при отсутствии сети — отдаём то, что закэшировано.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Не кэшируем запросы к Firebase/Google — они должны идти в сеть напрямую.
  if (event.request.url.includes('googleapis.com') || event.request.url.includes('firebase')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
