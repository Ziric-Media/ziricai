/**
 * CH4 — Unified Chat home index routes.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { hydrateFederatedChatIndex, listFederatedChatConversationsAsync } from "../users/chatConversationIndexService.js";
import { syncOwnershipFromTenant } from "../users/handoverStateService.js";
import { attachSnId, attachSnIds, snIdForCompany } from "../network/networkIntegration.js";
import {
    getNetworkLinkedConversation,
    getNetworkChatMessages,
} from "../users/sarahNetworkChatLinkService.js";

/**
 * @param {import('express').Express} app
 */
export function mountChatIndexRoutes(app, deps = {}) {
    const guard = deps.consumerGuard || requireConsumerScope();
    app.get("/api/chat/conversations", guard, async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const filter = req.query.filter;
            const conversations = await attachSnIds(await listFederatedChatConversationsAsync(uid, { filter }));
            res.json({ conversations, filter: filter || "all" });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load chat index" });
        }
    });

    app.get("/api/network-conversations/:conversationId/messages", guard, async (req, res) => {
        try {
            await hydrateFederatedChatIndex(req.consumerAuth.uid); // restart-safe (no-op in memory mode)
            const conv = getNetworkLinkedConversation(req.consumerAuth.uid, req.params.conversationId);
            const since = req.query?.since || null;
            res.json({
                conversation: await attachSnId(conv),
                messages: getNetworkChatMessages(conv.id, { since }),
                consentScope: conv.networkConsentScope || "network_enquiry",
                polledAt: new Date().toISOString(),
            });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to load network thread",
                code: err.code || "NETWORK_LOAD_FAILED",
            });
        }
    });

    app.get("/api/chat/conversations/:companyId/handover", guard, async (req, res) => {
        try {
            const conv = await syncOwnershipFromTenant(req.consumerAuth.uid, req.params.companyId);
            res.json({
                conversation: await attachSnId(conv),
                ownershipState: conv?.ownershipState || null,
                snId: await snIdForCompany(req.params.companyId),
            });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code || "HANDOVER_SYNC_FAILED" });
        }
    });
}
