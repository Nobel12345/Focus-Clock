// HYBRID Service Worker for FocusFlow
// Version 1.0.0

const CACHE_NAME = 'focusflow-cache-v2'; // Increment cache version for updates
const OFFLINE_URL = './offline.html'; // Path to your dedicated offline page

// IMPORTANT: These paths should be relative to the root of the Service Worker's scope.
// If your service-worker.js is at /Focus-Clock/service-worker.js, then './' refers to /Focus-Clock/
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
];

// --- Service Worker Lifecycle Events ---

// Install event: Pre-cache essential assets and skip waiting
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    self.skipWaiting(); // Force the waiting service worker to become the active service worker immediately

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching essential app shell assets:', urlsToCache);
                // Ensure all cache operations are part of the waitUntil promise
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
                    .filter(cacheName => cacheName !== CACHE_NAME) // Filter out the current cache
                    .map(cacheName => {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName); // Delete old caches
                    })
            );
        }).then(() => self.clients.claim()) // Take control of all clients immediately
    );
});

// Fetch event handler: Cache-first, then Network, with offline fallback
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // If a response is found in cache, return it immediately
            if (cachedResponse) {
                return cachedResponse;
            }

            // Otherwise, fetch from the network
            return fetch(event.request).then(networkResponse => {
                // Check if we received a valid response to cache
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse; // Don't cache invalid responses
                }

                // IMPORTANT: Clone the response. A response is a stream and can only be consumed once.
                // We're consuming it once to cache it, and once to return it.
                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache); // Add response to cache
                });

                return networkResponse;
            }).catch(error => {
                // This catch block handles network errors (e.g., when offline)
                console.error('[Service Worker] Fetch failed:', event.request.url, error);
                // Serve the pre-cached offline page as a fallback
                return caches.match(OFFLINE_URL);
            });
        })
    );
});


// --- Original logic below (with refinements for timer and notifications) ---
// Service Worker for FocusFlow

let timerInterval;
let timerEndTime;
let timeRemainingOnPause = 0; // NEW: Store remaining time when paused for precise resume
let currentPhase; // 'Work', 'Short Break', 'Long Break'
let notificationTag = 'pomodoro-timer'; // A tag for notifications to group them

// Listen for messages from the main page
self.addEventListener('message', (event) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'INIT':
            // Establish communication port with the client
            self.clientPort = event.ports[0];
            self.clientPort.postMessage({ type: 'SW_READY' });
            break;
        case 'START':
            startTimer(payload.duration, payload.phase, payload.title);
            break;
        case 'STOP':
            stopTimer();
            break;
        case 'PAUSE':
            pauseTimer();
            break;
        case 'RESUME':
            resumeTimer();
            break;
        case 'SCHEDULE_NOTIFICATION':
            // Pass the entire transitionMessage from the payload as the fourth argument
            scheduleNotification(payload.delay, payload.title, payload.options, payload.transitionMessage); // <-- UPDATED LINE
            break;
        case 'CANCEL_ALARM':
            cancelAlarm(payload.timerId);
            break;
        case 'UPDATE_SETTINGS':
            // Can be used to update pomodoro settings if they change mid-session
            break;
        case 'GET_STATUS':
            sendStatusToClient();
            break;
    }
});

function startTimer(durationSeconds, phase, title) {
    stopTimer(); // Clear any existing timer before starting a new one
    currentPhase = phase;
    timerEndTime = Date.now() + durationSeconds * 1000;
    timeRemainingOnPause = 0; // Reset on new start

    // Send initial tick immediately to update the UI
    sendTick();

    timerInterval = setInterval(() => {
        sendTick();
        if (Date.now() >= timerEndTime) {
            clearInterval(timerInterval);
            timerInterval = null;
            // Notify the main app that the phase has ended
            // NOTE: This 'phase_ended' message is distinct from the 'TIMER_ENDED'
            //      sent via the notification schedule. This is for real-time
            //      UI updates if the tab is active. The notification path
            //      handles it when the tab might be in the background.
            self.clientPort.postMessage({
                type: 'phase_ended',
                phase: currentPhase,
                newState: getNextPhase(currentPhase),
                oldState: currentPhase
            });
        }
    }, 1000); // Update every second
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerEndTime = 0;
    currentPhase = null;
    timeRemainingOnPause = 0; // Reset remaining time on stop
    // Clear any pending notifications associated with this timer
    self.registration.getNotifications({ tag: notificationTag }).then(notifications => {
        notifications.forEach(notification => notification.close());
    });
}

function pauseTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        // Store the exact remaining time when paused
        timeRemainingOnPause = timerEndTime - Date.now();
        console.log(`[Service Worker] Paused. Remaining: ${Math.ceil(timeRemainingOnPause / 1000)}s`);
        sendStatusToClient(); // Update client with paused status
    }
}

function resumeTimer() {
    if (timeRemainingOnPause > 0) {
        // Restart the timer using the precisely stored remaining time
        console.log(`[Service Worker] Resuming with ${Math.ceil(timeRemainingOnPause / 1000)}s remaining.`);
        startTimer(Math.ceil(timeRemainingOnPause / 1000), currentPhase, 'Resumed');
        timeRemainingOnPause = 0; // Reset after resuming
    } else {
        console.warn('[Service Worker] Attempted to resume but no time was paused.');
    }
}

function sendTick() {
    if (timerEndTime > 0) {
        const remainingTime = Math.max(0, Math.floor((timerEndTime - Date.now()) / 1000));
        if (self.clientPort) {
            self.clientPort.postMessage({ type: 'tick', remainingTime: remainingTime });
        }
    }
}

function sendStatusToClient() {
    if (self.clientPort) {
        let remainingTime = 0;
        if (timerInterval) { // If running
            remainingTime = timerEndTime > 0 ? Math.max(0, Math.floor((timerEndTime - Date.now()) / 1000)) : 0;
        } else if (timeRemainingOnPause > 0) { // If paused
            remainingTime = Math.max(0, Math.floor(timeRemainingOnPause / 1000));
        }

        self.clientPort.postMessage({
            type: 'STATUS',
            isRunning: !!timerInterval,
            isPaused: !!(!timerInterval && timeRemainingOnPause > 0), // NEW: Add isPaused status
            remainingTime: remainingTime,
            currentPhase: currentPhase
        });
    }
}

// --- Notification Scheduling ---
function scheduleNotification(delay, title, options, transitionMessage) { // <--- UPDATED FUNCTION SIGNATURE
    // Ensure the tag is consistent for managing notifications
    options.tag = notificationTag;
    options.renotify = true; // Ensures new notification if one with same tag exists

    // Actions for notification buttons - ensure icons are accessible
    // These paths are relative to the Service Worker's scope
    options.actions = [
        { action: 'pause', title: 'Pause', icon: './icons/pause.png' },
        { action: 'resume', title: 'Resume', icon: './icons/play.png' },
        { action: 'stop', title: 'Stop', icon: './icons/stop.png' }
    ];

    // Clear any existing notifications with the same tag before scheduling a new one
    self.registration.getNotifications({ tag: notificationTag }).then(notifications => {
        notifications.forEach(notification => notification.close());
    });

    // Schedule the notification to appear after 'delay' milliseconds
    setTimeout(() => {
        self.registration.showNotification(title, options);

        // --- NEW: Post message back to client when timer ends ---
        self.clients.matchAll({ type: 'window' }).then(clients => {
            clients.forEach(client => {
                // Find the client that sent the initial message, or all clients if needed.
                // For simplicity, we'll post to all controlled windows.
                client.postMessage(transitionMessage); // <--- NEW CODE: Sends the message back
            });
        });
        // --- END NEW ---

    }, delay);
}

function cancelAlarm(timerId) {
    if (timerId === 'pomodoro-transition') {
        self.registration.getNotifications({ tag: notificationTag }).then(notifications => {
            notifications.forEach(notification => notification.close());
        });
    }
    // Add logic for other timerIds if needed in the future
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Close the notification after click

    const action = event.action; // Get the action clicked (e.g., 'pause', 'resume', 'stop')

    // Find all window clients (tabs/windows) that this Service Worker controls
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
            // If the client is visible, send the message directly
            if (client.visibilityState === 'visible') {
                client.postMessage({ type: 'notification_action', action: action });
            } else {
                // If the page is not visible, focus it and then send the message
                client.focus().then(() => {
                    client.postMessage({ type: 'notification_action', action: action });
                });
            }
        });
    });
});

// Helper function to determine the next phase (for consistency with the main app)
function getNextPhase(currentPhase) {
    // This simplified logic assumes a basic cycle.
    // You might expand this with a `pomodoroCycleCount` for alternating short/long breaks.
    if (currentPhase === 'Work') {
        return 'short_break';
    } else if (currentPhase === 'short_break') {
        return 'Work';
    } else if (currentPhase === 'Long Break') {
        return 'Work';
    }
    return 'Work'; // Default to work if phase is unknown
}
