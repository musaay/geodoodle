// GeoDoodle Service Worker - Offline caching
// Bump the version on breaking cache changes; HTML is network-first so new
// deploys reach users without a version bump.
const CACHE_NAME = 'geodoodle-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

const isHtmlRequest = (request) =>
  request.mode === 'navigate' ||
  request.headers.get('accept')?.includes('text/html');

const cachePut = (request, response) => {
  if (response && response.ok && request.method === 'GET') {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // HTML: network-first so deploys propagate; fall back to cache offline.
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => cachePut(request, response))
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Everything else (hashed assets, fonts, images): cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => cachePut(request, response));
    })
  );
});
