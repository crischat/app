/* Service worker nhận thông báo khi app đóng hoặc máy đang khoá. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDE21oV0RSw3KMF-lz1rWA4FZ3llEITpqI",
  authDomain: "cris-app-chat.firebaseapp.com",
  projectId: "cris-app-chat",
  storageBucket: "cris-app-chat.firebasestorage.app",
  messagingSenderId: "524052766303",
  appId: "1:524052766303:web:57765373ca6e8d500605ea"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || "Cris App", {
    body: d.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: d.tag || "cris-app",
    renotify: true,
    data: { url: d.url || "./" }
  });
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes("crischat.github.io/app") && "focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
