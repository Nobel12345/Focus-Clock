// service-worker.js
const CACHE_NAME = 'focusflow-cache-v1';
const ASSETS_TO_CACHE = [
    '/', // Cache the root HTML file
    '/index.html', // Explicitly cache index.html
    // CSS and Font Libraries
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    // JavaScript Libraries
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
    'https://unpkg.com/lucide@latest',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js',
    'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js',
    // Add any other static assets your app uses (e.g., images, other JS files)
    // Note: Firebase's SDK handles its own offline persistence for data.
    // We are primarily caching the application's static assets here.
];

// Install event: Caches all the static assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all app shell assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((error) => {
                console.error('[Service Worker] Caching failed:', error);
            })
    );
});

// Activate event: Cleans up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Ensure the service worker takes control of clients immediately
    return self.clients.claim();
});

// Fetch event: Intercepts network requests
self.addEventListener('fetch', (event) => {
    // We only want to handle GET requests for navigation and static assets
    if (event.request.method !== 'GET') {
        return;
    }

    // For navigation requests, try to serve from cache first, then network
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            }).catch(() => {
                // If both cache and network fail for navigation, return a fallback page
                // For this app, we don't have a dedicated offline.html, so just return nothing.
                return new Response('<h1>Offline</h1><p>You are offline and the requested page is not in cache.</p>', {
                    headers: { 'Content-Type': 'text/html' }
                });
            })
        );
        return;
    }

    // For other requests (like assets), use a cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // No cache hit - fetch from network
                return fetch(event.request).then((networkResponse) => {
                    // Check if we received a valid response
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    // IMPORTANT: Clone the response. A response is a stream
                    // and can only be consumed once. We must clone it so that
                    // we can consume one in the cache and one in the browser.
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                });
            })
            .catch((error) => {
                console.error('[Service Worker] Fetch failed:', error);
                // You could return a specific offline image/asset here if needed
                return new Response('<h1>Offline Asset</h1><p>This asset is not available offline.</p>', {
                    headers: { 'Content-Type': 'text/html' }
                });
            })
    );
});

// Push Notifications (Requires server-side implementation and user permission)
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push Received.');
    const title = 'FocusFlow Notification';
    const options = {
        body: event.data ? event.data.text() : 'You have a new notification!',
        icon: '/path/to/icon.png', // Replace with your app icon
        badge: '/path/to/badge.png' // Replace with your app badge icon
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// Background Sync (Requires specific API usage and can be complex)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-study-data') {
        console.log('[Service Worker] Background Sync for study data triggered!');
        // Perform data synchronization here, e.g., send queued study sessions to Firestore
        // This would involve fetching data from IndexedDB (if used for offline queue)
        // and sending it to Firestore.
        event.waitUntil(
            // Example: Replace with actual data sync logic
            new Promise(resolve => {
                console.log('Simulating background data sync...');
                setTimeout(() => {
                    console.log('Background sync complete!');
                    resolve();
                }, 2000);
            })
        );
    }
});
