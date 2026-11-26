/**
 * Portal workforce Sarah — expose SmileMore / dental-clinic diary tools on the right module surface.
 */
import { SMILEMORE_DENTAL_TOOLS } from "../dental/dentalBookingTools.js";
import { isDentalPracticeCompany } from "../dental/dentalIndustryPreset.js";
import { moduleKeyFromPortalSurface, PORTAL_SARAH_SURFACES } from "./portalSarahSurfaces.js";
import { registerTool, getTool } from "./toolRegistry.js";

const DENTAL_TOOL_NAMES_BY_MODULE = {
    sales: new Set([
        "listDentalBookings",
        "checkDentalAvailability",
        "createDentalBooking",
        "updateDentalBooking",
        "getDentalPatient",
        "scheduleDentalAppointmentReminder",
    ]),
    operations: new Set([
        "listDentalBookings",
        "checkDentalAvailability",
        "createDentalBooking",
        "updateDentalBooking",
        "getDentalPatient",
        "scheduleDentalAppointmentReminder",
    ]),
    finance: new Set(["listDentalSales", "listDentalClaims", "getDentalPatient"]),
    admin: new Set(SMILEMORE_DENTAL_TOOLS.map((t) => t.name)),
};

let dentalToolsRegistered = false;

export function ensurePortalDentalSarahToolsRegistered() {
    if (dentalToolsRegistered) return;
    for (const tool of SMILEMORE_DENTAL_TOOLS) {
        if (!getTool(tool.name)) registerTool(tool);
    }
    dentalToolsRegistered = true;
}

/**
 * @param {object} ctx — Sarah context from buildSarahContext
 * @returns {boolean}
 */
export function isPortalDentalPracticeSarah(ctx) {
    if (!ctx?.companyId) return false;
    return Boolean(ctx.dentalPractice || isDentalPracticeCompany(ctx.companyId, ctx.tenantCompanyRecord));
}

function portalModuleKey(ctx) {
    const surface = String(ctx.surface || "").toLowerCase();
    return ctx.pageContext?.module || moduleKeyFromPortalSurface(surface);
}

/**
 * Extra OpenAI tool defs for dental tenants on portal workforce surfaces (sales / ops / finance / admin).
 * @param {object} ctx
 * @returns {object[]}
 */
export function getPortalDentalOpenAIToolDefinitions(ctx) {
    if (!isPortalClientDentalSurface(ctx)) return [];
    ensurePortalDentalSarahToolsRegistered();
    const mod = portalModuleKey(ctx);
    const allowed = DENTAL_TOOL_NAMES_BY_MODULE[mod];
    if (!allowed?.size) return [];
    return SMILEMORE_DENTAL_TOOLS.filter((t) => allowed.has(t.name)).map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: "object", properties: {} },
        },
    }));
}

function isPortalClientDentalSurface(ctx) {
    const surface = String(ctx.surface || "").toLowerCase();
    if (!surface.startsWith("portal-") && surface !== "portal") return false;
    if (
        surface !== PORTAL_SARAH_SURFACES.SALES &&
        surface !== PORTAL_SARAH_SURFACES.OPERATIONS &&
        surface !== PORTAL_SARAH_SURFACES.FINANCE &&
        surface !== PORTAL_SARAH_SURFACES.ADMIN &&
        surface !== "portal"
    ) {
        return false;
    }
    return isPortalDentalPracticeSarah(ctx);
}

/**
 * @param {object} ctx
 * @returns {import('../dental/dentalBookingTools.js').listDentalBookingsTool[]}
 */
export function getPortalDentalSarahToolsForContext(ctx) {
    if (!isPortalClientDentalSurface(ctx)) return [];
    ensurePortalDentalSarahToolsRegistered();
    const mod = portalModuleKey(ctx);
    const allowed = DENTAL_TOOL_NAMES_BY_MODULE[mod];
    if (!allowed?.size) return [];
    return SMILEMORE_DENTAL_TOOLS.filter(
        (t) => allowed.has(t.name) && (!ctx.canUseTool || ctx.canUseTool(t))
    );
}