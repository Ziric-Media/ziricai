/**
 * CH8 — Chat ↔ Work link stub routes.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { createChatWorkLink, listChatWorkLinks } from "../users/chatWorkLinkService.js";

/**
 * @param {import('express').Express} app
 */
export function mountChatWorkRoutes(app) {
    app.get("/api/chat/conversations/:conversationId/work-links", requireConsumerScope(), async (req, res) => {
        res.json({ links: listChatWorkLinks(req.params.conversationId) });
    });

    app.post("/api/chat/conversations/:conversationId/work-links", requireConsumerScope(), async (req, res) => {
        try {
            const link = createChatWorkLink(req.params.conversationId, req.body || {});
            res.status(201).json({ link });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to create work link" });
        }
    });
}
