// service-worker.js

// Import Firebase scripts for background functionality
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

// --- IMPORTANT: Firebase Initialization ---
// This configuration must match the one in your index.html file.
const firebaseConfig = {
    apiKey: "AIzaSyBSCrL6ravOzFnwOa7A0Jl_W68vEfZVcNw",
    authDomain: "focus-flow-34c07.firebaseapp.com",
    projectId: "focus-flow-34c07",
    storageBucket: "focus-flow-34c07.appspot.com",
    messagingSenderId: "473980178825",
    appId: "1:473980178825:web:164566ec8b068da3281158",
};

// Initialize Firebase in the service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// --- PWA Caching Logic ---
const CACHE_NAME = 'focusflow-cache-v5'; // Increment version to trigger update
const OFFLINE_URL = './offline.html';

// Critical assets for the app shell
const urlsToCache = [
    './',
    './index.html',
    './offline.html',
    './manifest.json',
    './pomodoro-worker.js',
    './favicon.ico'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('[Service Worker] Caching app shell assets.');
            return cache.addAll(urlsToCache);
        })
        .then(() => self.skipWaiting()) // Force the new worker to activate immediately
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activate event');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                // Delete all old caches that don't match the current version
                cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim()) // Take control of the page immediately
    );
});

self.addEventListener('fetch', (event) => {
    // Standard cache-first strategy
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => {
            // If both fail (e.g., offline), return the offline page for navigation requests
            if (event.request.mode === 'navigate') {
                return caches.match(OFFLINE_URL);
            }
        })
    );
});


// --- Local Alarm and Notification Logic (The Core Fix) ---

let scheduledAlarms = {}; // Holds the setTimeout IDs for our alarms

self.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    if (type === 'SCHEDULE_ALARM') {
        const { delay, title, options, timerId, transitionMessage } = payload;

        // Cancel any existing alarm with the same ID to prevent duplicates
        if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId]);
        }
        
        console.log(`[Service Worker] Scheduling local notification '${timerId}' in ${delay / 1000}s`);

        // Schedule the new alarm using setTimeout
        scheduledAlarms[timerId] = setTimeout(() => {
            console.log(`[Service Worker] Firing notification for '${timerId}'.`);
            
            // Show the notification to the user
            self.registration.showNotification(title, options)
                .catch(err => console.error('[Service Worker] Error showing notification:', err));

            // Send a message back to the main app to trigger the next Pomodoro phase
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                clients.forEach(client => {
                    client.postMessage(transitionMessage);
                });
            });

            // Clean up the completed alarm from our tracking object
            delete scheduledAlarms[timerId];
        }, delay);

    } else if (type === 'CANCEL_ALARM') {
        const { timerId } = payload;
        if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId]);
            delete scheduledAlarms[timerId];
            console.log(`[Service Worker] Canceled local alarm '${timerId}'.`);
        }
    }
});

// --- Firebase Push Notification Handlers ---

// This handles background push notifications sent from a server
messaging.onBackgroundMessage((payload) => {
    console.log('[Service Worker] Received background push message from server.', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/Focus-Clock/favicon.ico', // Ensure this path is correct for your GitHub Pages setup
    };
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// This handles what happens when a user clicks ANY notification (local or push)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    console.log('[Service Worker] Notification click received.');

    // This logic finds an open app window and focuses it, or opens a new one.
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Try to find an already-open window to focus
            for (const client of clientList) {
                if (client.url.includes('/Focus-Clock/') && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow('/Focus-Clock/');
            }
        })
    );
});

