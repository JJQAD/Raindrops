self.addEventListener('install', event => {
  event.waitUntil(caches.open('ripples-v1').then(cache => cache.addAll([
    './','./index.html','./sketch.js','./manifest.webmanifest',
    'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js',
    'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/addons/p5.sound.min.js'
  ])));
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(r=>r||fetch(event.request)));
});