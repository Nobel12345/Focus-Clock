// HYBRID Service Worker for FocusFlow
// Version 1.0.5 (updated for reliable notification-driven auto-start)

const CACHE_NAME = 'focusflow-cache-v3';
const OFFLINE_URL = './offline.html';

const urlsToCache = [
    './',
    './index.html',
    './fina.html',
    './manifest.json',
    './pomodoro-worker.js',
    './icons/pause.png',
    './icons/play.png',
    './icons/stop.png',
    OFFLINE_URL,
    'https://placehold.co/192x192/0a0a0a/e0e0e0?text=Flow+192',
    'https://placehold.co/512x512/0a0a0a/e0e0e0?text=Flow+512',
];

// --- Service Worker Lifecycle Events ---

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

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push received.');

    const pushData = event.data ? event.data.json() : {};
    const title = pushData.title || 'FocusFlow Notification';
    const body = pushData.body || 'Your session has ended. Tap to start the next one!';
    const icon = pushData.icon || './icons/play.png';
    const tag = 'pomodoro-timer';

    const options = {
        body: body,
        icon: icon,
        badge: pushData.badge || './icons/play.png',
        tag: tag,
        renotify: true,
        actions: [
            { action: 'start-next', title: 'Start Next Session', icon: './icons/play.png' },
            { action: 'stop', title: 'Stop Timer', icon: './icons/stop.png' }
        ],
        // Crucial: Store the newState in the data field for the click handler
        data: {
            url: pushData.url || '/',
            newState: pushData.newState,
        }
    };

    // The push event handler now only focuses on showing the notification
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

// Notification click handler (now handles auto-start)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const action = event.action;
    const notificationData = event.notification.data;
    const newState = notificationData.newState;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            let clientToFocus = clients.find(client => client.url.endsWith('index.html')) || clients[0];

            if (clientToFocus) {
                clientToFocus.focus().then(() => {
                    // Send the specific action and the newState from the notification
                    clientToFocus.postMessage({ type: 'notification_action', action: action, newState: newState });
                });
            } else {
                // Open the app and pass the new state to be handled once loaded
                self.clients.openWindow(notificationData.url)
                    .then(newClient => {
                        if (newClient) {
                            setTimeout(() => {
                                newClient.postMessage({ type: 'notification_action', action: action, newState: newState });
                            }, 1000);
                        }
                    });
            }
        })
    );
});
