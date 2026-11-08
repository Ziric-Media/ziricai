/**
 * CH4 — Unified Chat home index routes.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { listFederatedChatConversations } from "../users/chatConversationIndexService.js";
import { syncOwnershipFromTenant } from "../users/handoverStateService.js";

/**
 * @param {import('express').Express} app
 */
export function mountChatIndexRoutes(app) {
    app.get("/api/chat/conversations", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const filter = req.query.filter;
            const conversations = listFederatedChatConversations(uid, { filter });
            res.json({ conversations, filter: filter || "all" });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load chat index" });
        }
    });

    app.get("/api/chat/conversations/:companyId/handover", requireConsumerScope(), async (req, res) => {
        try {
            const conv = await syncOwnershipFromTenant(req.consumerAuth.uid, req.params.companyId);
            res.json({ conversation: conv, ownershipState: conv?.ownershipState || null });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "HANDOVER_SYNC_FAILED" });
        }
    });
}
