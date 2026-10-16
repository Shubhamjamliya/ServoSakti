import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging, requestPermission, registerDeviceForRemoteMessages, getToken, deleteToken, onTokenRefresh, AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { api } from './api';

const messaging = () => getMessaging(getApp());

// Requests permission, fetches this device's FCM token and saves it on the logged-in account.
// Safe to call on every login — the backend dedupes tokens.
export async function registerPushToken(authToken: string): Promise<void> {
  try {
    const status = await requestPermission(messaging());
    if (status !== AuthorizationStatus.AUTHORIZED && status !== AuthorizationStatus.PROVISIONAL) return;
    if (Platform.OS === 'android') await registerDeviceForRemoteMessages(messaging());
    const token = await getToken(messaging());
    if (token) await api('/notifications/fcm-token', { method: 'POST', body: { token }, token: authToken });
  } catch (e) {
    console.warn('Push registration failed:', e); // never block the app on push
  }
}

export async function unregisterPushToken(authToken: string | null): Promise<void> {
  try {
    const token = await getToken(messaging());
    if (token && authToken) await api('/notifications/fcm-token', { method: 'DELETE', body: { token }, token: authToken });
    await deleteToken(messaging());
  } catch {
    // best-effort cleanup on logout
  }
}

// Firebase rotates tokens occasionally; keep the backend's copy in sync while logged in.
export function listenForTokenRefresh(authToken: string): () => void {
  return onTokenRefresh(messaging(), async (token) => {
    try { await api('/notifications/fcm-token', { method: 'POST', body: { token }, token: authToken }); } catch { /* ignore */ }
  });
}
