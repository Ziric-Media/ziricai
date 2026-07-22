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
import {
  getUserProfile,
  updateLastLogin,
  createUserProfile,
  createTenantMembership,
} from './users.js';

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
  'auth/unauthorized-domain':
    'This domain is not authorized for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.',
  'auth/missing-password': 'Please enter your password.',
  'auth/missing-email': 'Please enter your email address.',
};

let cachedEnforcement = null;

/** API base for auth helpers — prefers same-origin /api proxy on Netlify static sites. */
const PRODUCTION_API_URL = 'https://ziricai-production.up.railway.app';

function getApiBase() {
  if (typeof window === 'undefined') return PRODUCTION_API_URL;
  const cfg = window.__ZIRICAI_CONFIG__;
  if (cfg?.apiBase !== undefined && cfg.apiBase !== null) return cfg.apiBase;
  if (cfg?.sites?.api) return cfg.sites.api;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return '';
  if (/\.ziricai\.com$/i.test(host) && host !== 'api.ziricai.com') return '';
  return PRODUCTION_API_URL;
}

/**
 * Converts a Firebase Auth error into a user-friendly message.
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

/** Normalizes role strings ("Super Admin", "super-admin") to `superadmin`. */
export function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/** @param {string | undefined | null} role */
export function isSuperAdminRole(role) {
  return normalizeRole(role) === 'superadmin';
}

/** @param {string | undefined | null} status */
export function isActiveStatus(status) {
  return String(status || '').toLowerCase().trim() === 'active';
}

/**
 * Whether tenant scope enforcement is lax (demo fallback allowed).
 * Cached from /api/admin/config on first call.
 */
export async function isLaxTenantMode() {
  if (cachedEnforcement !== null) {
    return cachedEnforcement === 'lax';
  }
  try {
    const res = await fetch(`${getApiBase()}/api/admin/config`);
    const data = await res.json().catch(() => ({}));
    cachedEnforcement = (data.tenantScopeEnforcement || 'lax').toLowerCase();
  } catch {
    cachedEnforcement = 'lax';
  }
  return cachedEnforcement === 'lax';
}

/**
 * Load Firestore profile for signed-in user; optional demo fallback in lax mode.
 * @param {import('firebase/auth').User} user
 * @param {{ demoFallback?: (user: import('firebase/auth').User) => object|null, allowDemo?: boolean }} [options]
 */
export async function resolveAuthProfile(user, options = {}) {
  if (!user?.uid) return null;

  const result = await getUserProfile(user.uid);
  if (result.profile) {
    const profile = {
      ...result.profile,
      companyId: result.profile.companyId || result.profile.company || null,
      isDemo: false,
    };
    updateLastLogin(user.uid).catch(() => {});
    return profile;
  }

  const allowDemo = options.allowDemo !== false && (await isLaxTenantMode());
  if (allowDemo && typeof options.demoFallback === 'function') {
    return options.demoFallback(user);
  }

  if (result.error && !allowDemo) {
    console.warn('[auth] Profile load failed:', result.error);
  }

  return null;
}

/**
 * Registers a new user with email and password.
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
 * Unified signup — Firebase user + users/{uid} + optional tenant membership.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.fullName]
 * @param {string} [params.role]
 * @param {string} [params.companyId]
 * @param {string} [params.companyName]
 * @param {string} [params.status]
 */
export async function registerUserWithProfile({
  email,
  password,
  fullName = '',
  role = 'owner',
  companyId = null,
  companyName = '',
  status = 'active',
}) {
  const authResult = await registerUser(email, password);
  if (authResult.error) return authResult;

  const uid = authResult.user.uid;
  const profilePayload = {
    fullName,
    email,
    role,
    company: companyName || companyId || '',
    companyId: companyId || null,
    status,
  };

  const profileResult = await createUserProfile(uid, profilePayload);
  if (profileResult.error) {
    return { user: authResult.user, profile: null, profileError: profileResult.error };
  }

  let membership = null;
  if (companyId) {
    const memberResult = await createTenantMembership(uid, companyId, {
      email,
      fullName,
      role,
      status,
    });
    if (memberResult.error) {
      return {
        user: authResult.user,
        profile: profileResult.profile,
        membershipError: memberResult.error,
      };
    }
    membership = memberResult.membership;
  }

  return { user: authResult.user, profile: profileResult.profile, membership };
}

/**
 * Signs in an existing user with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: import('firebase/auth').User, profile?: object } | { error: string }>}
 */
export async function loginUser(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await resolveAuthProfile(credential.user, { allowDemo: false });
    return { user: credential.user, profile: profile || undefined };
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }
}

/**
 * Signs out the currently authenticated user.
 * @returns {Promise<{ success: true } | { error: string }>}
 */
export async function logoutUser() {
  try {
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* server session hook is best-effort */
      }
    }
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }
}

/**
 * Subscribes to authentication state changes.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current Firebase ID token for API calls.
 * @returns {Promise<string|null>}
 */
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
