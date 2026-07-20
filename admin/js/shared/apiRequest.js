/** Shared fetch wrapper for portal + admin API clients. */



import { auth } from '../firebase.js';



const API_BASE =
  typeof window !== 'undefined' && window.__ZIRICAI_CONFIG__?.apiBase !== undefined
    ? window.__ZIRICAI_CONFIG__.apiBase
    : '';



/** @type {((message: string, type?: string) => void) | null} */

let toastHandler = null;



/**

 * Register a toast callback (portal/admin ui showToast).

 * @param {(message: string, type?: string) => void} fn

 */

export function registerApiErrorToast(fn) {

  toastHandler = fn;

}



/**

 * Attach Firebase ID token when user is signed in.

 * @param {RequestInit} options

 */

async function withAuthHeaders(options = {}) {

  const headers = { ...(options.headers || {}) };

  const user = auth.currentUser;

  if (user) {

    try {

      const token = await user.getIdToken();

      if (token) headers.Authorization = `Bearer ${token}`;

    } catch (err) {

      console.warn('[apiRequest] Failed to get ID token:', err.message);

    }

  }

  return { ...options, headers };

}



/**

 * @param {string} path

 * @param {RequestInit & { silent?: boolean }} options

 */

export async function apiRequest(path, options = {}) {

  const { silent = false, ...fetchOptions } = options;

  try {

    const finalOptions = await withAuthHeaders(fetchOptions);

    const res = await fetch(`${API_BASE}${path}`, finalOptions);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {

      const error = data.error || `Request failed (${res.status})`;

      if (!silent && toastHandler && res.status >= 500) {

        toastHandler(error, 'error');

      }

      return { error, code: data.code, status: res.status };

    }

    return { data };

  } catch (error) {

    const message = error.message || 'Network error';

    if (!silent && toastHandler) toastHandler(message, 'error');

    return { error: message };

  }

}



/** Exposed for onboarding and other modules that use raw fetch. */

export { withAuthHeaders };

