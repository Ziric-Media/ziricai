/**
 * Portal Sarah module surfaces — isolate Firestore sessions per workforce module.
 */
export const PORTAL_SARAH_SURFACES = {
    ADMIN: "portal-admin",
    FINANCE: "portal-finance",
    OPERATIONS: "portal-operations",
    HR: "portal-hr",
    SALES: "portal-sales",
};

export function isPortalClientSurface(surface) {
    const s = String(surface || "").toLowerCase();
    return s === "portal" || s.startsWith("portal-");
}

export function moduleKeyFromPortalSurface(surface) {
    const s = String(surface || "").toLowerCase();
    if (s === PORTAL_SARAH_SURFACES.FINANCE) return "finance";
    if (s === PORTAL_SARAH_SURFACES.OPERATIONS) return "operations";
    if (s === PORTAL_SARAH_SURFACES.HR) return "hr";
    if (s === PORTAL_SARAH_SURFACES.SALES) return "sales";
    if (s === PORTAL_SARAH_SURFACES.ADMIN || s === "portal") return "admin";
    return "admin";
}

export function moduleLabelFromKey(key) {
    const labels = {
        admin: "Sarah Admin (company-wide)",
        finance: "Sarah Finance",
        operations: "Sarah Operations",
        hr: "Sarah HR",
        sales: "Sarah Sales",
    };
    return labels[key] || "Sarah";
}
