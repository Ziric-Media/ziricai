/**
 * U2 — Personal Sarah API (Sarah App only).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { handlePersonalSarahChat } from "../sarah/personal/personalSarahOrchestrator.js";
import {
    getLatestPersonalSarahSession,
    listPersonalSarahSessions,
    createPersonalSarahSession,
    getPersonalSarahSessionForUser,
    serializePersonalSarahSessionDetail,
} from "../sarah/personal/personalSarahSessionStore.js";
import { reserveConsumerChatTurn } from "../revenue/consumerDailyChatUsage.js";
import { auditLog } from "../audit/auditLog.js";

const personalSarahRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handlePersonalSarahChatRequest(req, res) {
    try {
        const message = String(req.body?.message || "").trim();
        if (!message) {
            return res.status(400).json({ error: "message is required", code: "MESSAGE_REQUIRED" });
        }

        const uid = req.consumerAuth.uid;
        const quota = await reserveConsumerChatTurn(uid);
        if (!quota.allowed) {
            auditLog("personal_sarah_chat_quota", {
                uid,
                usage: quota.usage,
                limit: quota.limit,
                dayKey: quota.dayKey,
            });
            return res.status(429).json({
                error: "Daily Personal Sarah chat limit reached for your plan.",
                code: "CHAT_QUOTA_EXCEEDED",
                usage: quota.usage,
                limit: quota.limit,
                dayKey: quota.dayKey,
            });
        }

        const sessionId = req.body?.sessionId || null;
        if (sessionId) {
            const owned = await getPersonalSarahSessionForUser(uid, sessionId);
            if (!owned) {
                return res.status(404).json({
                    error: "Conversation not found",
                    code: "SESSION_NOT_FOUND",
                });
            }
        }

        const result = await handlePersonalSarahChat(
            {
                uid,
                consumerProfile: req.consumerAuth.profile,
                preferences: req.body?.preferences || null,
            },
            {
                message,
                sessionId,
            }
        );
        auditLog("personal_sarah_chat", {
            uid,
            sessionId: result.sessionId,
            mode: result.mode,
            quotaUsage: quota.usage,
        });
        res.json({
            ...result,
            quota: {
                usage: quota.usage,
                limit: quota.limit,
                enforcementMode: quota.enforcementMode,
            },
        });
    } catch (err) {
        console.error("[api/personal-sarah/chat]", err.message);
        res.status(500).json({ error: err.message || "Personal Sarah failed", code: "PERSONAL_SARAH_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleListPersonalSarahSessions(req, res) {
    try {
        const sessions = await listPersonalSarahSessions(req.consumerAuth.uid);
        res.json({ sessions });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to list sessions", code: "SESSION_LIST_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleCreatePersonalSarahSession(req, res) {
    try {
        const title = req.body?.title ? String(req.body.title).trim() : undefined;
        const session = await createPersonalSarahSession(req.consumerAuth.uid, { title });
        if (!session) {
            return res.status(500).json({ error: "Could not create session", code: "SESSION_CREATE_ERROR" });
        }
        auditLog("personal_sarah_session_create", { uid: req.consumerAuth.uid, sessionId: session.id });
        res.status(201).json({ session: serializePersonalSarahSessionDetail(session) });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to create session", code: "SESSION_CREATE_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetPersonalSarahSession(req, res) {
    try {
        const sessionId = String(req.params?.id || "").trim();
        if (!sessionId) {
            return res.status(400).json({ error: "Session id required", code: "SESSION_ID_REQUIRED" });
        }
        const session = await getPersonalSarahSessionForUser(req.consumerAuth.uid, sessionId);
        if (!session) {
            return res.status(404).json({
                error: "Conversation not found",
                code: "SESSION_NOT_FOUND",
            });
        }
        res.json({ session: serializePersonalSarahSessionDetail(session) });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to load session", code: "SESSION_LOAD_ERROR" });
    }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetActivePersonalSarahSession(req, res) {
    try {
        const session = await getLatestPersonalSarahSession(req.consumerAuth.uid);
        if (!session) {
            return res.json({ session: null });
        }
        res.json({
            session: serializePersonalSarahSessionDetail(session),
        });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to load session", code: "SESSION_LOAD_ERROR" });
    }
}

/**
 * @param {import('express').Express} app
 */
export function mountPersonalSarahRoutes(app) {
    app.post("/api/personal-sarah/chat", personalSarahRateLimit, requireConsumerScope(), handlePersonalSarahChatRequest);

    app.get("/api/personal-sarah/sessions", requireConsumerScope(), handleListPersonalSarahSessions);

    app.post("/api/personal-sarah/sessions", requireConsumerScope(), handleCreatePersonalSarahSession);

    app.get("/api/personal-sarah/sessions/active", requireConsumerScope(), handleGetActivePersonalSarahSession);

    app.get("/api/personal-sarah/sessions/:id", requireConsumerScope(), handleGetPersonalSarahSession);
}
