// firebase-messaging-sw.js

// Import Firebase scripts
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

// ✅ Replace with your Firebase project config
firebase.initializeApp({
  apiKey: "AIzaSyBSCrL6ravOzFnwOa7A0Jl_W68vEfZVcNw",
                    authDomain: "focus-flow-34c07.firebaseapp.com",
                    projectId: "focus-flow-34c07",
                    storageBucket: "focus-flow-34c07.appspot.com",
                    messagingSenderId: "473980178825",
                    appId: "1:473980178825:web:164566ec8b068da3281158",
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Received background message:", payload);

  const notificationTitle = payload.notification.title || "FocusFlow Timer";
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || "/Focus-Clock/favicon.ico",
    data: {
      click_action: payload.notification.click_action || "https://nobel12345.github.io/Focus-Clock/",
      newState: payload.data?.newState || "",
      oldState: payload.data?.oldState || "",
    },
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  console.log("[firebase-messaging-sw.js] Notification click received:", event);

  event.notification.close();

  // Open or focus the target page
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const urlToOpen = event.notification.data.click_action;

      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
