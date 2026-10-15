/**
 * Server-side role and permission checks — aligned with js/portal/permissions.js.
 */
import { isSuperAdminRole, normalizeRole as authNormalizeRole } from "./authService.js";

const ROLE_ALIASES = {
    member: "support",
    staff: "support",
    agent: "sales",
    admin: "manager",
    administrator: "manager",
    readonly: "viewer",
};

export const PORTAL_ROLES = [
    "owner",
    "manager",
    "hr",
    "sales",
    "support",
    "reception",
    "marketing",
    "finance",
    "viewer",
    "superadmin",
];

/** @type {Record<string, string[]>} */
const PERMISSION_MATRIX = {
    canViewInbox: ["owner", "manager", "sales", "support", "reception", "viewer"],
    canReply: ["owner", "manager", "sales", "support", "reception"],
    canEditAI: ["owner", "manager", "marketing"],
    canManageStaff: ["owner", "manager"],
    canViewBilling: ["owner", "finance"],
    canExportData: ["owner", "manager", "finance"],
    canManageWorkspace: ["owner", "manager"],
    canManageIntegrations: ["owner", "manager"],
    canUploadKnowledge: ["owner"],
    canRunAutomations: ["owner", "manager", "marketing"],
    canViewTasks: ["owner", "manager", "finance", "hr", "sales", "support", "reception", "marketing", "viewer"],
    canCreateTasks: ["owner", "manager"],
    canAssignTasks: ["owner", "manager"],
    canUpdateOwnTasks: ["owner", "manager", "finance", "hr", "sales", "support", "reception", "marketing", "viewer"],
    canUpdateAnyTask: ["owner", "manager"],
    canCompleteTasks: ["owner", "manager", "finance", "hr", "sales", "support", "reception", "marketing", "viewer"],
};

/** Sensitive API routes map to permission keys. */
export const ROUTE_PERMISSIONS = {
    "POST /api/knowledge/upload": "canUploadKnowledge",
    "POST /api/knowledge": "canUploadKnowledge",
    "PATCH /api/portal/company/:companyId": "canManageStaff",
    "POST /api/automations/:companyId": "canRunAutomations",
    "POST /api/automations/:companyId/:workflowId/run": "canRunAutomations",
    "POST /api/marketplace/install": "canManageStaff",
    "POST /api/marketplace/update": "canManageStaff",
};

/**
 * Least-privilege effective role for authorization (SEC-04).
 * Unknown / missing roles must not grant owner/manager capabilities.
 */
export function resolveEffectivePortalRole(role) {
    if (isSuperAdminRole(role)) return "superadmin";
    const raw = authNormalizeRole(role);
    if (!raw) return "viewer";
    const normalized = ROLE_ALIASES[raw] || raw;
    if (PORTAL_ROLES.includes(normalized)) return normalized;
    return "viewer";
}

export function normalizeRole(role) {
    return resolveEffectivePortalRole(role);
}

export function assertInvitablePortalRole(role) {
    const raw = authNormalizeRole(role);
    const normalized = raw ? ROLE_ALIASES[raw] || raw : "";
    const allowed = PORTAL_ROLES.filter((x) => x !== "owner" && x !== "superadmin");
    if (!normalized || !allowed.includes(normalized)) {
        throw new Error(`Invalid team role "${role}". Allowed: ${allowed.join(", ")}`);
    }
    return normalized;
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
 * Fail closed: lax tenant scope does not bypass permission checks (SEC-02).
 * @param {keyof typeof PERMISSION_MATRIX} permission
 */
export function checkPermission(permission) {
    return (req, res, next) => {
        const ctx = req.tenant;

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
