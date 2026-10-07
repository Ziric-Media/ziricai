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
  if (ctx?.isProvisioned === true) return false;
  if (isDemoTenant(companyId)) return true;
  if (ctx?.isDemo === true && ctx?.isProvisioned !== true) return true;
  return false;
}

/** Portal modules: never inject demo content when hub/workspace marks tenant provisioned. */
export function shouldUsePortalDemoContentFallback(ctx = {}) {
  if (ctx?.isProvisioned === true) return false;
  return shouldUseDemoFallback(ctx);
}

export function resolvePortalProvisionedFlag(state = {}) {
  if (state.hubData?.isProvisioned === true) return true;
  if (state.workspace?.company) return true;
  return false;
}
