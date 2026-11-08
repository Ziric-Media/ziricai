/**
 * SNET-09 — Mission Control platform API for Sarah Network (superadmin / PLATFORM_API_KEY).
 *   GET  /api/platform/network/v1/stats
 *   GET  /api/platform/network/v1/entities?status=&q=&limit=
 *   GET  /api/platform/network/v1/entities/:snId
 *   POST /api/platform/network/v1/entities/:snId/status   { action: "suspend"|"reinstate", reason }
 * Verification queue lives in networkVerificationRoutes (SNET-04); moderation in networkTrustRoutes (SNET-10).
 */
import { requirePlatformAccess } from "../auth/platformAuth.js";
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
    const platformGuard = deps.platformGuard || requirePlatformAccess();

    app.get("/api/platform/network/v1/stats", platformGuard, async (_req, res) => {
        try {
            res.json({ ok: true, data: { ...(await getNetworkStats()), moderation: await getModerationStats() } });
        } catch (err) {
            fail(res, err, "NETWORK_STATS_FAILED");
        }
    });

    app.get("/api/platform/network/v1/entities", platformGuard, async (req, res) => {
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

    app.get("/api/platform/network/v1/entities/:snId", platformGuard, async (req, res) => {
        try {
            res.json({ ok: true, data: await getEntityForPlatform(String(req.params.snId || "")) });
        } catch (err) {
            fail(res, err, "NETWORK_ENTITY_FAILED");
        }
    });

    app.post("/api/platform/network/v1/entities/:snId/status", platformGuard, async (req, res) => {
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
}
