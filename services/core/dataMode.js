/**
 * Central demo vs live data mode — server-side.
 * Demo fallback is ONLY for demo-central-motors, DEMO_SEED=true, or missing companyId (lax dev).
 */

export const DEMO_COMPANY_ID = "demo-central-motors";

/** Explicit demo tenant id (Central Motors showcase). */
export function isDemoTenant(companyId) {
    return Boolean(companyId) && companyId === DEMO_COMPANY_ID;
}

/**
 * Whether client/server should fall back to hardcoded demo datasets.
 * @param {{ companyId?: string|null, isDemo?: boolean, isProvisioned?: boolean }} ctx
 */
export function shouldUseDemoFallback(ctx = {}) {
    const companyId = typeof ctx === "string" ? ctx : ctx?.companyId;
    if (!companyId) return true;
    if (isDemoTenant(companyId)) return true;
    if (process.env.DEMO_SEED === "true") return true;
    if (ctx?.isDemo === true && ctx?.isProvisioned !== true) return true;
    return false;
}

/** Whether startup seed scripts should populate demo tenant data. */
export function shouldSeedDemoData(companyId = DEMO_COMPANY_ID) {
    if (process.env.DEMO_SEED === "true") return true;
    return isDemoTenant(companyId);
}
