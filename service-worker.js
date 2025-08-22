// service-worker.js

// Cache-first strategy for assets (optional, but good for offline support)
const CACHE_NAME = 'focusflow-cache-v1';
const urlsToCache = [
  // List essential app files here for offline access
  // './', // The root HTML file
  // './index.html', // Or index.html if that's your main file
  // 'https://cdn.tailwindcss.com',
  // 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  // etc.
  // For this fix, caching isn't strictly necessary, but it's good practice.
];

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting(); // Force the new service worker to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.warn('[Service Worker] Cache addAll failed:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(self.clients.claim()); // Take control of clients immediately
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// A simple in-memory store for alarms.
// In a real production app requiring persistence across SW restarts,
// you might use IndexedDB or similar for alarm scheduling.
const scheduledAlarms = {};

self.addEventListener('message', (event) => {
  if (event.data && event.data.type) {
    console.log('[Service Worker] Message received:', event.data.type, event.data.payload);

    switch (event.data.type) {
      case 'SCHEDULE_ALARM':
        {
          const { delay, timerId, transitionMessage } = event.data.payload;
          if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId].timeoutId);
          }

          // Schedule a timeout that will trigger the notification and message
          const timeoutId = setTimeout(async () => {
            console.log(`[Service Worker] Alarm for ${timerId} triggered.`);
            delete scheduledAlarms[timerId]; // Clear the alarm as it's triggered

            // Show a notification
            if (transitionMessage.title) {
              self.registration.showNotification(transitionMessage.title, {
                body: transitionMessage.options.body || '',
                icon: transitionMessage.options.icon || 'favicon.ico', // Ensure you have a favicon
                badge: transitionMessage.options.badge || 'favicon.ico',
                tag: transitionMessage.options.tag || 'pomodoro-notification', // Group notifications
                data: transitionMessage, // Store the transition message for click handling
                renotify: true, // Allow a new notification with the same tag to vibrate/sound
              });
            }

            // Also try to send a message back to the client if it's active
            const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
            let clientFound = false;
            for (const client of clients) {
              if (client.visibilityState === 'visible' || client.focused) {
                console.log(`[Service Worker] Sending message to visible client: ${client.id}`);
                client.postMessage(transitionMessage);
                clientFound = true;
                break; // Send to the first visible/focused client
              }
            }

            if (!clientFound) {
              console.log('[Service Worker] No active client found to message directly. Notification sent.');
            }

          }, delay);

          scheduledAlarms[timerId] = { timeoutId, transitionMessage };
          console.log(`[Service Worker] Scheduled alarm: ${timerId} for ${delay / 1000} seconds.`);
        }
        break;

      case 'CANCEL_ALARM':
        {
          const { timerId } = event.data.payload;
          if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId].timeoutId);
            delete scheduledAlarms[timerId];
            console.log(`[Service Worker] Cancelled alarm: ${timerId}`);
          }
        }
        break;

      case 'SCHEDULE_NOTIFICATION':
        {
          const { delay, title, options } = event.data.payload;
          // This is a direct notification, not an alarm to trigger a phase transition
          setTimeout(() => {
            self.registration.showNotification(title, options);
          }, delay);
        }
        break;

      default:
        console.warn('[Service Worker] Unknown message type:', event.data.type);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const clickedNotificationData = event.notification.data; // This is our transitionMessage

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      let clientToFocus = null;
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && ('focus' in client)) {
          // If a client is already open, focus it
          clientToFocus = client;
          break;
        }
      }

      if (clientToFocus) {
        console.log('[Service Worker] Focusing existing client and sending message.');
        clientToFocus.focus();
        // Send the transition message to the focused client
        clientToFocus.postMessage(clickedNotificationData);
      } else {
        // If no client is open, open a new one
        console.log('[Service Worker] Opening new client and sending message.');
        self.clients.openWindow(self.location.origin).then((newClient) => {
          // It might take a moment for the new client to fully load and register its listener
          // A more robust solution might involve storing the message in IndexedDB
          // and the new client retrieving it on load. For now, a small delay.
          setTimeout(() => {
            if (newClient) newClient.postMessage(clickedNotificationData);
          }, 2000);
        });
      }
    })
  );
});
