/**
 * CHAT-01 — Consumer chat UX routes (search, prefs, media, reactions).
 */
import express from "express";
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { personIdFromUserId } from "../users/identityContracts.js";
import {
    searchChatThreads,
    patchConversationPreferences,
    getConversationPreferences,
    addMessageReaction,
    listReactionsForMessage,
    listBlockedPeersForUser,
    blockPeerForUser,
} from "../users/chatUxService.js";
import {
    createChatMediaUpload,
    completeChatMediaUpload,
    getChatMediaAttachment,
} from "../users/chatMediaService.js";
import { applyRetentionPolicy, recordChatSecurityAudit } from "../users/chatRetentionService.js";
import { createOrganisationGroup } from "../users/groupConversationService.js";
import { invitePersonalSarahToP2p } from "../users/personToPersonConversationService.js";

const chatRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Express} app
 */
export function mountChatUxRoutes(app) {
    app.get("/api/chat/search", requireConsumerScope(), async (req, res) => {
        try {
            const result = searchChatThreads(req.consumerAuth.uid, req.query?.q || req.query?.query);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message || "Search failed" });
        }
    });

    app.get("/api/chat/conversations/:conversationId/preferences", requireConsumerScope(), async (req, res) => {
        const personId = personIdFromUserId(req.consumerAuth.uid);
        res.json({
            preferences: getConversationPreferences(personId, req.params.conversationId),
        });
    });

    app.patch("/api/chat/conversations/:conversationId/preferences", requireConsumerScope(), async (req, res) => {
        try {
            const personId = personIdFromUserId(req.consumerAuth.uid);
            const preferences = patchConversationPreferences(personId, req.params.conversationId, req.body || {});
            if (req.body?.reported) {
                recordChatSecurityAudit("report", {
                    personId,
                    conversationId: req.params.conversationId,
                    reason: req.body?.reportReason || null,
                });
            }
            res.json({ preferences });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to update preferences" });
        }
    });

    app.post("/api/chat/messages/:messageId/reactions", requireConsumerScope(), chatRateLimit, async (req, res) => {
        try {
            const personId = personIdFromUserId(req.consumerAuth.uid);
            const reactions = addMessageReaction(req.params.messageId, personId, req.body?.emoji);
            res.json({ reactions });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.get("/api/chat/messages/:messageId/reactions", requireConsumerScope(), async (req, res) => {
        res.json({ reactions: listReactionsForMessage(req.params.messageId) });
    });

    app.get("/api/chat/blocks", requireConsumerScope(), async (req, res) => {
        res.json({ blocks: listBlockedPeersForUser(req.consumerAuth.uid) });
    });

    app.post("/api/chat/blocks", requireConsumerScope(), async (req, res) => {
        try {
            const block = blockPeerForUser(req.consumerAuth.uid, req.body?.targetPersonId);
            recordChatSecurityAudit("block", { actor: req.consumerAuth.uid, target: req.body?.targetPersonId });
            res.status(201).json({ block });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.post("/api/chat/media/uploads", requireConsumerScope(), chatRateLimit, async (req, res) => {
        try {
            const upload = createChatMediaUpload(req.consumerAuth.uid, req.body || {});
            res.status(201).json({ upload });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.put(
        "/api/chat/media/:uploadId",
        requireConsumerScope(),
        express.raw({ type: "*/*", limit: "11mb" }),
        async (req, res) => {
            try {
                const token = String(req.query?.token || "");
                const personId = personIdFromUserId(req.consumerAuth.uid);
                const attachment = completeChatMediaUpload(
                    req.params.uploadId,
                    personId,
                    token,
                    Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "")
                );
                res.json({ attachment });
            } catch (err) {
                res.status(err.status || 500).json({ error: err.message, code: err.code });
            }
        }
    );

    app.get("/api/chat/media/:uploadId/download", requireConsumerScope(), async (req, res) => {
        try {
            const personId = personIdFromUserId(req.consumerAuth.uid);
            const attachment = getChatMediaAttachment(
                req.params.uploadId,
                personId,
                String(req.query?.token || "")
            );
            res.json({ attachment });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.get("/api/chat/conversations/:conversationId/retention", requireConsumerScope(), async (req, res) => {
        res.json({
            policy: applyRetentionPolicy({ id: req.params.conversationId, createdAt: req.query?.createdAt }),
        });
    });

    app.post("/api/person-conversations/:conversationId/invite-sarah", requireConsumerScope(), async (req, res) => {
        try {
            const conv = await invitePersonalSarahToP2p(req.consumerAuth.uid, req.params.conversationId, {
                consentGranted: Boolean(req.body?.consentGranted),
            });
            res.json({ conversation: conv });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.post("/api/group-conversations/organisation", requireConsumerScope(), chatRateLimit, async (req, res) => {
        try {
            const conv = await createOrganisationGroup(req.consumerAuth.uid, req.body || {});
            res.status(201).json({ conversation: conv });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

}
