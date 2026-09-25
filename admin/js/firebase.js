/**
 * Firebase connection module for Ziric Media AI.
 * Config lives in firebase-config.js (env / __ZIRICAI_CONFIG__).
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  enableNetwork,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFirebaseConfig, getFirebaseDatabaseId } from './firebase-config.js';

const firebaseConfig = getFirebaseConfig();

export const app = initializeApp(firebaseConfig);

let dbInstance = null;

/** Lazy Firestore — avoids component registration races on CDN/importmap loads. */
export function getDb() {
  if (!dbInstance) {
    const databaseId = getFirebaseDatabaseId();
    if (databaseId === '(default)') {
      dbInstance = getFirestore(app);
    } else {
      dbInstance = initializeFirestore(app, {}, databaseId);
    }
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

/** Wait for Firebase auth before authenticated API calls (Mission Control). */
export async function ensureAuthReadyForApi() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (user) {
    await user.getIdToken();
  }
}

export { getFirebaseConfig };

/** Same-module re-exports so doc()/collection() accept getDb() on gstatic CDN. */
export {
  doc,
  collection,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
