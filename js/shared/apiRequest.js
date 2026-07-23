/** Shared fetch wrapper for portal + admin API clients. */



import { auth } from '../firebase.js';

/** Resolve API origin: injected config, same-origin Netlify proxy, or production default. */
const PRODUCTION_API_URL = 'https://ziricai-production.up.railway.app';

export function resolveApiBase() {
  if (typeof window === 'undefined') return PRODUCTION_API_URL;

  const cfg = window.__ZIRICAI_CONFIG__;
  if (cfg?.apiBase !== undefined && cfg.apiBase !== null) {
    return cfg.apiBase;
  }
  if (cfg?.sites?.api) {
    return cfg.sites.api;
  }

  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return '';
  }
  // Static Netlify sites proxy /api/* — same-origin avoids CORS when apiBase is unset.
  if (/\.ziricai\.com$/i.test(host) && host !== 'api.ziricai.com') {
    return '';
  }

  return PRODUCTION_API_URL;
}

const API_BASE = typeof window !== 'undefined' ? resolveApiBase() : PRODUCTION_API_URL;


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
export { withAuthHeaders, resolveApiBase as getApiBase };

