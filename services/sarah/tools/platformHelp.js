import {
    getPlatformAnswer,
    matchPlatformQuestion,
    searchKnowledge,
    getKnowledgeStats,
    CATEGORY_MANIFEST,
} from "../platformKnowledge.js";

export default {
    name: "platformHelp",
    description:
        "Search the ZiricAI knowledge base for answers about platform features, pricing, setup, roles, industries, WhatsApp, CRM, automation, marketplace, security, objections, and best practices.",
    parameters: {
        type: "object",
        properties: {
            topic: {
                type: "string",
                description: "Optional category filter (about, pricing, industries, whatsapp, crm, etc.)",
            },
            question: { type: "string", description: "Specific question from the user" },
        },
    },
    requiredPermissions: [],
    async execute(_ctx, args) {
        const question = args.question || "";
        const topic = args.topic && args.topic !== "general" ? args.topic : null;

        let results = [];
        if (question) {
            results = searchKnowledge(question, { limit: 5, category: topic, minScore: 10 });
        }

        if (!results.length && topic) {
            const categoryAnswer = getPlatformAnswer(topic);
            if (categoryAnswer?.answer) {
                return {
                    message: categoryAnswer.answer,
                    data: {
                        topic: categoryAnswer.id,
                        title: categoryAnswer.title,
                        categories: CATEGORY_MANIFEST.map((c) => c.id),
                    },
                };
            }
        }

        if (!results.length && question) {
            const matched = matchPlatformQuestion(question) || getPlatformAnswer(question);
            return {
                message: matched.answer,
                data: {
                    topic: matched.id,
                    title: matched.title,
                    categories: CATEGORY_MANIFEST.map((c) => c.id),
                },
            };
        }

        if (!results.length) {
            const general = getPlatformAnswer("general");
            return {
                message: general.answer,
                data: { topic: "general", stats: getKnowledgeStats() },
            };
        }

        const best = results[0];
        const extras =
            results.length > 1
                ? "\n\nRelated:\n" +
                  results
                      .slice(1, 4)
                      .map((r) => `• ${r.question}: ${r.answer.slice(0, 120)}…`)
                      .join("\n")
                : "";

        return {
            message: best.answer + extras,
            data: {
                topic: best.category,
                title: best.categoryTitle,
                question: best.question,
                score: best.score,
                matchCount: results.length,
                stats: getKnowledgeStats(),
            },
        };
    },
};
