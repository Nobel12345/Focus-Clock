/**
 * FocusFlow Service Worker
 *
 * This worker handles two primary functions:
 * 1. Caching the core application shell for offline access.
 * 2. Scheduling reliable background alarms and sending messages back to the app.
 */

const CACHE_NAME = 'focusflow-cache-v3'; // Increment version to trigger update
// List of essential files for the app to work offline.
const URLS_TO_CACHE = [
  '/', // The main HTML file
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/lucide@latest',
  'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js'
];

// Store scheduled timers in memory. This will be cleared if the worker is terminated.
const scheduledTimers = new Map();

// --- Service Worker Lifecycle ---

// On install, open a cache and add the core app files to it.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        // Use addAll with a catch to prevent installation failure if one resource fails
        return cache.addAll(URLS_TO_CACHE).catch(err => console.warn('SW Cache failed:', err));
      })
      .then(() => self.skipWaiting())
  );
});

// On activate, clean up old caches.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// On fetch, intercept network requests.
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests and chrome extension requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  // For Firebase/Google APIs, always go to the network
  if (event.request.url.includes('firebase') || event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
  );
});


// --- Message Handling (Alarm and Notification Logic) ---
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;

  const { type, payload } = event.data;

  if (type === 'SCHEDULE_ALARM') {
    const { delay, timerId, transitionMessage } = payload;
    
    // If a timer with the same ID already exists, clear it first.
    if (scheduledTimers.has(timerId)) {
        clearTimeout(scheduledTimers.get(timerId));
        scheduledTimers.delete(timerId);
    }

    const timer = setTimeout(() => {
      // Show the notification using the data from the transition message
      const { title, options } = transitionMessage;
      self.registration.showNotification(title, options)
          .catch(err => console.error('Service Worker: Error showing notification:', err));

      // Send a message back to all clients (the main app)
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        clients.forEach(client => {
          // Post the entire transition message object back
          client.postMessage(transitionMessage);
        });
      });
      
      // Clean up the completed timer
      scheduledTimers.delete(timerId);

    }, delay);

    // Store the timer ID so we can cancel it if needed
    scheduledTimers.set(timerId, timer);

  } else if (type === 'CANCEL_ALARM') {
    const { timerId } = payload;
    if (scheduledTimers.has(timerId)) {
        clearTimeout(scheduledTimers.get(timerId));
        scheduledTimers.delete(timerId);
        console.log(`Service Worker: Canceled alarm with ID: ${timerId}`);
    }
  }
});
```

**Step 2: Update Your File**

1.  In your project folder, find the file named `service-worker.js`.
2.  Open the file and **delete all of its contents**.
3.  Copy the entire code block from the document above.
4.  Paste the new code into the now-empty `service-worker.js` file and save it.

**Step 3: Hard Refresh Your Browser**

This is the most important step. Your browser will often hold on to the old service worker. To force it to update:

* **On Windows/Linux:** Press `Ctrl + Shift + R`
* **On Mac:** Press `Cmd + Shift + R`

After the hard refresh, the new service worker will be installed, and your Pomodoro timer should correctly transition from a focus session to the next break session automatical
