/**
 * FocusFlow Service Worker
 *
 * This worker handles background tasks, primarily scheduling reliable notifications
 * that can fire even when the device's screen is off or the app is in the background.
 */

// --- Service Worker Lifecycle ---

// On install, activate the new service worker immediately.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // skipWaiting() forces the waiting service worker to become the active service worker.
  self.skipWaiting();
});

// On activate, take control of all open clients (tabs) immediately.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  // clients.claim() allows an active service worker to set itself as the
  // controller for all clients within its scope.
  event.waitUntil(self.clients.claim());
});


// --- Message Handling ---

// This is the core of our notification logic.
// It listens for messages from the main application.
self.addEventListener('message', (event) => {
  // We only care about messages with the type 'SCHEDULE_NOTIFICATION'.
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { delay, title, options } = event.data.payload;
    console.log(`Service Worker: Received request to schedule notification in ${delay}ms.`);
    console.log(`Title: ${title}`, options);

    // Use setTimeout to schedule the notification. The browser gives the
    // service worker a short window to perform tasks like this when it
    // receives a message, making this reliable.
    setTimeout(() => {
      // self.registration.showNotification is the powerful API that talks
      // to the device's OS to show a system-level notification.
      self.registration.showNotification(title, options)
        .then(() => console.log('Service Worker: Notification shown.'))
        .catch(err => console.error('Service Worker: Error showing notification:', err));
    }, delay);
  }
});
