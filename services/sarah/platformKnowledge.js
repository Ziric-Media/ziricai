/**
 * Server re-export of platform knowledge loader (knowledge/*.md source of truth).
 */
export {
    CATEGORY_MANIFEST,
    FLAT_ALIASES,
    KNOWLEDGE_DIR,
    parseMarkdownQA,
    loadKnowledgeFile,
    loadAllKnowledgeFiles,
    normalizeQuestionText,
    scoreKnowledgeMatch,
    searchKnowledge,
    getKnowledgeStats,
    getPlatformKnowledgeSummary,
    matchPlatformQuestion,
    getPlatformAnswer,
    clearKnowledgeCache,
    getPricingSummaryText,
    getDefaultPlatformReply,
    formatPrice,
    getPlan,
    getPublicPlans,
} from "../knowledge/platformKnowledgeLoader.js";

export {
    PLATFORM_DEFAULT_REPLY,
    PLATFORM_UNCLEAR_REPLY,
    PLATFORM_FAQ,
    PLATFORM_INTENTS,
    formatReplyForQuestion,
} from "../../js/shared/platformKnowledge.js";
