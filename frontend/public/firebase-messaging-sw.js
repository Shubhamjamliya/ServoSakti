// Firebase web config values are public client-side identifiers (not secrets). A service worker can't read
// Vite's import.meta.env, so they are inlined here — keep in sync with frontend/.env.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB_rHFZjQ9aBeJ7rHjjn75V-QxR-owy_qs',
  authDomain: 'servoshakti-ada8d.firebaseapp.com',
  projectId: 'servoshakti-ada8d',
  storageBucket: 'servoshakti-ada8d.firebasestorage.app',
  messagingSenderId: '433034165050',
  appId: '1:433034165050:web:f128a3525a154ba1c0ae03',
});

const messaging = firebase.messaging();

// FCM shows `notification` payloads itself when the page is in the background; this covers data-only messages.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const { title, body } = payload.data || {};
  if (title) self.registration.showNotification(title, { body, icon: '/favicon.svg', data: { link: (payload.data || {}).link } });
});

// The backend puts the target screen in data.link (e.g. /engineer/jobs); fall back to the app root.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const link = data.link || data.FCM_MSG?.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) { open.navigate?.(link); return open.focus(); }
      return clients.openWindow(link);
    })
  );
});
