/**
 * Cross-site URL helpers for multi-site Netlify deployment.
 * Override via window.__ZIRICAI_CONFIG__.sites or env at build time.
 */

function isLocalHost() {
  if (typeof location === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

const LOCAL = isLocalHost();

const DEFAULT_SITES = LOCAL
  ? {
      marketing: 'http://localhost:3000',
      app: 'http://localhost:3000/app',
      admin: 'http://localhost:3000/admin',
      api: '',
    }
  : {
      marketing: 'https://marketing.ziricai.com',
      app: 'https://app.ziricai.com',
      admin: 'https://admin.ziricai.com',
      api: 'https://api.ziricai.com',
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

/** Marketing landing URL with optional hash. */
export function marketingUrl(hash = '') {
  const base = getSiteUrls().marketing.replace(/\/$/, '');
  return hash ? `${base}/#${hash.replace(/^#/, '')}` : `${base}/`;
}
