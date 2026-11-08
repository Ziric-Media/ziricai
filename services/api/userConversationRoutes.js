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
import { searchDiscoverCompanies } from "../users/businessDirectoryService.js";
import { attachSnId, attachSnIds } from "../network/networkIntegration.js";

const chatRateLimit = authRateLimit("auth");

function profileFromReq(req) {
    return req.consumerAuth?.profile || {};
}

/**
 * @param {import('express').Express} app
 */
export function mountUserConversationRoutes(app, deps = {}) {
    const guard = deps.consumerGuard || requireConsumerScope();
    app.get("/api/discover/companies", guard, async (req, res) => {
        try {
            const result = await searchDiscoverCompanies({
                q: String(req.query?.q || "").slice(0, 120),
                category: String(req.query?.category || "").slice(0, 40),
                limit: req.query?.limit,
                cursor: String(req.query?.cursor || "").slice(0, 200),
            });
            res.json({
                companies: result.companies,
                total: result.total,
                nextCursor: result.nextCursor,
                facets: result.facets,
                query: result.query,
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Discover unavailable" });
        }
    });

    app.get("/api/user-conversations", guard, async (req, res) => {
        try {
            const conversations = await attachSnIds(listUserConversations(req.consumerAuth.uid));
            res.json({ conversations });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list conversations" });
        }
    });

    app.get("/api/user-conversations/:companyId/messages", guard, async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const companyId = req.params.companyId;
            const data = await getCompanyConversationForUser(uid, companyId, profileFromReq(req));
            res.json({
                conversation: await attachSnId(data.conversation),
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
        guard,
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

    app.get("/api/user-conversations/id/:conversationId/messages", guard, async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const conv = getUserConversationById(uid, req.params.conversationId);
            const data = await getCompanyConversationForUser(uid, conv.companyId, profileFromReq(req));
            res.json({
                conversation: await attachSnId(data.conversation),
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
