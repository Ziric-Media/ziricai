/**
 * U5 — User ↔ Company Sarah conversations (Sarah App).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { listUserConversations, getUserConversationById } from "../users/userConversationService.js";
import {
    sendCompanySarahMessage,
    getCompanyConversationForUser,
} from "../sarah/company/companyReceptionChatService.js";
import { listDiscoverCompanies } from "../users/businessDirectoryService.js";

const chatRateLimit = authRateLimit("auth");

function profileFromReq(req) {
    return req.consumerAuth?.profile || {};
}

/**
 * @param {import('express').Express} app
 */
export function mountUserConversationRoutes(app) {
    app.get("/api/discover/companies", requireConsumerScope(), async (_req, res) => {
        try {
            res.json({ companies: await listDiscoverCompanies() });
        } catch (err) {
            res.status(500).json({ error: err.message || "Discover unavailable" });
        }
    });

    app.get("/api/user-conversations", requireConsumerScope(), async (req, res) => {
        try {
            const conversations = listUserConversations(req.consumerAuth.uid);
            res.json({ conversations });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list conversations" });
        }
    });

    app.get("/api/user-conversations/:companyId/messages", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const companyId = req.params.companyId;
            const data = await getCompanyConversationForUser(uid, companyId, profileFromReq(req));
            res.json({
                conversation: data.conversation,
                messages: data.messages,
            });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to load messages",
                code: err.code || "CONVERSATION_LOAD_FAILED",
            });
        }
    });

    app.post(
        "/api/user-conversations/:companyId/messages",
        chatRateLimit,
        requireConsumerScope(),
        async (req, res) => {
            try {
                const uid = req.consumerAuth.uid;
                const companyId = req.params.companyId;
                const message = req.body?.message;
                const result = await sendCompanySarahMessage(uid, companyId, message, profileFromReq(req));
                res.json(result);
            } catch (err) {
                res.status(err.status || 500).json({
                    error: err.message || "Send failed",
                    code: err.code || "CONVERSATION_SEND_FAILED",
                });
            }
        }
    );

    app.get("/api/user-conversations/id/:conversationId/messages", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const conv = getUserConversationById(uid, req.params.conversationId);
            const data = await getCompanyConversationForUser(uid, conv.companyId, profileFromReq(req));
            res.json({
                conversation: data.conversation,
                messages: data.messages,
            });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to load conversation",
                code: err.code || "CONVERSATION_LOAD_FAILED",
            });
        }
    });
}
