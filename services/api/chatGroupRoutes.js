/**
 * CH3 — Group chat + media attachment metadata routes.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import {
    createPersonalGroup,
    listGroupConversations,
    getGroupConversation,
    getGroupMessages,
    sendGroupMessage,
    addGroupMember,
    invitePersonalSarahToGroup,
} from "../users/groupConversationService.js";
import { isValidPersonId } from "../users/identityContracts.js";

const chatRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Express} app
 */
export function mountChatGroupRoutes(app) {
    app.get("/api/group-conversations", requireConsumerScope(), async (req, res) => {
        try {
            res.json({ conversations: listGroupConversations(req.consumerAuth.uid) });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list groups" });
        }
    });

    app.post("/api/group-conversations", requireConsumerScope(), chatRateLimit, async (req, res) => {
        try {
            const conv = await createPersonalGroup(req.consumerAuth.uid, req.body || {});
            res.status(201).json({ conversation: conv });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "GROUP_CREATE_FAILED" });
        }
    });

    app.get("/api/group-conversations/:groupId/messages", requireConsumerScope(), async (req, res) => {
        try {
            const conv = getGroupConversation(req.consumerAuth.uid, req.params.groupId);
            res.json({ conversation: conv, messages: getGroupMessages(conv.id) });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "GROUP_LOAD_FAILED" });
        }
    });

    app.post(
        "/api/group-conversations/:groupId/messages",
        requireConsumerScope(),
        chatRateLimit,
        async (req, res) => {
            try {
                const result = await sendGroupMessage(
                    req.consumerAuth.uid,
                    req.params.groupId,
                    req.body?.message,
                    { attachments: req.body?.attachments }
                );
                res.json(result);
            } catch (err) {
                res.status(err.status || 500).json({ error: err.message, code: err.code || "GROUP_SEND_FAILED" });
            }
        }
    );

    app.post("/api/group-conversations/:groupId/members", requireConsumerScope(), async (req, res) => {
        try {
            const memberId = String(req.body?.personId || "").trim();
            if (!isValidPersonId(memberId)) {
                return res.status(400).json({ error: "personId required", code: "MEMBER_REQUIRED" });
            }
            const conv = await addGroupMember(req.consumerAuth.uid, req.params.groupId, memberId);
            res.json({ conversation: conv });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "GROUP_MEMBER_FAILED" });
        }
    });

    app.post("/api/group-conversations/:groupId/invite-sarah", requireConsumerScope(), async (req, res) => {
        try {
            const conv = await invitePersonalSarahToGroup(req.consumerAuth.uid, req.params.groupId, {
                consentGranted: Boolean(req.body?.consentGranted),
            });
            res.json({ conversation: conv });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "GROUP_SARAH_INVITE_FAILED" });
        }
    });
}
