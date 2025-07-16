/**
 * =================================================================
 * SERVICE WORKER (service-worker.js)
 * =================================================================
 * This script runs in the background, separate from your web page.
 * Its primary jobs are to handle offline capabilities and push notifications.
 * It is registered by the main application (the HTML file).
 *
 * How it works for notifications:
 * 1. It listens for a 'message' event from the main application.
 * 2. When it receives a 'SCHEDULE_NOTIFICATION' message, it uses setTimeout
 * to wait for the specified delay. This is crucial because the main
 * app's timers might be paused by the OS, but the Service Worker's
 * setTimeout is more reliable.
 * 3. After the delay, it calls self.registration.showNotification(), which
 * tells the device's operating system to display the notification.
 * The OS handles showing it on the lock screen or as a banner.
 */

// Listen for messages from the main application thread.
self.addEventListener('message', event => {
    // Check if the message is a request to schedule a notification.
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const { delay, title, options } = event.data.payload;

        // Log to the service worker console for debugging.
        // You can view this in Chrome DevTools > Application > Service Workers.
        console.log(`Service Worker: Notification scheduled for "${title}" in ${delay / 1000} seconds.`);

        // Use setTimeout to wait for the specified delay before showing the notification.
        // This timer runs inside the service worker, which is more robust against
        // the browser being backgrounded or the screen being off.
        setTimeout(() => {
            // self.registration.showNotification is the core API call.
            // It triggers a system-level notification that can appear on the lock screen.
            // The 'tag' option is important: it ensures that a new notification
            // will replace an old one with the same tag, preventing clutter.
            self.registration.showNotification(title, options)
                .then(() => {
                    console.log(`Service Worker: Notification shown: "${title}"`);
                })
                .catch(err => {
                    console.error(`Service Worker: Error showing notification: "${title}"`, err);
                });
        }, delay);
    }
});

// A basic install event listener to make the service worker install correctly.
// self.skipWaiting() ensures that the new service worker activates immediately.
self.addEventListener('install', event => {
    console.log('Service Worker: Installed');
    self.skipWaiting();
});

// A basic activate event listener.
// self.clients.claim() allows an active service worker to take control of
// all open clients (tabs) that are in its scope.
self.addEventListener('activate', event => {
    console.log('Service Worker: Activated');
    event.waitUntil(self.clients.claim());
});

// Listen for notification clicks
self.addEventListener('notificationclick', event => {
    // Close the notification
    event.notification.close();

    // Focus the client (the web app) if it's open
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});
