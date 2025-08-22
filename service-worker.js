// HYBRID Service Worker for FocusFlow
// Restores original background timer & notification message handling,
// and adds minimal lifecycle events to ensure control.

const CACHE_NAME = 'focusflow-cache-v1'; // Cache version
const urlsToCache = [
  '/Focus-Clock/',              
  '/Focus-Clock/index.html',
  '/Focus-Clock/fina.html',
  '/Focus-Clock/manifest.json',
  '/Focus-Clock/pomodoro-worker.js',
  '/Focus-Clock/icons/pause.png',
  '/Focus-Clock/icons/play.png',
  '/Focus-Clock/icons/stop.png',
  '/', 
  'index.html',
  'manifest.json',
  'https://placehold.co/192x192/0a0a0a/e0e0e0?text=Flow+192',
  'https://placehold.co/512x512/0a0a0a/e0e0e0?text=Flow+512',
];

// --- Minimal lifecycle to ensure control ---
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching essential app shell assets');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Service Worker: Failed to cache during install:', error);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                    return null; // Return null for the current cache
                }).filter(Boolean) // Filter out null values
            );
        }).then(() => self.clients.claim())
    );
});

// --- Fetch event handler for caching and offline support ---
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // If a response is found in cache, return it
            if (cachedResponse) {
                return cachedResponse;
            }

            // Otherwise, fetch from the network
            return fetch(event.request).then(networkResponse => {
                // Check if we received a valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // IMPORTANT: Clone the response. A response is a stream
                // and can only be consumed once. We're consuming it once
                // to cache it, and once to return it.
                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(error => {
                // This catch is for network errors, e.g., offline
                console.error('Service Worker: Fetch failed:', event.request.url, error);
                // You could serve an offline page here if desired
                // return caches.match('/offline.html');
                return new Response('<h1>You are offline!</h1>', {
                    headers: { 'Content-Type': 'text/html' }
                });
            });
        })
    );
});


// --- Original logic below ---
// Service Worker for FocusFlow
// Version 1.0.0

let timerInterval;
let timerEndTime;
let currentPhase; // 'Work', 'Short Break', 'Long Break'
let notificationTag = 'pomodoro-timer'; // A tag for notifications to group them

// Listen for messages from the main page
self.addEventListener('message', (event) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'INIT':
            // Establish communication port
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
            scheduleNotification(payload.delay, payload.title, payload.options);
            break;
        case 'CANCEL_ALARM':
            cancelAlarm(payload.timerId);
            break;
        case 'UPDATE_SETTINGS':
            // This might be used to update pomodoro settings if they change mid-session
            // For now, we'll assume settings are passed with 'START'
            break;
        case 'GET_STATUS':
            sendStatusToClient();
            break;
    }
});

function startTimer(durationSeconds, phase, title) {
    stopTimer(); // Clear any existing timer
    currentPhase = phase;
    timerEndTime = Date.now() + durationSeconds * 1000;

    // Send initial tick immediately
    sendTick();

    timerInterval = setInterval(() => {
        sendTick();
        if (Date.now() >= timerEndTime) {
            clearInterval(timerInterval);
            timerInterval = null;
            // Changed to also include newState and oldState for consistency with handlePomodoroPhaseEnd
            // This ensures the main app knows what the next phase should be.
            self.clientPort.postMessage({
                type: 'phase_ended',
                phase: currentPhase, // Old state
                newState: getNextPhase(currentPhase), // New state
                oldState: currentPhase // Explicitly pass oldState
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
    // Clear any pending notifications
    self.registration.getNotifications({ tag: notificationTag }).then(notifications => {
        notifications.forEach(notification => notification.close());
    });
}

function pauseTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        // Store remaining time if needed for resume, but for now, just stop the tick
    }
}

function resumeTimer() {
    // This is a simplified resume. A real implementation would need to store
    // the remaining time when paused and restart from there.
    // For now, it just restarts the tick from current time, assuming the main app
    // will re-send the correct duration if needed.
    if (timerEndTime > Date.now()) {
        startTimer((timerEndTime - Date.now()) / 1000, currentPhase, 'Resumed');
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
        const remainingTime = timerEndTime > 0 ? Math.max(0, Math.floor((timerEndTime - Date.now()) / 1000)) : 0;
        self.clientPort.postMessage({
            type: 'STATUS',
            isRunning: !!timerInterval,
            remainingTime: remainingTime,
            currentPhase: currentPhase
        });
    }
}

// --- Notification Scheduling ---
function scheduleNotification(delay, title, options) {
    // Ensure the tag is consistent for managing notifications
    options.tag = notificationTag;
    options.renotify = true; // Ensures new notification if one with same tag exists

    // Actions for notification buttons
    options.actions = [
        { action: 'pause', title: 'Pause', icon: '/icons/pause.png' }, // Replace with actual icon paths
        { action: 'resume', title: 'Resume', icon: '/icons/play.png' },
        { action: 'stop', title: 'Stop', icon: '/icons/stop.png' }
    ];

    // Clear any existing notifications with the same tag before scheduling a new one
    self.registration.getNotifications({ tag: notificationTag }).then(notifications => {
        notifications.forEach(notification => notification.close());
    });

    setTimeout(() => {
        self.registration.showNotification(title, options);
    }, delay);
}

function cancelAlarm(timerId) {
    if (timerId === 'pomodoro-transition') {
        self.registration.getNotifications({ tag: notificationTag }).then(notifications => {
            notifications.forEach(notification => notification.close());
        });
    }
    // Add logic for other timerIds if needed
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Close the notification

    const action = event.action; // Get the action clicked (e.g., 'pause', 'resume', 'stop')

    // Send a message back to the client (main page)
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
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

// Helper function to determine the next phase for consistency with the main app
function getNextPhase(currentPhase) {
    // This simplified logic assumes a basic work -> short_break -> work -> long_break cycle.
    // In a full application, this would need to consider the current pomodoro cycle count.
    if (currentPhase === 'Work') {
        // For simplicity, always go to short break after work.
        // A more complex logic would alternate short and long breaks.
        return 'short_break';
    } else if (currentPhase === 'short_break') {
        return 'Work';
    } else if (currentPhase === 'Long Break') {
        return 'Work';
    }
    return 'Work'; // Default to work if phase is unknown
}
