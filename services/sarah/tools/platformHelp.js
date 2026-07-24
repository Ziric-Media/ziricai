import {
    getPlatformAnswer,
    matchPlatformQuestion,
    searchKnowledge,
    getKnowledgeStats,
    getRelatedEntries,
    CATEGORY_MANIFEST,
} from "../platformKnowledge.js";

export default {
    name: "platformHelp",
    description:
        "Search the ZiricAI knowledge base for answers about platform features, pricing, setup, roles, industries, WhatsApp, CRM, automation, marketplace, security, objections, and best practices. Supports category, audience, and related-entry filters.",
    parameters: {
        type: "object",
        properties: {
            topic: {
                type: "string",
                description: "Optional category filter (about-ziricai, pricing, faq, industries, whatsapp, crm, etc.)",
            },
            question: { type: "string", description: "Specific question from the user" },
            audience: {
                type: "string",
                description: "Optional audience filter: Customer, Sales, Developer, Internal",
            },
            sub_category: {
                type: "string",
                description: "Optional sub-category filter (e.g. Introduction, Plans, Troubleshooting)",
            },
        },
    },
    requiredPermissions: [],
    async execute(_ctx, args) {
        const question = args.question || "";
        const topic = args.topic && args.topic !== "general" ? args.topic : null;
        const audience = args.audience || null;
        const subCategory = args.sub_category || null;

        let results = [];
        if (question) {
            results = searchKnowledge(question, { limit: 5, category: topic, subCategory, audience, minScore: 10 });
        }

        if (!results.length && topic) {
            const categoryAnswer = getPlatformAnswer(topic, { audience });
            if (categoryAnswer?.answer) {
                const related = categoryAnswer.id ? getRelatedEntries(categoryAnswer.id, { limit: 3 }) : [];
                return {
                    message: categoryAnswer.answer,
                    data: {
                        id: categoryAnswer.id,
                        topic: categoryAnswer.id || topic,
                        title: categoryAnswer.title,
                        audience,
                        related: related.map((r) => ({ id: r.id, question: r.question, category: r.categoryTitle })),
                        categories: CATEGORY_MANIFEST.map((c) => c.id),
                    },
                };
            }
        }

        if (!results.length && question) {
            const matched = matchPlatformQuestion(question, { audience }) || getPlatformAnswer(question, { audience });
            const related = matched.id ? getRelatedEntries(matched.id, { limit: 3 }) : [];
            return {
                message: matched.answer,
                data: {
                    id: matched.id,
                    topic: matched.id,
                    title: matched.title,
                    audience: matched.audience,
                    related: related.map((r) => ({ id: r.id, question: r.question, category: r.categoryTitle })),
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
        const relatedFromMeta = best.id ? getRelatedEntries(best.id, { limit: 4 }) : [];
        const relatedQuestions = relatedFromMeta.length
            ? relatedFromMeta
            : results.slice(1, 4);

        const extras =
            relatedQuestions.length
                ? "\n\nRelated questions:\n" +
                  relatedQuestions
                      .map((r) => `• [${r.id || r.category}] ${r.question}`)
                      .join("\n")
                : "";

        return {
            message: best.answer + extras,
            data: {
                id: best.id,
                topic: best.category,
                title: best.categoryTitle,
                subCategory: best.subCategory,
                question: best.question,
                audience: best.audience,
                score: best.score,
                matchCount: results.length,
                related: relatedQuestions.map((r) => ({
                    id: r.id,
                    question: r.question,
                    category: r.categoryTitle,
                    subCategory: r.subCategory,
                })),
                stats: getKnowledgeStats(),
            },
        };
    },
};
