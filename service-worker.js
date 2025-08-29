// --- Service Worker for FocusFlow ---

// Import the Firebase SDKs (using the compat versions for service workers)
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

// --- IMPORTANT ---
// Initialize Firebase with the same config from your main app
const firebaseConfig = {
    apiKey: "AIzaSyBSCrL6ravOzFnwOa7A0Jl_W68vEfZVcNw",
    authDomain: "focus-flow-34c07.firebaseapp.com",
    projectId: "focus-flow-34c07",
    storageBucket: "focus-flow-34c07.appspot.com",
    messagingSenderId: "473980178825",
    appId: "1:473980178825:web:164566ec8b068da3281158"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// This object will store the setTimeout IDs for our local Pomodoro alarms
const scheduledAlarms = {};

/**
 * Handles background push notifications sent from a server via FCM.
 */
messaging.onBackgroundMessage((payload) => {
    console.log("[service-worker.js] Received background FCM message: ", payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/favicon.ico',
        tag: 'fcm-notification'
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Listens for messages from the main application to schedule or cancel local alarms.
 * This is how the Pomodoro timer works in the background.
 */
self.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    if (type === 'SCHEDULE_ALARM') {
        const { delay, title, options, timerId, transitionMessage } = payload;
        
        // If an alarm with the same ID already exists, cancel it first to prevent duplicates
        if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId]);
        }

        // Schedule the new notification to appear after the specified delay
        const alarmId = setTimeout(() => {
            console.log(`[service-worker.js] Firing alarm: ${title}`);
            self.registration.showNotification(title, {
                ...options,
                icon: 'favicon.ico',
                actions: [ // Add buttons to the notification
                    { action: 'start-next', title: 'Start Next Session' },
                    { action: 'stop', title: 'Stop Timer' }
                ],
                data: { // Pass data to the notificationclick event
                    transitionMessage: transitionMessage
                }
            }).then(() => {
                delete scheduledAlarms[timerId];
            });
        }, delay);
        
        // Store the timeout ID so we can cancel it if the user stops the timer manually
        scheduledAlarms[timerId] = alarmId;
        console.log(`[service-worker.js] Scheduled alarm '${timerId}' in ${delay}ms`);

    } else if (type === 'CANCEL_ALARM') {
        const { timerId } = payload;
        if (scheduledAlarms[timerId]) {
            clearTimeout(scheduledAlarms[timerId]);
            delete scheduledAlarms[timerId];
            console.log(`[service-worker.js] Canceled alarm: ${timerId}`);
        }
    } else if (type === 'SKIP_WAITING') {
        // This allows a new version of the service worker to take over immediately
        self.skipWaiting();
    }
});

/**
 * Handles clicks on notifications.
 */
self.addEventListener('notificationclick', (event) => {
    // Close the notification once it's clicked
    event.notification.close();

    const transitionMessage = event.notification.data.transitionMessage;
    const action = event.action; // e.g., 'start-next', 'stop'

    // This ensures that when a user clicks the notification, it focuses on the app's existing tab
    // or opens a new one if it's not already open.
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                // Check for an open client and focus it
                if (new URL(client.url).pathname === '/' && 'focus' in client) {
                    client.focus();
                    // Send a message to the client to update its state based on the action
                    client.postMessage({
                        type: 'NOTIFICATION_ACTION_TRIGGERED',
                        action: action || 'start-next', // Default to start-next if body is clicked
                        newState: transitionMessage.newState,
                        oldState: transitionMessage.oldState
                    });
                    return;
                }
            }
            // If no client is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
