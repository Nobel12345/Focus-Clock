/**
 * =================================================================
 * SERVICE WORKER (service-worker.js)
 * =================================================================
 * This script runs in the background, separate from your web page.
 * Its primary job is to handle push notifications reliably, even when the screen is off.
 *
 * How it works for notifications:
 * 1. It listens for a 'message' event from the main application.
 * 2. When it receives a 'SCHEDULE_NOTIFICATION' message, it uses setTimeout
 * to wait for the specified delay. This is more reliable than a timer
 * on the main page, which can be paused by the OS.
 * 3. After the delay, it calls self.registration.showNotification(), which
 * tells the device's operating system to display the notification.
 * The OS handles showing it on the lock screen or as a banner.
 */

// Listen for messages from the main application thread.
self.addEventListener('message', event => {
    // Check if the message is a request to schedule a notification.
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const { delay, title, options } = event.data.payload;

        console.log(`Service Worker: Notification scheduled for "${title}" in ${delay / 1000} seconds.`);

        // Use setTimeout to wait for the specified delay before showing the notification.
        setTimeout(() => {
            // self.registration.showNotification is the core API call.
            // It triggers a system-level notification that can appear on the lock screen.
            self.registration.showNotification(title, options)
                .then(() => {
                    console.log(`Service Worker: Notification shown: "${title}"`);
                })
                .catch(err => {
                    console.error('Service Worker: Error showing notification:', err);
                });
        }, delay);
    }
});

// A basic install event listener to make the service worker install correctly.
// self.skipWaiting() forces the waiting service worker to become the active service worker.
self.addEventListener('install', event => {
    console.log('Service Worker: Installed');
    self.skipWaiting();
});

// A basic activate event listener.
// self.clients.claim() allows an active service worker to take control of all clients within its scope.
self.addEventListener('activate', event => {
    console.log('Service Worker: Activated');
    event.waitUntil(self.clients.claim());
});
