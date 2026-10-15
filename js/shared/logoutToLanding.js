/**
 * Sign out from app/admin and return to the public marketing site.
 */
import { logoutUser } from '../auth.js';
import { getSiteUrls, marketingUrl, marketingLoginUrl } from './siteUrls.js';

/** Works with legacy siteUrls.js (pre–publicWeb exports). */
function publicLoginUrl() {
  return marketingLoginUrl();
}

const LOGOUT_FLAG = 'ziricai:logout-redirect';

export function isLocalAuthDevHost() {
  if (typeof location === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

/** Netlify Deploy Preview / branch deploy — keep auth on this origin (staging Firebase in __ZIRICAI_CONFIG__). */
export function isNetlifyDeployPreviewHost() {
  if (typeof location === 'undefined') return false;
  return /\.netlify\.app$/i.test(location.hostname);
}

/** Production: send signed-out / never-signed-in visitors to marketing login or home after logout. */
export function handleSignedOutVisitor() {
  if (isLocalAuthDevHost()) return false;
  if (isNetlifyDeployPreviewHost()) return false;

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
