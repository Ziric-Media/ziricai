/**
 * Portal Sarah — one durable chat session per workforce module (Admin, Finance, Ops, HR, Sales).
 */
export const PORTAL_SARAH_SURFACES = {
  admin: 'portal-admin',
  finance: 'portal-finance',
  operations: 'portal-operations',
  hr: 'portal-hr',
  sales: 'portal-sales',
};

/** @param {string} [persistenceScope] */
export function persistenceScopeToSurface(persistenceScope) {
  const scope = String(persistenceScope || 'admin').trim();
  const map = {
    portal: PORTAL_SARAH_SURFACES.admin,
    admin: PORTAL_SARAH_SURFACES.admin,
    finance: PORTAL_SARAH_SURFACES.finance,
    opsSarah: PORTAL_SARAH_SURFACES.operations,
    hrSarah: PORTAL_SARAH_SURFACES.hr,
    salesSarah: PORTAL_SARAH_SURFACES.sales,
  };
  return map[scope] || PORTAL_SARAH_SURFACES.admin;
}

/** @param {string} surface */
export function surfaceToModuleKey(surface) {
  const s = String(surface || '').toLowerCase();
  if (s === PORTAL_SARAH_SURFACES.finance) return 'finance';
  if (s === PORTAL_SARAH_SURFACES.operations) return 'operations';
  if (s === PORTAL_SARAH_SURFACES.hr) return 'hr';
  if (s === PORTAL_SARAH_SURFACES.sales) return 'sales';
  if (s === PORTAL_SARAH_SURFACES.admin || s === 'portal') return 'admin';
  return 'admin';
}
