import { searchKnowledgeForQuery } from "../../tenants/knowledgeService.js";

export default {
    name: "searchCompanyKnowledge",
    description:
        "Search this company's uploaded Knowledge Base (FAQs, products, services, policies, website imports). Use for factual answers about the business — not generic ZiricAI platform docs.",
    parameters: {
        type: "object",
        properties: {
            question: { type: "string", description: "User question or keywords to search" },
            limit: { type: "number", description: "Max documents to return (default 4)" },
        },
        required: ["question"],
    },
    async execute(ctx, args) {
        const question = String(args.question || ctx.lastUserMessage || "").trim();
        if (!question) {
            return { message: "No search query provided.", data: { results: [] } };
        }

        const kb = await searchKnowledgeForQuery(ctx.companyId, question, {
            limit: Math.min(Number(args.limit) || 4, 8),
            knowledgeBaseId: ctx.kbSummary?.knowledgeBaseId || ctx.workspaceLinks?.knowledgeBaseId || null,
            fallbackRecent: ctx.surface === "landing",
        });

        if (!kb.context) {
            return {
                message: "No matching knowledge documents found for that question.",
                data: { sources: [], snippets: [] },
            };
        }

        return {
            message: `Found ${kb.sources.length} relevant knowledge item(s): ${kb.sources.join(", ")}.`,
            data: {
                sources: kb.sources,
                context: kb.context,
            },
        };
    },
};
