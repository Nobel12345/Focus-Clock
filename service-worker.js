// service-worker.js

// Import Firebase scripts
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

// --- IMPORTANT: Firebase Initialization ---
// This configuration MUST match the one in your index.html file.
const firebaseConfig = {
    apiKey: "AIzaSyBSCrL6ravOzFnwOa7A0Jl_W68vEfZVcNw",
    authDomain: "focus-flow-34c07.firebaseapp.com",
    projectId: "focus-flow-34c07",
    storageBucket: "focus-flow-34c07.appspot.com",
    messagingSenderId: "473980178825",
    appId: "1:473980178825:web:164566ec8b068da3281158",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// --- PWA Caching Logic ---
const CACHE_NAME = 'focusflow-cache-v4'; // Increment cache version to force update
const OFFLINE_URL = './offline.html';

// Note: Ensure all critical paths are included here.
const urlsToCache = [
    './',
    './index.html',
    './offline.html',
    './manifest.json',
    './pomodoro-worker.js', // Make sure this file exists
    './favicon.ico'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('[Service Worker] Caching app shell');
            return cache.addAll(urlsToCache);
        })
        .then(() => self.skipWaiting()) // Activate new worker immediately
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activate event');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(OFFLINE_URL))
        );
    } else {
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request);
            })
        );
    }
});


// --- Local Alarm and Notification Logic ---

// This object will hold the setTimeout IDs for our alarms
let scheduledAlarms = {};

self.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    if (type === 'SCHEDULE_ALARM') {
        const { delay, title, options, timerId, transitionMessage } = payload;

        // If an alarm with the same ID already exists, cancel it first.
        if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId]);
        }
        
        console.log(`[Service Worker] Scheduling local alarm '${timerId}' in ${delay / 1000}s`);

        // Schedule the new alarm
        scheduledAlarms[timerId] = setTimeout(() => {
            console.log(`[Service Worker] Alarm '${timerId}' fired.`);
            
            // Show the notification
            self.registration.showNotification(title, options)
                .catch(err => console.error('[Service Worker] Error showing notification:', err));

            // Send a message back to the app to trigger the next phase
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                clients.forEach(client => {
                    client.postMessage(transitionMessage);
                });
            });

            // Clean up the completed alarm
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

// This handles notifications sent FROM a server (not used by the Pomodoro timer, but good to have)
messaging.onBackgroundMessage((payload) => {
    console.log('[Service Worker] Received background push message.', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/Focus-Clock/favicon.ico', // Ensure this path is correct
        data: payload.data // Pass along any data from the server
    };
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// This handles what happens when ANY notification is clicked (local or push)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    console.log('[Service Worker] Notification click received.', event.notification);

    // This focuses on an existing window or opens a new one
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                // Check if a client is already open and focus it
                if (client.url === '/Focus-Clock/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no client is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow('/Focus-Clock/');
            }
        })
    );
});

