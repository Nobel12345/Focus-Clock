/**
 * @file service-worker.js
 * @description A more reliable service worker for the Pomodoro timer.
 * It handles scheduling, executing, and cancelling notifications. It acts as the primary "alarm clock"
 * by sending a message back to the main app when the time is up, triggering the state transition reliably.
 */

// A Map to store active timers, so we can cancel them.
// The key will be a unique ID (like 'pomodoro-transition') and the value will be the timer ID from setTimeout.
const activeTimers = new Map();

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activated');
    event.waitUntil(self.clients.claim());
});

/**
 * Listens for messages from the main application script.
 * It can schedule a new notification or cancel an existing one.
 */
self.addEventListener('message', (event) => {
    if (!event.data) return;

    const { type, payload } = event.data;

    // --- Schedule a new notification ---
    if (type === 'SCHEDULE_NOTIFICATION') {
        const { delay, title, options, transitionMessage, timerId } = payload;

        // If a timer with the same ID already exists, clear it before setting a new one.
        if (activeTimers.has(timerId)) {
            clearTimeout(activeTimers.get(timerId));
        }

        const timeoutId = setTimeout(() => {
            // Find all matching clients and send the transition message.
            self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then((clientList) => {
                clientList.forEach(client => {
                    client.postMessage(transitionMessage);
                });
            });

            // Show the system notification.
            self.registration.showNotification(title, options)
                .catch(err => console.error('Notification failed:', err));
            
            // Clean up the timer from our map once it has fired.
            activeTimers.delete(timerId);

        }, delay);

        // Store the new timer's ID so it can be cancelled if needed.
        activeTimers.set(timerId, timeoutId);
    }

    // --- Cancel a previously scheduled notification ---
    if (type === 'CANCEL_NOTIFICATION') {
        const { timerId } = payload;
        if (activeTimers.has(timerId)) {
            clearTimeout(activeTimers.get(timerId));
            activeTimers.delete(timerId);
            console.log(`Service Worker: Cancelled timer '${timerId}'`);
        }
    }
});

/**
 * Handles what happens when a user clicks on a notification.
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If there's an open tab for the app, focus it.
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            // If no tab is open, open a new one.
            return clients.openWindow('/');
        })
    );
});
