/**
 * Firebase connection module for Ziric Media AI.
 * Config lives in firebase-config.js (env / __ZIRICAI_CONFIG__).
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, enableNetwork } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirebaseConfig } from './firebase-config.js';

const firebaseConfig = getFirebaseConfig();

export const app = initializeApp(firebaseConfig);

let dbInstance = null;

/** Lazy Firestore — avoids "Component firestore has not been registered yet" on CDN/importmap loads. */
export function getDb() {
  if (!dbInstance) {
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

/** Backward-compatible lazy proxy so auth-only pages do not touch Firestore at import time. */
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const instance = getDb();
      const value = instance[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  }
);

export const auth = getAuth(app);
export const storage = getStorage(app);

async function ensureNetworkOnline() {
  await enableNetwork(getDb());
}

/** Wait for auth token + Firestore network before profile reads. */
export async function ensureFirestoreReady() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (user) {
    await user.getIdToken(true);
  }
  await ensureNetworkOnline();
}

export { getFirebaseConfig };
