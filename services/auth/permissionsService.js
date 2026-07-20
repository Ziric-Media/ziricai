/**
 * Server-side role and permission checks — aligned with js/portal/permissions.js.
 */
import { isSuperAdminRole, normalizeRole as authNormalizeRole } from "./authService.js";

export const PORTAL_ROLES = [
    "owner",
    "manager",
    "sales",
    "support",
    "reception",
    "marketing",
    "finance",
    "superadmin",
];

/** @type {Record<string, string[]>} */
const PERMISSION_MATRIX = {
    canViewInbox: ["owner", "manager", "sales", "support", "reception"],
    canReply: ["owner", "manager", "sales", "support", "reception"],
    canEditAI: ["owner", "manager", "marketing"],
    canManageStaff: ["owner", "manager"],
    canViewBilling: ["owner", "finance"],
    canExportData: ["owner", "manager", "finance"],
    canManageIntegrations: ["owner", "manager"],
    canUploadKnowledge: ["owner", "manager", "marketing"],
    canRunAutomations: ["owner", "manager", "marketing"],
};

/** Sensitive API routes map to permission keys. */
export const ROUTE_PERMISSIONS = {
    "POST /api/knowledge/upload": "canUploadKnowledge",
    "POST /api/knowledge": "canUploadKnowledge",
    "PATCH /api/portal/company/:companyId": "canManageStaff",
    "POST /api/automations/:companyId": "canRunAutomations",
    "POST /api/automations/:companyId/:workflowId/run": "canRunAutomations",
    "POST /api/marketplace/install": "canManageIntegrations",
    "POST /api/marketplace/update": "canManageIntegrations",
};

export function normalizeRole(role) {
    return authNormalizeRole(role) || "owner";
}

/**
 * @param {string|null|undefined} role
 * @param {keyof typeof PERMISSION_MATRIX} permission
 */
export function hasPermission(role, permission) {
    if (isSuperAdminRole(role)) return true;
    const allowed = PERMISSION_MATRIX[permission];
    if (!allowed) return false;
    return allowed.includes(normalizeRole(role));
}

/**
 * Express middleware factory — requires authenticated tenant context + permission.
 * Skipped in lax mode when user is not authenticated (demo/dev compatibility).
 * @param {keyof typeof PERMISSION_MATRIX} permission
 */
export function checkPermission(permission) {
    return (req, res, next) => {
        const enforcement = (process.env.TENANT_SCOPE_ENFORCEMENT || "lax").toLowerCase();
        const ctx = req.tenant;

        if (enforcement === "lax" && !ctx?.uid) {
            return next();
        }

        if (!ctx?.uid && !ctx?.isSuperAdmin) {
            return res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
        }
        if (ctx.isSuperAdmin) return next();
        if (!hasPermission(ctx.role, permission)) {
            return res.status(403).json({
                error: `Permission denied: ${permission} required for role "${ctx.role || "unknown"}"`,
                code: "PERMISSION_DENIED",
            });
        }
        next();
    };
}

/**
 * Block company users from platform-only routes; block non-superadmin from ops routes.
 */
export function requireSuperAdmin() {
    return (req, res, next) => {
        const ctx = req.tenant;
        if (!ctx?.uid) {
            return res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
        }
        if (!ctx.isSuperAdmin) {
            return res.status(403).json({
                error: "Super Admin access required",
                code: "SUPERADMIN_REQUIRED",
            });
        }
        next();
    };
}

export { PERMISSION_MATRIX };
