// HYBRID Service Worker for FocusFlow
// Version 1.0.5 (updated for reliable notification-driven auto-start)

const CACHE_NAME = 'focusflow-cache-v3'; // Keep the cache name for consistency, or increment if you've changed assets
const OFFLINE_URL = './offline.html';

const urlsToCache = [
    './',
    './index.html',
    './fina.html', // Assuming this is part of your app shell
    './manifest.json',
    './pomodoro-worker.js',
    './icons/pause.png',
    './icons/play.png',
    './icons/stop.png',
    OFFLINE_URL,
    'https://placehold.co/192x192/0a0a0a/e0e0e0?text=Flow+192',
    'https://placehold.co/512x512/0a0a0a/e0e0e0?text=Flow+512',
];

// Stores active timeouts for scheduled alarms, allowing them to be cancelled.
let scheduledAlarms = {};

// --- Service Worker Lifecycle Events ---

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    self.skipWaiting(); // Forces the new service worker to activate immediately

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
                    .filter(cacheName => cacheName !== CACHE_NAME) // Delete old caches
                    .map(cacheName => {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => self.clients.claim()) // Take control of un-controlled clients immediately
    );
});

self.addEventListener('fetch', (event) => {
    // Only intercept GET requests for caching
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse; // Serve from cache if available
            }

            // Otherwise, fetch from network
            return fetch(event.request).then(networkResponse => {
                // Check if we received a valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Clone the response because it's a stream and can only be consumed once
                const responseToCache = networkResponse.clone();

                // Cache the new response
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(error => {
                // If fetch fails (e.g., offline), serve the offline page
                console.error('[Service Worker] Fetch failed:', event.request.url, error);
                return caches.match(OFFLINE_URL);
            });
        })
    );
});

// --- In-page Communication and Alarm Scheduling ---

self.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    switch (event.data.type) {
        case 'SCHEDULE_ALARM':
            {
                const { delay, title, options, timerId, transitionMessage } = event.data.payload;

                // Clear any existing alarm with the same ID to prevent duplicates
                if (scheduledAlarms[timerId]) {
                    clearTimeout(scheduledAlarms[timerId]);
                }

                console.log(`[Service Worker] Scheduling alarm '${timerId}' for ${delay / 1000} seconds.`);

                scheduledAlarms[timerId] = setTimeout(async () => {
                    await self.registration.showNotification(title, options)
                        .catch(error => console.error('[Service Worker] Error showing scheduled notification:', error));

                    // Send a message back to the main app to trigger phase end logic
                    // This message is crucial for auto-starting the next phase when the app is foregrounded
                    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                    clients.forEach(client => {
                        // Post message to all clients. The main app will check if it's the active one.
                        client.postMessage(transitionMessage);
                    });

                    delete scheduledAlarms[timerId]; // Clean up after execution
                }, delay);
            }
            break;

        case 'CANCEL_ALARM':
            {
                const { timerId } = event.data.payload;
                if (scheduledAlarms[timerId]) {
                    clearTimeout(scheduledAlarms[timerId]);
                    delete scheduledAlarms[timerId];
                    console.log(`[Service Worker] Cancelled alarm '${timerId}'.`);
                }
            }
            break;

        // No longer explicitly handling 'SCHEDULE_NOTIFICATION' as it's now integrated into 'SCHEDULE_ALARM'
        // If you had other types of notifications, you might keep a separate handler.
    }
});


// --- Web Push Notification Logic (for server-sent pushes, not internal alarms) ---

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
        // Crucial: Store the newState and oldState in the data field for the click handler
        data: {
            url: pushData.url || '/',
            newState: pushData.newState,
            oldState: pushData.oldState, // Ensure your server sends this in pushData
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
    const { newState, oldState, url } = notificationData;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Find an existing client for your app or the first available
            let clientToFocus = clients.find(client => client.url.endsWith('index.html')) || clients[0];

            if (clientToFocus) {
                clientToFocus.focus().then(() => {
                    // Send a standardized message back to the main app, similar to TIMER_ENDED
                    clientToFocus.postMessage({ 
                        type: 'NOTIFICATION_ACTION_TRIGGERED', 
                        action: action, 
                        newState: newState, 
                        oldState: oldState 
                    });
                });
            } else {
                // If no client is open, open a new window and then send the message after a delay
                self.clients.openWindow(url)
                    .then(newClient => {
                        if (newClient) {
                            // Give the client a moment to load and register its message listener
                            setTimeout(() => {
                                newClient.postMessage({ 
                                    type: 'NOTIFICATION_ACTION_TRIGGERED', 
                                    action: action, 
                                    newState: newState, 
                                    oldState: oldState 
                                });
                            }, 1000); // 1-second delay
                        }
                    });
            }
        })
    );
});
