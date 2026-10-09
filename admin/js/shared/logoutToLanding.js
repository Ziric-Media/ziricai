/**
 * Sign out from app/admin and return to the public marketing site.
 */
import { logoutUser } from '../auth.js';
import { getSiteUrls, marketingUrl } from './siteUrls.js';

/** Works with legacy siteUrls.js (pre–publicWeb exports). */
function publicLoginUrl() {
  const base = getSiteUrls().marketing.replace(/\/$/, '');
  return `${base}/login.html`;
}

const LOGOUT_FLAG = 'ziricai:logout-redirect';

export function isLocalAuthDevHost() {
  if (typeof location === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

/** Production: send signed-out / never-signed-in visitors to marketing login or home after logout. */
export function handleSignedOutVisitor() {
  if (isLocalAuthDevHost()) return false;

  try {
    if (sessionStorage.getItem(LOGOUT_FLAG)) {
      sessionStorage.removeItem(LOGOUT_FLAG);
      window.location.replace(marketingUrl());
      return true;
    }
  } catch {
    /* sessionStorage blocked */
  }

  window.location.replace(publicLoginUrl());
  return true;
}

export async function logoutAndReturnToLanding() {
  try {
    sessionStorage.setItem(LOGOUT_FLAG, '1');
  } catch {
    /* ignore */
  }
  await logoutUser();
  window.location.assign(marketingUrl());
}
