/**
 * SNET-09 — Mission Control platform API for Sarah Network (superadmin / PLATFORM_API_KEY / scoped platform role, Phase 2.0).
 *   GET  /api/platform/network/v1/stats
 *   GET  /api/platform/network/v1/entities?status=&q=&limit=
 *   GET  /api/platform/network/v1/entities/:snId
 *   POST /api/platform/network/v1/entities/:snId/status   { action: "suspend"|"reinstate", reason }
 *   GET/PUT /api/platform/network/v1/search-config        (Phase 2.0: categories + synonyms; search_admin)
 *   POST /api/platform/network/v1/search-config/reset
 *   GET  /api/platform/network/v1/roles, PUT …/roles/:uid (Phase 2.0: role grants; Super Admin / API key only)
 * Verification queue lives in networkVerificationRoutes (SNET-04); moderation in networkTrustRoutes (SNET-10).
 */
import { requirePlatformAccess } from "../auth/platformAuth.js";
import {
    listPlatformRoleGrants,
    PLATFORM_PERMISSIONS as PERM,
    PLATFORM_ROLES,
    requirePlatformPermission,
    setPlatformRoles,
} from "../auth/platformRbac.js";
import { recordNetworkAdminAction } from "../network/networkAdminAudit.js";
import { getSearchConfig, resetSearchConfig, updateSearchConfig } from "../network/searchConfigService.js";
import { getModerationStats } from "../network/moderationService.js";
import {
    changeEntityStatus,
    getEntityForPlatform,
    getNetworkStats,
    listEntitiesForPlatform,
} from "../network/networkPlatformService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

function actorOf(req) {
    return req.platformAuth?.uid || (req.platformAuth?.via === "api_key" ? "platform_api_key" : "unknown");
}

/**
 * @param {import('express').Express} app
 * @param {{ platformGuard?: Function }} [deps] test seam
 */
export function mountNetworkPlatformRoutes(app, deps = {}) {
    // Phase 2.0 RBAC: per-permission guards (Super Admin / API key pass all); tests inject one guard for every route.
    const guardFor = (permission) => deps.platformGuard || requirePlatformPermission(permission);
    // Granting roles is Super Admin / API key only — never delegable through a role.
    const superOnly = deps.platformGuard || requirePlatformAccess();

    app.get("/api/platform/network/v1/stats", guardFor(PERM.STATS_READ), async (_req, res) => {
        try {
            res.json({ ok: true, data: { ...(await getNetworkStats()), moderation: await getModerationStats() } });
        } catch (err) {
            fail(res, err, "NETWORK_STATS_FAILED");
        }
    });

    app.get("/api/platform/network/v1/entities", guardFor(PERM.ENTITIES_READ), async (req, res) => {
        try {
            const data = await listEntitiesForPlatform({
                status: String(req.query.status || ""),
                q: String(req.query.q || "").slice(0, 100),
                limit: req.query.limit,
            });
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "NETWORK_ENTITIES_FAILED");
        }
    });

    app.get("/api/platform/network/v1/entities/:snId", guardFor(PERM.ENTITIES_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getEntityForPlatform(String(req.params.snId || "")) });
        } catch (err) {
            fail(res, err, "NETWORK_ENTITY_FAILED");
        }
    });

    app.post("/api/platform/network/v1/entities/:snId/status", guardFor(PERM.ENTITIES_WRITE), async (req, res) => {
        try {
            const body = req.body || {};
            const entity = await changeEntityStatus(String(req.params.snId || ""), String(body.action || ""), {
                reason: body.reason,
                actor: actorOf(req),
            });
            res.json({ ok: true, data: { entity } });
        } catch (err) {
            fail(res, err, "NETWORK_ENTITY_STATUS_FAILED");
        }
    });
    // ── Phase 2.0: Search administration (categories + synonyms) ─────────────────────────────────────────────
    app.get("/api/platform/network/v1/search-config", guardFor(PERM.SEARCH_READ), async (_req, res) => {
        try {
            res.json({ ok: true, data: await getSearchConfig() });
        } catch (err) {
            fail(res, err, "SEARCH_CONFIG_READ_FAILED");
        }
    });

    app.put("/api/platform/network/v1/search-config", guardFor(PERM.SEARCH_ADMIN), async (req, res) => {
        try {
            const body = req.body || {};
            res.json({ ok: true, data: await updateSearchConfig({ categories: body.categories, synonyms: body.synonyms }, actorOf(req)) });
        } catch (err) {
            fail(res, err, "SEARCH_CONFIG_UPDATE_FAILED");
        }
    });

    app.post("/api/platform/network/v1/search-config/reset", guardFor(PERM.SEARCH_ADMIN), async (req, res) => {
        try {
            res.json({ ok: true, data: await resetSearchConfig(actorOf(req)) });
        } catch (err) {
            fail(res, err, "SEARCH_CONFIG_RESET_FAILED");
        }
    });

    // ── Phase 2.0: platform roles (Verification Officer, Search Admin, …) ─────────────────────────────────────
    app.get("/api/platform/network/v1/roles", superOnly, async (_req, res) => {
        try {
            const roles = Object.entries(PLATFORM_ROLES).map(([id, r]) => ({ id, label: r.label, permissions: [...r.permissions] }));
            res.json({ ok: true, data: { roles, grants: await listPlatformRoleGrants() } });
        } catch (err) {
            fail(res, err, "PLATFORM_ROLES_FAILED");
        }
    });

    app.put("/api/platform/network/v1/roles/:uid", superOnly, async (req, res) => {
        try {
            const uid = String(req.params.uid || "");
            const grant = await setPlatformRoles(uid, req.body?.roles, actorOf(req));
            await recordNetworkAdminAction({ actor: actorOf(req), action: "platform.roles_set", detail: { uid, roles: grant.roles } });
            res.json({ ok: true, data: { grant } });
        } catch (err) {
            fail(res, err, "PLATFORM_ROLES_UPDATE_FAILED");
        }
    });

}
