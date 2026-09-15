/**
 * Central Motors production pilot — env-gated WhatsApp routing to central-motors-rtb.
 *
 * Enable on Railway:
 *   CENTRAL_MOTORS_PILOT=true
 * or:
 *   DEFAULT_COMPANY_ID=central-motors-rtb
 *
 * Local dev stays on demo-central-motors unless pilot flag is set explicitly.
 */
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../inventory/adapters/centralMotorsRtbAdapter.js";
import { DEMO_COMPANY_ID } from "../core/dataMode.js";
import { getTenantMembership } from "../auth/authService.js";

export { CENTRAL_MOTORS_RTB_COMPANY_ID };

/** Portal demo team emails — Firebase auth without Firestore profile (showcase tenant). */
const SHOWCASE_PORTAL_EMAILS = new Set([
    "john@centralmotors.co.za",
    "sarah@centralmotors.co.za",
    "mike@centralmotors.co.za",
    "info@centralmotors.co.za",
]);

export function isPilotShowcasePortalCompany(companyId) {
    if (!companyId || !isCentralMotorsPilotMode()) return false;
    return companyId === DEMO_COMPANY_ID || companyId === CENTRAL_MOTORS_RTB_COMPANY_ID;
}

/**
 * Allow authenticated Central Motors showcase users to read pilot tenant data
 * (integrations, inbox) when portal companyId is demo-central-motors.
 * @param {{ uid?: string|null, email?: string|null, profile?: object|null }} ctx
 * @param {string} requestedCompanyId
 */
export async function tryPilotShowcaseTenantAccess(ctx, requestedCompanyId, deps = {}) {
    if (!ctx?.uid || !isPilotShowcasePortalCompany(requestedCompanyId)) {
        return false;
    }

    const resolveMembership = deps.getTenantMembership ?? getTenantMembership;
    const email = String(ctx.email || ctx.profile?.email || "")
        .trim()
        .toLowerCase();
    if (email && SHOWCASE_PORTAL_EMAILS.has(email)) {
        return true;
    }

    const profileCompany = ctx.profile?.companyId || ctx.profile?.company;
    if (profileCompany === DEMO_COMPANY_ID) {
        return true;
    }

    if (await resolveMembership(ctx.uid, DEMO_COMPANY_ID)) return true;
    if (await resolveMembership(ctx.uid, CENTRAL_MOTORS_RTB_COMPANY_ID)) return true;

    return false;
}

/**
 * Map showcase portal tenant to live pilot data (WhatsApp, inbox, CRM).
 * Portal users on demo-central-motors see central-motors-rtb when pilot is enabled.
 */
export function resolvePilotDataCompanyId(companyId) {
    if (!companyId) return companyId;
    if (isCentralMotorsPilotMode() && companyId === DEMO_COMPANY_ID) {
        return CENTRAL_MOTORS_RTB_COMPANY_ID;
    }
    return companyId;
}

export function isCentralMotorsPilotMode() {
    const flag = String(process.env.CENTRAL_MOTORS_PILOT || "").trim().toLowerCase();
    if (flag === "true" || flag === "1" || flag === "yes") return true;
    if (flag === "false" || flag === "0" || flag === "no") return false;
    return process.env.DEFAULT_COMPANY_ID === CENTRAL_MOTORS_RTB_COMPANY_ID;
}
