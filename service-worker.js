// Service Worker for FocusFlow (cache-first app shell)
// Generated on fix
const CACHE_NAME = 'focusflow-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './pomodoro-worker.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/maskable_icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Cache-first for same-origin requests, network-first for navigation
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(res => res || fetch(req))
    );
  }
});

// Optional: listen for messages (e.g., to trigger notifications)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data.payload || {};
    self.registration.showNotification(title || 'FocusFlow', options || {});
  }
});
