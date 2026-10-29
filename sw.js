'use strict';

// Keep this cache separate from other games on the same GitHub Pages origin.
const PREFIX = `deep-below-${new URL(self.registration.scope).pathname}-`;
const CACHE = `${PREFIX}v7`;
const FILES = [
  './', './index.html', './style.css?v=7', './engine.js?v=7',
  './game.js?v=7', './install.js?v=7', './manifest.webmanifest',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];
const allowedPaths = new Set(FILES.map(file => new URL(file, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), {cache: 'reload'})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  // Updating never reloads a page or interrupts an expedition.
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !allowedPaths.has(url.pathname)) return;
  // Read by name: a finishing request from the old worker must not recreate a
  // cache that its replacement has just removed.
  event.respondWith((async () => {
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch { /* Open the complete cached game when offline. */ }
      return caches.match(new URL('./index.html', self.registration.scope), {cacheName: CACHE});
    }
    return await caches.match(event.request, {cacheName: CACHE}) || fetch(event.request);
  })());
});
