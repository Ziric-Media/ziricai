/**
 * Client-side mirror of services/core/dataMode.js
 */

export const DEMO_COMPANY_ID = 'demo-central-motors';

export function isDemoTenant(companyId) {
  return Boolean(companyId) && companyId === DEMO_COMPANY_ID;
}

/**
 * @param {{ companyId?: string|null, isDemo?: boolean, isProvisioned?: boolean }|string|null} ctx
 */
export function shouldUseDemoFallback(ctx = {}) {
  const companyId = typeof ctx === 'string' ? ctx : ctx?.companyId;
  if (!companyId) return true;
  if (isDemoTenant(companyId)) return true;
  if (ctx?.isDemo === true && ctx?.isProvisioned !== true) return true;
  return false;
}
