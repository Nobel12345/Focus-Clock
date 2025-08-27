// HYBRID Service Worker for FocusFlow
// Version 1.0.3 (updated for web push notifications)

const CACHE_NAME = 'focusflow-cache-v3'; // Increment cache version for updates
const OFFLINE_URL = './offline.html'; // Path to your dedicated offline page

// IMPORTANT: These paths should be relative to the root of the Service Worker's scope.
const urlsToCache = [
    './', // Represents /Focus-Clock/
    './index.html',
    './fina.html',
    './manifest.json',
    './pomodoro-worker.js',
    './icons/pause.png', // Ensure these paths are correct
    './icons/play.png',
    './icons/stop.png',
    OFFLINE_URL, // Add the offline page to cache
    'https://placehold.co/192x192/0a0a0a/e0e0e0?text=Flow+192',
    'https://placehold.co/512x512/0a0a0a/e0e0e0?text=Flow+512',
    // Add other essential assets here
];

// --- Service Worker Lifecycle Events ---

// Install event: Pre-cache essential assets and skip waiting
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    self.skipWaiting(); 

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching essential app shell assets:', urlsToCache);
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('[Service Worker] Failed to cache during install:', error);
            })
    );
});

// Activate event: Clean up old caches and take control of existing clients
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event handler: Cache-first, then Network, with offline fallback
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(networkResponse => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(error => {
                console.error('[Service Worker] Fetch failed:', event.request.url, error);
                return caches.match(OFFLINE_URL);
            });
        })
    );
});

// --- Web Push Notification Logic ---

// Listen for a 'push' event from the push service
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push received.');

    // The data payload from your backend server
    const pushData = event.data ? event.data.json() : {};

    const title = pushData.title || 'FocusFlow Notification';
    const options = {
        body: pushData.body || 'Your session has ended.',
        icon: pushData.icon || './icons/play.png',
        badge: pushData.badge || './icons/play.png',
        tag: 'pomodoro-timer', // Consistent tag to group notifications
        renotify: true, // Show a new notification even if one with this tag exists
        actions: [
            { action: 'pause', title: 'Pause', icon: './icons/pause.png' },
            { action: 'resume', title: 'Resume', icon: './icons/play.png' },
            { action: 'stop', title: 'Stop', icon: './icons/stop.png' }
        ],
        // The data field can be used to pass information back to the client
        data: {
            url: pushData.url || '/',
            newState: pushData.newState,
            oldState: pushData.oldState,
        }
    };

    // This ensures the Service Worker stays active until the notification is shown
    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => {
                console.log(`[Service Worker] Push notification "${title}" shown.`);
            })
            .catch((error) => {
                console.error('[Service Worker] Error showing push notification:', error);
            })
    );
});

// Notification click handler (this logic remains correct)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const action = event.action;

    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        let clientToFocus = clients.find(client => client.visibilityState === 'visible') || clients[0];

        if (clientToFocus) {
            clientToFocus.focus().then(() => {
                clientToFocus.postMessage({ type: 'notification_action', action: action });
            });
        } else {
            console.warn('[Service Worker] No client found to handle notification action.');
        }
    });
});
