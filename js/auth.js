/**
 * Authentication module for Ziric Media AI.
 *
 * Wraps Firebase Auth with consistent async helpers that return
 * `{ user }` on success or `{ error }` with a user-friendly message on failure.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './firebase.js';

/** Maps Firebase Auth error codes to readable messages for the UI. */
const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use':
    'An account with this email already exists. Try signing in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters long.',
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential':
    'Invalid email or password. Please check your credentials and try again.',
  'auth/too-many-requests':
    'Too many failed attempts. Please wait a moment and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact support for help.',
  'auth/operation-not-allowed':
    'Email/password sign-in is not enabled for this project.',
  'auth/network-request-failed':
    'Network error. Check your connection and try again.',
  'auth/missing-password': 'Please enter your password.',
  'auth/missing-email': 'Please enter your email address.',
};

/**
 * Converts a Firebase Auth error into a user-friendly message.
 * Falls back to the original message or a generic string when the code is unknown.
 *
 * @param {unknown} error
 * @returns {string}
 */
function getAuthErrorMessage(error) {
  const code = error?.code;
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }
  return error?.message || 'Something went wrong. Please try again.';
}

/**
 * Registers a new user with email and password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: import('firebase/auth').User } | { error: string }>}
 */
export async function registerUser(email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return { user: credential.user };
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }
}

/**
 * Signs in an existing user with email and password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: import('firebase/auth').User } | { error: string }>}
 */
export async function loginUser(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { user: credential.user };
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }
}

/**
 * Signs out the currently authenticated user.
 *
 * @returns {Promise<{ success: true } | { error: string }>}
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }
}

/**
 * Subscribes to authentication state changes.
 *
 * @param {(user: import('firebase/auth').User | null) => void} callback
 *   Called immediately and whenever the signed-in user changes.
 * @returns {import('firebase/auth').Unsubscribe} Call to stop listening.
 */
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
