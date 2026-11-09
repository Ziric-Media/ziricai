/**
 * Phase 2.0 — platform RBAC for Mission Control / Sarah Network administration.
 *
 * Until now every `/api/platform/*` route was all-or-nothing: Super Admin (Firebase) or PLATFORM_API_KEY.
 * That meant verifying a business required full Super Admin. This adds scoped platform roles stored server-side:
 *
 *   verification_officer  read the verification queue, decide cases (start review / request info / approve / reject),
 *                         download evidence files. Cannot restrict a business, suspend entities or edit search config.
 *   search_admin          manage Discover categories + synonyms.
 *   trust_safety          moderation queue + entity suspend / reinstate.
 *   network_analyst       read-only stats and entity list.
 *
 * Super Admin and PLATFORM_API_KEY keep full access (unchanged). Roles are granted by a Super Admin / API key through
 * `PUT /api/platform/network/v1/roles/:uid` and stored in `networkPlatformRoles/{uid}`; they never come from client claims.
 */
import { resolveAuthFromRequest } from "./authService.js";
import { auditLog } from "../audit/auditLog.js";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { hasPlatformApiKeyAccess } from "./platformAuth.js";

export const PLATFORM_PERMISSIONS = Object.freeze({
    VERIFICATION_READ: "network.verification.read",
    VERIFICATION_DECIDE: "network.verification.decide",
    VERIFICATION_RESTRICT: "network.verification.restrict",
    VERIFICATION_EVIDENCE: "network.verification.evidence",
    SEARCH_READ: "network.search.read",
    SEARCH_ADMIN: "network.search.admin",
    ENTITIES_READ: "network.entities.read",
    ENTITIES_WRITE: "network.entities.write",
    MODERATION_READ: "network.moderation.read",
    MODERATION_DECIDE: "network.moderation.decide",
    STATS_READ: "network.stats.read",
});
const P = PLATFORM_PERMISSIONS;

/** role id → permissions (least privilege; `restrict` is deliberately not granted to officers). */
export const PLATFORM_ROLES = Object.freeze({
    verification_officer: Object.freeze({
        label: "Verification Officer",
        permissions: Object.freeze([P.VERIFICATION_READ, P.VERIFICATION_DECIDE, P.VERIFICATION_EVIDENCE, P.STATS_READ, P.ENTITIES_READ]),
    }),
    search_admin: Object.freeze({
        label: "Search Admin",
        permissions: Object.freeze([P.SEARCH_READ, P.SEARCH_ADMIN, P.STATS_READ]),
    }),
    trust_safety: Object.freeze({
        label: "Trust & Safety",
        permissions: Object.freeze([P.MODERATION_READ, P.MODERATION_DECIDE, P.ENTITIES_READ, P.ENTITIES_WRITE, P.VERIFICATION_RESTRICT, P.STATS_READ]),
    }),
    network_analyst: Object.freeze({
        label: "Network Analyst",
        permissions: Object.freeze([P.STATS_READ, P.ENTITIES_READ, P.SEARCH_READ]),
    }),
});

const col = createNetworkCollection(NETWORK_COLLECTIONS.PLATFORM_ROLES);

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

/** Union of permissions for a role list (unknown roles contribute nothing). */
export function permissionsForRoles(roles) {
    const out = new Set();
    for (const r of Array.isArray(roles) ? roles : []) for (const perm of PLATFORM_ROLES[r]?.permissions || []) out.add(perm);
    return [...out];
}

/** @param {string} uid */
export async function getPlatformRoles(uid) {
    if (!uid) return [];
    const row = await col.get(String(uid));
    return Array.isArray(row?.roles) ? row.roles.filter((r) => PLATFORM_ROLES[r]) : [];
}

/** @returns {Promise<Array<{ uid: string, roles: string[], updatedAt: string, updatedBy: string }>>} */
export async function listPlatformRoleGrants() {
    const rows = await col.list({ limit: 500 });
    return rows
        .map(({ __id, ...r }) => r)
        .filter((r) => r.roles?.length)
        .sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
}

/**
 * Replace the roles of a platform user (empty list revokes). Caller must be Super Admin / API key.
 * @param {string} uid
 * @param {string[]} roles
 * @param {string} actor
 */
export async function setPlatformRoles(uid, roles, actor) {
    const id = String(uid || "").trim();
    if (!id || id.length > 128 || /[\/\s]/.test(id)) throw err(422, "ROLE_UID_INVALID", "A valid user id is required.");
    const list = [...new Set((Array.isArray(roles) ? roles : []).map(String))];
    const unknown = list.filter((r) => !PLATFORM_ROLES[r]);
    if (unknown.length) throw err(422, "ROLE_UNKNOWN", `Unknown roles: ${unknown.join(", ")}. Use: ${Object.keys(PLATFORM_ROLES).join(", ")}`);
    const row = { uid: id, roles: list, updatedAt: new Date().toISOString(), updatedBy: String(actor || "unknown"), schemaVersion: 1 };
    await col.put(id, row, { merge: false });
    return row;
}

/**
 * True when the auth context on `req.platformAuth` may use `permission`.
 * api_key / superadmin / test seams (no `permissions` array) are unrestricted; role-based auth is checked.
 */
export function platformAuthAllows(auth, permission) {
    if (!auth) return false;
    if (Array.isArray(auth.permissions)) return auth.permissions.includes(permission);
    return true;
}

/**
 * Express guard: API key or Super Admin → allowed; otherwise an authenticated user whose platform role grants `permission`.
 * @param {string} permission one of PLATFORM_PERMISSIONS
 */
export function requirePlatformPermission(permission) {
    return async (req, res, next) => {
        try {
            if (hasPlatformApiKeyAccess(req)) {
                req.platformAuth = { via: "api_key" };
                return next();
            }
            const auth = await resolveAuthFromRequest(req);
            if (auth.isSuperAdmin && auth.uid) {
                req.platformAuth = { via: "superadmin", uid: auth.uid };
                return next();
            }
            if (auth.uid) {
                const roles = await getPlatformRoles(auth.uid);
                const permissions = permissionsForRoles(roles);
                if (permissions.includes(permission)) {
                    req.platformAuth = { via: "platform_role", uid: auth.uid, roles, permissions };
                    return next();
                }
            }
            auditLog("platform_access_denied", { path: req.path, method: req.method, uid: auth.uid || null, permission });
            const status = auth.uid ? 403 : 401;
            return res.status(status).json({
                error: status === 401 ? "Authentication required" : `Platform permission required: ${permission}`,
                code: status === 401 ? "UNAUTHORIZED" : "PLATFORM_FORBIDDEN",
            });
        } catch (e) {
            console.error("[platformRbac]", e.message);
            return res.status(500).json({ error: "Platform auth check failed" });
        }
    };
}

export function clearPlatformRolesForTests() {
    col.clearMemory();
}
