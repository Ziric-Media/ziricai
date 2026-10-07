/**
 * Cross-site URL helpers for multi-site Netlify deployment.
 * Override via window.__ZIRICAI_CONFIG__.sites or env at build time.
 */

function isLocalHost() {
  if (typeof location === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

const LOCAL = isLocalHost();

const PRODUCTION_API_URL = 'https://ziricai-production.up.railway.app';

const DEFAULT_SITES = LOCAL
  ? {
      marketing: 'http://localhost:3000',
      publicWeb: 'http://localhost:3000',
      app: 'http://localhost:3000/app',
      admin: 'http://localhost:3000/admin',
      api: '',
    }
  : {
      marketing: 'https://marketing.ziricai.com',
      publicWeb: 'https://ziricai.com',
      app: 'https://app.ziricai.com',
      admin: 'https://admin.ziricai.com',
      api: PRODUCTION_API_URL,
    };

/** @returns {{ marketing: string, app: string, admin: string, api: string }} */
export function getSiteUrls() {
  const overrides = typeof window !== 'undefined' ? window.__ZIRICAI_CONFIG__?.sites : {};
  return { ...DEFAULT_SITES, ...overrides };
}

/** Portal deep link for a company workspace. */
export function portalUrl(companyId) {
  const base = getSiteUrls().app.replace(/\/$/, '');
  const q = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return `${base}/${q}`;
}

/** Admin console URL. */
export function adminUrl(path = '') {
  const base = getSiteUrls().admin.replace(/\/$/, '');
  return path ? `${base}/${path.replace(/^\//, '')}` : `${base}/`;
}

function publicWebBase() {
  const sites = getSiteUrls();
  const base = sites.publicWeb || sites.marketing;
  return String(base).replace(/\/$/, '');
}

/** Public marketing homepage (ziricai.com) with optional hash. */
export function landingHomeUrl(hash = '') {
  const base = publicWebBase();
  return hash ? `${base}/#${hash.replace(/^#/, '')}` : `${base}/`;
}

/** @deprecated Prefer landingHomeUrl — same destination when publicWeb is configured. */
export function marketingUrl(hash = '') {
  return landingHomeUrl(hash);
}

/** Unified sign-in on the public marketing site. */
export function marketingLoginUrl() {
  return `${publicWebBase()}/login.html`;
}
