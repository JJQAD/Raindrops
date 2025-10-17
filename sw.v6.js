// sw.v6.js — versioned service worker for cache-busting on GitHub Pages
const CACHE_NAME = 'raindrops-v6';
const PRECACHE_URLS = [
  './',
  './index.html',
  './sketch.v6.js',
  './manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js',
  'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/addons/p5.sound.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((resp) => resp || fetch(event.request))
  );
});
