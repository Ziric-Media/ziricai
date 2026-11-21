/**
 * Phase 2.2 — Firebase Cloud Messaging token (web). Falls back when VAPID / messaging unavailable.
 */
import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

function cfg() {
  return window.__ZIRICAI_CONFIG__ || {};
}

function firebaseConfig() {
  const fb = cfg().firebase;
  if (!fb?.apiKey || String(fb.apiKey).includes('your_firebase')) return null;
  return fb;
}

/**
 * @param {import('firebase/app').FirebaseApp} [existingApp]
 * @returns {Promise<string|null>}
 */
export async function obtainFcmWebToken(existingApp) {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;
  if (!('serviceWorker' in navigator)) return null;
  let supported = false;
  try {
    supported = await isSupported();
  } catch {
    return null;
  }
  if (!supported) return null;
  const fb = firebaseConfig();
  const vapidKey = String(fb?.vapidKey || cfg().vapidKey || '').trim();
  if (!vapidKey) return null;
  const app = existingApp || getApps()[0] || initializeApp(fb);
  try {
    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    return token ? String(token).trim() : null;
  } catch (err) {
    console.warn('[Sarah FCM] token unavailable', err?.message || err);
    return null;
  }
}
