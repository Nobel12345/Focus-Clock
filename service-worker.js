/**
 * FocusFlow Service Worker
 *
 * This worker handles two primary functions:
 * 1. Caching the core application shell for offline access.
 * 2. Scheduling reliable background notifications.
 */

const CACHE_NAME = 'focusflow-cache-v1'; // Increment version to trigger update
// List of essential files for the app to work offline.
const URLS_TO_CACHE = [
  '/', // The main HTML file
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/lucide@latest',
  'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js'
];

// --- Service Worker Lifecycle ---

// On install, open a cache and add the core app files to it.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        // Add all URLs to the cache. If any request fails, the installation fails.
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Force the waiting service worker to become the active worker.
  );
});

// On activate, clean up old caches.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If a cache is not our current one, delete it.
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all open clients.
  );
});

// On fetch, intercept network requests.
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // For Firebase and other API requests, always go to the network.
  if (event.request.url.includes('firebase') || event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For other requests, use a "Cache first, then network" strategy.
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // If we find a match in the cache, return it.
        if (cachedResponse) {
          return cachedResponse;
        }
        // If not in cache, go to the network.
        return fetch(event.request);
      })
  );
});


// --- Message Handling (Notification Logic) ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { delay, title, options } = event.data.payload;

    setTimeout(() => {
      self.registration.showNotification(title, options)
        .catch(err => console.error('Service Worker: Error showing notification:', err));
    }, delay);
  }
});
