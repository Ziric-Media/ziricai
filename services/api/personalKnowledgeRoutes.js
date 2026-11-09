/**
 * U3 — My Knowledge API (Sarah App).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import {
    listKnowledgeSectionCatalog,
    listKnowledgeSections,
    getKnowledgeSection,
    upsertKnowledgeSection,
} from "../users/personalKnowledgeService.js";

/**
 * @param {import('express').Express} app
 */
export function mountPersonalKnowledgeRoutes(app) {
    app.get("/api/personal-knowledge/catalog", requireConsumerScope(), (_req, res) => {
        res.json({ sections: listKnowledgeSectionCatalog() });
    });

    app.get("/api/personal-knowledge/sections", requireConsumerScope(), async (req, res) => {
        try {
            const sections = await listKnowledgeSections(req.consumerAuth.uid);
            res.json({ sections });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list sections" });
        }
    });

    app.get("/api/personal-knowledge/sections/:sectionKey", requireConsumerScope(), async (req, res) => {
        try {
            const section = await getKnowledgeSection(req.consumerAuth.uid, req.params.sectionKey);
            res.json({ section });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.put("/api/personal-knowledge/sections/:sectionKey", requireConsumerScope(), async (req, res) => {
        try {
            const section = await upsertKnowledgeSection(req.consumerAuth.uid, req.params.sectionKey, req.body || {});
            res.json({ section });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });
}
