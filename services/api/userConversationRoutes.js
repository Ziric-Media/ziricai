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
import { getBusinessDirectoryEntry } from "../users/businessDirectoryService.js";

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
            const { SMILEMORE_DEMO_COMPANY_ID } = await import("../dental/smilemorePractice.js");
            const pilots = String(process.env.SARAH_NETWORK_PILOT_COMPANY_IDS || SMILEMORE_DEMO_COMPANY_ID)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const companies = pilots.map((companyId) => {
                const entry = getBusinessDirectoryEntry(companyId);
                return {
                    companyId,
                    displayName: entry?.displayName || companyId,
                    industry: entry?.industry || "Healthcare",
                    location: entry?.location || "South Africa",
                    verified: Boolean(entry?.verified),
                    shortDescription:
                        entry?.shortDescription ||
                        "Chat with this business using Company Sarah on Sarah App.",
                };
            });
            res.json({ companies });
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
