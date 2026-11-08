/**
 * CH2 — Person-to-person chat routes.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { isValidPersonId } from "../users/identityContracts.js";
import { hydrateFederatedChatIndex } from "../users/chatConversationIndexService.js";
import {
    openPersonToPersonConversation,
    listPersonToPersonConversations,
    getPersonToPersonConversation,
    getPersonToPersonMessages,
    sendPersonToPersonMessage,
} from "../users/personToPersonConversationService.js";
import {
    blockPerson,
    unblockPerson,
    listBlocksForPerson,
    hydratePersonBlocks,
} from "../users/personBlockService.js";
import { personIdFromUserId } from "../users/identityContracts.js";

const chatRateLimit = authRateLimit("auth");

function profileFromReq(req) {
    return req.consumerAuth?.profile || {};
}

/**
 * @param {import('express').Express} app
 */
export function mountChatPersonRoutes(app) {
    app.get("/api/person-conversations", requireConsumerScope(), async (req, res) => {
        try {
            await hydrateFederatedChatIndex(req.consumerAuth.uid); // restart-safe (no-op in memory mode)
            const conversations = listPersonToPersonConversations(req.consumerAuth.uid);
            res.json({ conversations });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list P2P conversations" });
        }
    });

    app.post("/api/person-conversations", requireConsumerScope(), chatRateLimit, async (req, res) => {
        try {
            const targetPersonId = String(req.body?.targetPersonId || "").trim();
            if (!isValidPersonId(targetPersonId)) {
                return res.status(400).json({ error: "targetPersonId is required", code: "TARGET_REQUIRED" });
            }
            const profile = profileFromReq(req);
            await hydrateFederatedChatIndex(req.consumerAuth.uid);
            const conversation = await openPersonToPersonConversation(req.consumerAuth.uid, targetPersonId, {
                selfDisplayName: profile.displayName || profile.preferredName || null,
                peerDisplayName: req.body?.peerDisplayName || null,
            });
            res.status(201).json({ conversation });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to open conversation",
                code: err.code || "P2P_OPEN_FAILED",
            });
        }
    });

    app.get("/api/person-conversations/:conversationId/messages", requireConsumerScope(), async (req, res) => {
        try {
            await hydrateFederatedChatIndex(req.consumerAuth.uid); // restart-safe (no-op in memory mode)
            const conv = getPersonToPersonConversation(req.consumerAuth.uid, req.params.conversationId);
            const messages = getPersonToPersonMessages(conv.id);
            res.json({ conversation: conv, messages });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to load messages",
                code: err.code || "P2P_LOAD_FAILED",
            });
        }
    });

    app.post(
        "/api/person-conversations/:conversationId/messages",
        requireConsumerScope(),
        chatRateLimit,
        async (req, res) => {
            try {
                await hydrateFederatedChatIndex(req.consumerAuth.uid);
                const result = await sendPersonToPersonMessage(
                    req.consumerAuth.uid,
                    req.params.conversationId,
                    req.body?.message,
                    { attachments: req.body?.attachments }
                );
                res.json(result);
            } catch (err) {
                res.status(err.status || 500).json({
                    error: err.message || "Send failed",
                    code: err.code || "P2P_SEND_FAILED",
                });
            }
        }
    );

    app.get("/api/person-blocks", requireConsumerScope(), async (req, res) => {
        const personId = personIdFromUserId(req.consumerAuth.uid);
        await hydratePersonBlocks(personId); // restart-safe (no-op in memory mode)
        res.json({ blocks: listBlocksForPerson(personId) });
    });

    app.post("/api/person-blocks", requireConsumerScope(), async (req, res) => {
        try {
            const blockerId = personIdFromUserId(req.consumerAuth.uid);
            const blockedId = String(req.body?.personId || "").trim();
            const result = blockPerson(blockerId, blockedId);
            res.status(201).json(result);
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "BLOCK_FAILED" });
        }
    });

    app.delete("/api/person-blocks/:personId", requireConsumerScope(), async (req, res) => {
        try {
            const blockerId = personIdFromUserId(req.consumerAuth.uid);
            const result = unblockPerson(blockerId, req.params.personId);
            res.json(result);
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "UNBLOCK_FAILED" });
        }
    });
}
