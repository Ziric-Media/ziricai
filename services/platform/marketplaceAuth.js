/**
 * Marketplace payment-bypass authorization — not client-controlled.
 * Only superadmin session or platform API key may bypass paid-pack gates.
 */
import { hasPlatformApiKeyAccess } from "../auth/platformAuth.js";

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function allowMarketplacePaymentBypass(req) {
    if (req.tenant?.isSuperAdmin) return true;
    if (hasPlatformApiKeyAccess(req)) return true;
    return false;
}

/**
 * Resolve trusted payment bypass flags — ignores client demoMode/skipPayment for tenant callers.
 * @param {import('express').Request} req
 * @param {{ demoMode?: boolean, skipPayment?: boolean }} body
 */
export function resolveMarketplacePaymentBypass(req, body = {}) {
    if (!allowMarketplacePaymentBypass(req)) {
        return { demoMode: false, skipPayment: false };
    }
    return {
        demoMode: body.demoMode === true,
        skipPayment: body.skipPayment === true,
    };
}
