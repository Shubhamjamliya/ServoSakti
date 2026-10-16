import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { api } from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

const messagingInstance = () => getMessaging(getApps()[0] || initializeApp(firebaseConfig));

/** Asks for permission, gets this browser's FCM token and saves it on the logged-in account. Safe to call repeatedly. */
export async function registerPushToken() {
  try {
    if (!(await isSupported()) || !('serviceWorker' in navigator) || !vapidKey) return null;
    if ((await Notification.requestPermission()) !== 'granted') return null;
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messagingInstance(), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return null;
    await api('/notifications/fcm-token', { method: 'POST', body: { token } });
    return token;
  } catch (e) {
    console.warn('Push registration failed:', e.message);
    return null;
  }
}

/** Messages that arrive while the tab is focused skip the service worker; surface them through the callback. */
export async function onForegroundPush(callback) {
  if (!(await isSupported())) return () => {};
  return onMessage(messagingInstance(), callback);
}
