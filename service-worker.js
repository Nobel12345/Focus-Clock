/**
 * @file service-worker.js
 * @description This service worker handles background tasks, primarily for scheduling and displaying notifications
 * for the Pomodoro timer, ensuring they are delivered even if the app tab is not active or the phone screen is off.
 */

// --- Service Worker Lifecycle Events ---

// This event runs when the service worker is first installed.
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installed');
    // self.skipWaiting() forces the waiting service worker to become the active service worker.
    // This is useful for ensuring updates to the service worker take effect immediately.
    self.skipWaiting();
});

// This event runs when the service worker is activated.
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activated');
    // event.waitUntil() ensures that the service worker will not be terminated until the promise is resolved.
    // self.clients.claim() allows an active service worker to take control of all clients (open tabs)
    // that are in its scope. This is important for the service worker to be able to control the page
    // immediately on activation.
    event.waitUntil(self.clients.claim());
});


// --- Message Handling ---

/**
 * Listens for messages from the main application script.
 * The primary use case is to receive a payload to schedule a future notification.
 */
self.addEventListener('message', (event) => {
    // We only care about messages with the type 'SCHEDULE_NOTIFICATION'.
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const { delay, title, options } = event.data.payload;

        // Use setTimeout to schedule the notification. This works reliably in a service worker
        // for delays up to a few minutes, which is perfect for a Pomodoro timer.
        setTimeout(() => {
            // self.registration.showNotification() is the API to display a system-level notification.
            // It uses the title and options (body text, icon, tag, etc.) passed from the main script.
            // The 'tag' option is useful for overwriting a previous notification with the same tag.
            self.registration.showNotification(title, options)
                .catch(err => console.error('Notification failed:', err));
        }, delay);
    }
});


// --- Notification Click Event ---

/**
 * Handles what happens when a user clicks on a notification.
 */
self.addEventListener('notificationclick', (event) => {
    // Close the notification pop-up.
    event.notification.close();

    // This function attempts to focus an existing tab of the app or open a new one.
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If there's an open tab for the app, focus it.
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            // If no tab is open, open a new one.
            return clients.openWindow('/');
        })
    );
});
