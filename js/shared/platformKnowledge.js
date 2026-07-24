/**
 * ZiricAI platform knowledge — browser + shared exports.
 * Source of truth: knowledge/*.md (regenerate via npm run build:knowledge)
 * Server runtime: services/knowledge/platformKnowledgeLoader.js reads markdown directly.
 */
import { getPricingSummaryText, getDefaultPlatformReply } from "./billingPlans.js";
import {
    PLATFORM_KNOWLEDGE_STATS,
    PLATFORM_KNOWLEDGE_MANIFEST,
    PLATFORM_KNOWLEDGE_PAIRS,
    normalizeQuestionText,
    scoreKnowledgeMatch,
    searchKnowledge,
    getPlatformKnowledgeSummary as getBundleSummary,
    matchPlatformQuestion,
    getPlatformAnswer as getBundleAnswer,
} from "./platformKnowledgeData.js";

export {
    PLATFORM_KNOWLEDGE_STATS,
    PLATFORM_KNOWLEDGE_MANIFEST,
    PLATFORM_KNOWLEDGE_PAIRS,
    normalizeQuestionText,
    scoreKnowledgeMatch,
    searchKnowledge,
    matchPlatformQuestion,
};

/** Legacy unclear reply for landing Sarah */
export const PLATFORM_UNCLEAR_REPLY =
    "I want to make sure I help you properly — could you rephrase that? I can answer questions about what ZiricAI is, pricing, setup, support, industries (including restaurants), WhatsApp integration, security, the free trial, and more.";

export const PLATFORM_DEFAULT_REPLY = getDefaultPlatformReply();

/**
 * Legacy PLATFORM_FAQ shape for backward compatibility with landing Sarah browser bundle.
 * Built dynamically from knowledge categories.
 */
export const PLATFORM_FAQ = Object.fromEntries(
    PLATFORM_KNOWLEDGE_MANIFEST.filter((c) => c.count > 0).map((cat) => {
        const first = PLATFORM_KNOWLEDGE_PAIRS.find((p) => p.cat === cat.id);
        const keywords = PLATFORM_KNOWLEDGE_PAIRS.filter((p) => p.cat === cat.id)
            .flatMap((p) => p.kw?.slice(0, 5) || [])
            .slice(0, 20);
        const id = cat.id === "about" ? "overview" : cat.id;
        return [
            id,
            {
                title: cat.title,
                keywords: [...new Set(keywords.length ? keywords : [cat.id, cat.title.toLowerCase()])],
                answer: cat.id === "pricing" ? null : first?.a || "",
            },
        ];
    })
);

if (!PLATFORM_FAQ.pricing) {
    PLATFORM_FAQ.pricing = {
        title: "Pricing",
        keywords: ["pricing", "price", "cost", "how much", "r999", "r2999", "r4999", "plans"],
        answer: null,
    };
}

export const PLATFORM_INTENTS = Object.entries(PLATFORM_FAQ).map(([id, entry]) => ({
    id,
    keys: entry.keywords,
    reply: id === "pricing" ? getPricingSummaryText() : entry.answer,
    title: entry.title,
}));

export function formatReplyForQuestion(id, answer, question) {
    if (!answer) return PLATFORM_DEFAULT_REPLY;
    const normalized = normalizeQuestionText(question);
    if (id === "pricing" && /how much|cost|price|pricing/.test(normalized)) {
        return `Great question! ${answer.replace(/^Plans:\s*/, "We offer ")}`;
    }
    return answer;
}

export function getPlatformAnswer(topicOrQuestion = "general", context = {}) {
    const result = getBundleAnswer(topicOrQuestion);
    if (result?.answer) {
        return {
            ...result,
            answer: formatReplyForQuestion(result.id, result.answer, topicOrQuestion),
        };
    }
    const matched = matchPlatformQuestion(topicOrQuestion);
    if (matched) {
        return {
            ...matched,
            answer: formatReplyForQuestion(matched.id, matched.answer, topicOrQuestion),
        };
    }
    return { id: "general", answer: PLATFORM_DEFAULT_REPLY, title: "ZiricAI" };
}

export function getPlatformKnowledgeSummary(options = {}) {
    return getBundleSummary(options);
}
