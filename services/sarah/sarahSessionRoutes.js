/**
 * Portal Sarah session HTTP API — one active conversation per user + surface (Admin, Finance, etc.).
 */
import { requireTenantScope } from "../core/tenantContext.js";
import {
    createNewSarahSession,
    getLatestSarahSessionForUser,
    loadSarahSession,
    serializeSarahSessionForClient,
} from "./sarahSessionStore.js";

function resolveCompanyId(req) {
    return String(req.query?.companyId || req.body?.companyId || req.tenant?.companyId || "").trim();
}

function resolveSurface(req, fallback = "portal-admin") {
    return String(req.query?.surface || req.body?.surface || fallback).trim().toLowerCase();
}

function resolveUserId(req) {
    return req.tenant?.uid || req.auth?.uid || null;
}

export function mountSarahSessionHttpRoutes(app) {
    app.get("/api/sarah/sessions/active", requireTenantScope(), async (req, res) => {
        try {
            const companyId = resolveCompanyId(req);
            const userId = resolveUserId(req);
            const surface = resolveSurface(req);
            if (!companyId || !userId) {
                return res.status(400).json({ error: "companyId and authenticated user required" });
            }
            const session = await getLatestSarahSessionForUser(companyId, userId, surface);
            return res.json({ session: serializeSarahSessionForClient(session) });
        } catch (err) {
            console.error("[api/sarah/sessions/active] error:", err.message);
            return res.status(err.status || 500).json({ error: err.message || "Failed to load active session" });
        }
    });

    app.get("/api/sarah/sessions/:sessionId", requireTenantScope(), async (req, res) => {
        try {
            const companyId = resolveCompanyId(req);
            const userId = resolveUserId(req);
            const surface = resolveSurface(req, "");
            const sessionId = String(req.params.sessionId || "").trim();
            if (!companyId || !userId || !sessionId) {
                return res.status(400).json({ error: "companyId, sessionId, and authenticated user required" });
            }
            const session = await loadSarahSession({ companyId, sessionId, userId });
            if (!session) {
                return res.status(404).json({ error: "Session not found", code: "SESSION_NOT_FOUND" });
            }
            if (surface && String(session.surface || "").toLowerCase() !== surface) {
                return res.status(404).json({
                    error: "Session belongs to another Sarah workspace",
                    code: "SESSION_SURFACE_MISMATCH",
                });
            }
            return res.json({ session: serializeSarahSessionForClient(session) });
        } catch (err) {
            console.error("[api/sarah/sessions/:id] error:", err.message);
            return res.status(err.status || 500).json({ error: err.message || "Failed to load session" });
        }
    });

    app.post("/api/sarah/sessions", requireTenantScope(), async (req, res) => {
        try {
            const companyId = resolveCompanyId(req);
            const userId = resolveUserId(req);
            const surface = resolveSurface(req);
            if (!companyId || !userId) {
                return res.status(400).json({ error: "companyId and authenticated user required" });
            }
            const session = await createNewSarahSession({ companyId, userId, surface });
            return res.status(201).json({ session: serializeSarahSessionForClient(session) });
        } catch (err) {
            console.error("[api/sarah/sessions] error:", err.message);
            return res.status(err.status || 500).json({ error: err.message || "Failed to create session" });
        }
    });
}
