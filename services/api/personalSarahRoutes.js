/**
 * U2 — Personal Sarah API (Sarah App only).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { handlePersonalSarahChat } from "../sarah/personal/personalSarahOrchestrator.js";
import { getLatestPersonalSarahSession } from "../sarah/personal/personalSarahSessionStore.js";
import { auditLog } from "../audit/auditLog.js";

const personalSarahRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Express} app
 */
export function mountPersonalSarahRoutes(app) {
    app.post("/api/personal-sarah/chat", personalSarahRateLimit, requireConsumerScope(), async (req, res) => {
        try {
            const message = String(req.body?.message || "").trim();
            if (!message) {
                return res.status(400).json({ error: "message is required", code: "MESSAGE_REQUIRED" });
            }
            const result = await handlePersonalSarahChat(
                {
                    uid: req.consumerAuth.uid,
                    consumerProfile: req.consumerAuth.profile,
                    preferences: req.body?.preferences || null,
                },
                {
                    message,
                    sessionId: req.body?.sessionId || null,
                }
            );
            auditLog("personal_sarah_chat", {
                uid: req.consumerAuth.uid,
                sessionId: result.sessionId,
                mode: result.mode,
            });
            res.json(result);
        } catch (err) {
            console.error("[api/personal-sarah/chat]", err.message);
            res.status(500).json({ error: err.message || "Personal Sarah failed", code: "PERSONAL_SARAH_ERROR" });
        }
    });

    app.get("/api/personal-sarah/sessions/active", requireConsumerScope(), async (req, res) => {
        try {
            const session = await getLatestPersonalSarahSession(req.consumerAuth.uid);
            if (!session) {
                return res.json({ session: null });
            }
            res.json({
                session: {
                    id: session.id,
                    title: session.title,
                    messages: session.messages,
                    updatedAt: session.updatedAt,
                },
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load session" });
        }
    });
}
