// HYBRID Service Worker for FocusFlow
// Version 1.0.4 (updated for web push notifications with auto-start logic)

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
    const body = pushData.body || 'Your session has ended.';
    const icon = pushData.icon || './icons/play.png';
    const tag = 'pomodoro-timer';

    // Check if the push payload contains an instruction to auto-start a new session
    const shouldAutoStart = pushData.newState === 'focus' || pushData.newState === 'break';
    const url = pushData.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                let clientToFocus = clients.find(client => client.url.endsWith('index.html')) || clients[0];

                // Auto-start logic: If a client is found and we should auto-start, send a message.
                if (clientToFocus && shouldAutoStart) {
                    console.log('[Service Worker] Found client, sending auto-start message.');
                    clientToFocus.postMessage({ type: 'timer_auto_start', newState: pushData.newState });
                    return self.registration.showNotification(title, { body, icon, tag });
                } else if (shouldAutoStart) {
                    // If no client is open, open a new window to trigger the app and message it
                    console.log('[Service Worker] No client found, opening a new window to auto-start.');
                    return self.clients.openWindow(url)
                        .then(newClient => {
                            if (newClient) {
                                // Wait a moment for the page to load, then send the message
                                setTimeout(() => {
                                    newClient.postMessage({ type: 'timer_auto_start', newState: pushData.newState });
                                }, 1000);
                            }
                            // Also show a notification to inform the user
                            return self.registration.showNotification(title, { body, icon, tag });
                        });
                } else {
                    // Default behavior: just show the notification
                    const options = {
                        body: body,
                        icon: icon,
                        badge: pushData.badge || './icons/play.png',
                        tag: tag,
                        renotify: true,
                        actions: [
                            { action: 'pause', title: 'Pause', icon: './icons/pause.png' },
                            { action: 'resume', title: 'Resume', icon: './icons/play.png' },
                            { action: 'stop', title: 'Stop', icon: './icons/stop.png' }
                        ],
                        data: { url, newState: pushData.newState }
                    };
                    return self.registration.showNotification(title, options);
                }
            })
    );
});

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
