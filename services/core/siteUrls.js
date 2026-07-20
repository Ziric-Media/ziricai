/**
 * Server-side site URL helpers (env-driven for provisioning responses).
 */

function trimSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

export function getAppBaseUrl() {
  return trimSlash(process.env.APP_BASE_URL || 'http://localhost:3000/app');
}

export function getAdminBaseUrl() {
  return trimSlash(process.env.ADMIN_BASE_URL || 'http://localhost:3000/admin');
}

export function getMarketingBaseUrl() {
  return trimSlash(process.env.MARKETING_BASE_URL || 'http://localhost:3000');
}

export function portalUrlForCompany(companyId) {
  const base = getAppBaseUrl();
  return `${base}/?company=${encodeURIComponent(companyId)}`;
}
