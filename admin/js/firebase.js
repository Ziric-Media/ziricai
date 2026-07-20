/**
 * Firebase connection module for Ziric Media AI.
 *
 * Paste your Firebase web app configuration below.
 * Firebase console -> Project Settings -> General -> Your apps -> Web app
 */
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  enableNetwork,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Paste your Firebase config object here (from the Firebase console)
const firebaseConfig = {
  apiKey: "AIzaSyDABe2SMR6x81KI7h_N44biSwLVxzx9yH8",
  authDomain: "ziricai.firebaseapp.com",
  projectId: "ziricai",
  storageBucket: "ziricai.firebasestorage.app",
  messagingSenderId: "482382497730",
  appId: "1:482382497730:web:6bc2f8668a1598fa13f85b",
  measurementId: "G-92ZVT0731S"
};

export const app = initializeApp(firebaseConfig);

/** Memory cache avoids IndexedDB persistence leaving the client stuck offline on first read. */
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true,
});
export const auth = getAuth(app);
export const storage = getStorage(app);

async function ensureNetworkOnline() {
  await enableNetwork(db);
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
