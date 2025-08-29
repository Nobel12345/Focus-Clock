// --- 1. Import Firebase Scripts ---
// This brings in the Firebase core and messaging libraries.
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

// --- 2. Initialize Firebase ---
// IMPORTANT: This configuration MUST match the one in your main web app.
const firebaseConfig = {
    apiKey: "AIzaSyBSCrL6ravOzFnwOa7A0Jl_W68vEfZVcNw",
    authDomain: "focus-flow-34c07.firebaseapp.com",
    projectId: "focus-flow-3C07",
    storageBucket: "focus-flow-34c07.appspot.com",
    messagingSenderId: "473980178825",
    appId: "1:473980178825:web:164566ec8b068da3281158",
    measurementId: "G-RRFK3LY0E4"
};

// Initialize the Firebase app in the service worker
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

// --- 3. Handle Background Push Notifications ---
messaging.onBackgroundMessage((payload) => {
    console.log('[service-worker.js] Received background message ', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/Focus-Clock/favicon.ico',
        tag: 'pomodoro-timer',
        renotify: true,
        actions: [
            { action: 'start-next', title: 'Start Next Session' },
            { action: 'stop', title: 'Stop Timer' }
        ],
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- 4. Handle Notification Clicks ---
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.', event.notification);
    event.notification.close();

    const notificationData = event.notification.data;
    const action = event.action;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            const client = clientList.find(c => c.url.includes('index.html')) || clientList[0];
            if (client) {
                client.focus();
                client.postMessage({
                    type: 'NOTIFICATION_ACTION_TRIGGERED',
                    action: action || 'default_click',
                    newState: notificationData.newState,
                    oldState: notificationData.oldState
                });
            } else {
                clients.openWindow('/');
            }
        })
    );
});

// --- 5. PWA Caching Logic ---
const CACHE_NAME = 'focusflow-cache-v1';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

