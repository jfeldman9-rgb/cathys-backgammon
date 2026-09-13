/* Cathy's Backgammon — offline cache (GitHub Pages friendly). */
const CACHE = 'cathy-backgammon-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './engine.js',
  './ai.js',
  './app.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png',
  './assets/jason.svg',
  './assets/chatgpt-art/avatar-cathy-cheese.png',
  './assets/chatgpt-art/avatar-cathy-momdog.png',
  './assets/chatgpt-art/checker-cheese.png',
  './assets/chatgpt-art/checker-grape.png',
  './assets/photos/derived/01-mom-dog-hybrid-face.jpg',
  './assets/photos/derived/02-cheese-cathy-face.jpg',
  './assets/photos/derived/03-bama-2026-face.jpg',
  './assets/photos/01-mom-dog-hybrid.png',
  './assets/photos/02-cheese-cathy.png',
  './assets/photos/03-bama-2026.png',
  './assets/photos/01-mom-dog-hybrid.svg',
  './assets/photos/02-cheese-cathy.svg',
  './assets/photos/03-bama-2026.svg',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const go = fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || go;
    })
  );
});
