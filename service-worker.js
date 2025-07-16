/**
 * @file service-worker.js
 * @description A robust service worker for the Pomodoro timer.
 * This version simplifies logic to ensure reliable background execution.
 * It acts as the primary "alarm clock" for the application.
 */

// A Map to store active timers so they can be cancelled.
const activeTimers = new Map();

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activated.');
    // Take control of all clients (open tabs) in its scope immediately.
    event.waitUntil(self.clients.claim());
});

/**
 * Listens for messages from the main application script.
 */
self.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    // --- Schedule a new "alarm" ---
    if (type === 'SCHEDULE_ALARM') {
        const { delay, timerId, transitionMessage } = payload;
        
        // If a timer with the same ID already exists, clear it.
        if (activeTimers.has(timerId)) {
            clearTimeout(activeTimers.get(timerId));
        }

        const timeoutId = setTimeout(() => {
            console.log(`Service Worker: Alarm '${timerId}' fired.`);
            
            // Send the transition message back to all open tabs of the app.
            self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then((clientList) => {
                clientList.forEach(client => {
                    client.postMessage(transitionMessage);
                });
            });

            // Show a system notification using the details from the transition message.
            self.registration.showNotification(transitionMessage.title, transitionMessage.options)
                .catch(err => console.error('Service Worker: Notification failed:', err));
            
            // Clean up the timer from our map.
            activeTimers.delete(timerId);

        }, delay);

        // Store the new timer's ID so it can be cancelled.
        activeTimers.set(timerId, timeoutId);
        console.log(`Service Worker: Scheduled alarm '${timerId}' for ${delay}ms.`);
    }

    // --- Cancel a previously scheduled alarm ---
    if (type === 'CANCEL_ALARM') {
        const { timerId } = payload;
        if (activeTimers.has(timerId)) {
            clearTimeout(activeTimers.get(timerId));
            activeTimers.delete(timerId);
            console.log(`Service Worker: Cancelled alarm '${timerId}'`);
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
            if (clientList.length > 0) {
                // Try to find a focused client first
                for (const client of clientList) {
                    if (client.focused) {
                        return client.focus();
                    }
                }
                // If none are focused, focus the first one
                return clientList[0].focus();
            }
            // If no tab is open, open a new one.
            return clients.openWindow('/');
        })
    );
});
