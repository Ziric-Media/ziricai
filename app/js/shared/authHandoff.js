/**
 * Cross-origin sign-in: marketing site exchanges ID token for a custom token,
 * app/admin consume ?authHandoff= on load.
 */
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase.js';

const HANDOFF_PARAM = 'authHandoff';

const DEFAULT_API_URL = 'https://ziricai-production.up.railway.app';

/** Handoff always hits Railway — marketing Netlify may not proxy /api on apex domain. */
function getHandoffApiBase() {
  const cfg = typeof window !== 'undefined' ? window.__ZIRICAI_CONFIG__ : null;
  if (cfg?.apiBase) return String(cfg.apiBase).replace(/\/$/, '');
  const fromSites = cfg?.sites?.api;
  if (fromSites) return String(fromSites).replace(/\/$/, '');
  const host = typeof location !== 'undefined' ? location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') return '';
  return DEFAULT_API_URL;
}

export function targetNeedsAuthHandoff(targetUrl) {
  try {
    const target = new URL(targetUrl, location.href);
    return target.origin !== location.origin;
  } catch {
    return true;
  }
}

/**
 * @param {string} idToken
 * @returns {Promise<string|null>}
 */
export async function fetchAuthHandoffToken(idToken) {
  const base = getHandoffApiBase();
  const res = await fetch(`${base}/api/auth/handoff`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.error || `Handoff failed (${res.status})`;
    const err = new Error(msg);
    err.code = data?.code || 'HANDOFF_FAILED';
    throw err;
  }
  const data = await res.json();
  return data?.customToken || null;
}

/**
 * @param {string} targetUrl
 * @param {string} customToken
 */
export function buildHandoffRedirectUrl(targetUrl, customToken) {
  const url = new URL(targetUrl, location.href);
  url.searchParams.set(HANDOFF_PARAM, customToken);
  return url.toString();
}

/** Strip handoff param from the address bar after successful exchange. */
function stripHandoffFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has(HANDOFF_PARAM)) return;
  url.searchParams.delete(HANDOFF_PARAM);
  const qs = url.searchParams.toString();
  history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : '') + url.hash);
}

/**
 * Call before auth guards on app/admin hosts.
 * @returns {Promise<boolean>} true when a handoff sign-in was performed
 */
export async function consumeAuthHandoffFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get(HANDOFF_PARAM);
  if (!token) return false;

  try {
    await signInWithCustomToken(auth, token);
    stripHandoffFromUrl();
    return true;
  } catch (err) {
    console.warn('[authHandoff] consume failed:', err?.message || err);
    stripHandoffFromUrl();
    return false;
  }
}
