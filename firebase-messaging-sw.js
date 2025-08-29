// Import and initialize the Firebase SDK
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBSCrL6ravOzFnwOa7A0Jl_W68vEfZVcNw",
    authDomain: "focus-flow-34c07.firebaseapp.com",
    projectId: "focus-flow-34c07",
    storageBucket: "focus-flow-34c07.appspot.com",
    messagingSenderId: "473980178825",
    appId: "1:473980178825:web:164566ec8b068da3281158",
    measurementId: "G-RRFK3LY0E4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    '[firebase-messaging-sw.js] Received background message ',
    payload,
  );

  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico', // Make sure you have this icon at your root
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
