/**
 * Server-side Sarah tool permissions — mirrors js/portal/permissions.js matrix.
 */

const PERMISSION_MATRIX = {
    canViewInbox: ["owner", "manager", "sales", "support", "reception"],
    canReply: ["owner", "manager", "sales", "support", "reception"],
    canEditAI: ["owner", "manager", "marketing"],
    canManageStaff: ["owner", "manager"],
    canViewBilling: ["owner", "finance"],
    canExportData: ["owner", "manager", "finance"],
};

const SUPERADMIN_ONLY = new Set(["generateReport"]);

export function normalizeRole(role) {
    return String(role || "owner").toLowerCase().trim();
}

export function getPermissions(role) {
    const r = normalizeRole(role);
    const out = {};
    for (const [key, roles] of Object.entries(PERMISSION_MATRIX)) {
        out[key] = roles.includes(r);
    }
    return out;
}

export function can(role, permission) {
    const allowed = PERMISSION_MATRIX[permission];
    if (!allowed) return false;
    return allowed.includes(normalizeRole(role));
}

/**
 * Check if user may invoke a Sarah tool.
 * @param {{ role?: string|null, isSuperAdmin?: boolean }} ctx
 * @param {{ name: string, requiredPermissions?: string[], platformOnly?: boolean }} tool
 */
export function canUseTool(ctx, tool) {
    if (ctx.isSuperAdmin) return true;

    if (tool.platformOnly || SUPERADMIN_ONLY.has(tool.name)) {
        return false;
    }

    const perms = tool.requiredPermissions || [];
    if (!perms.length) return true;

    return perms.every((p) => can(ctx.role, p));
}

export { PERMISSION_MATRIX };
