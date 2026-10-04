/**
 * Client Zero — ZiricAI operating as the first production tenant (CZ-001).
 */

export const CLIENT_ZERO_COMPANY_IDS = Object.freeze(["ziricai", "company-zero"]);

const CLIENT_ZERO_SET = new Set(CLIENT_ZERO_COMPANY_IDS);

/** Primary AI Employee name for Client Zero (CZ-002). */
export const CLIENT_ZERO_AI_EMPLOYEE_NAME = "Sarah";

export function normalizeCompanyId(companyId) {
    return String(companyId || "")
        .trim()
        .toLowerCase();
}

export function isClientZeroCompanyId(companyId) {
    return CLIENT_ZERO_SET.has(normalizeCompanyId(companyId));
}

/**
 * Map inbound channel to playbook surface.
 * @param {string} [channel]
 */
export function clientZeroSurfaceForChannel(channel) {
    const ch = String(channel || "").toLowerCase();
    if (ch === "whatsapp") return "whatsapp";
    if (ch === "facebook" || ch === "messenger") return "messenger";
    if (ch === "web" || ch === "website" || ch === "landing") return "landing";
    return "inbound";
}
