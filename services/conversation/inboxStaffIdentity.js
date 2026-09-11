/**
 * Resolve staff display name for human inbox replies from authenticated tenant context.
 * Never uses companyId/company name as a person label.
 */

function isCompanyLikeName(value, profile, companyId) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return true;
    const companyRef = profile?.companyId || profile?.company || companyId;
    if (companyRef && trimmed === companyRef) return true;
    if (companyId && trimmed === companyId) return true;
    return false;
}

/**
 * @param {{ profile?: object|null, companyId?: string|null, email?: string|null }} tenantCtx
 * @returns {string|null}
 */
export function resolveStaffSenderName(tenantCtx = {}) {
    const profile = tenantCtx.profile;
    if (!profile || typeof profile !== "object") return null;

    const candidates = [profile.fullName, profile.name, profile.displayName].filter(
        (v) => typeof v === "string" && v.trim()
    );

    for (const candidate of candidates) {
        const trimmed = candidate.trim();
        if (isCompanyLikeName(trimmed, profile, tenantCtx.companyId)) continue;
        return trimmed;
    }

    return null;
}
