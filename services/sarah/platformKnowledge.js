/**
 * Server re-export of platform knowledge loader (knowledge/*.md source of truth).
 */
export {
    CATEGORY_MANIFEST,
    PHASE_MANIFEST,
    V1_TARGET,
    V1_MODULE_MANIFEST,
    CATEGORY_ALIASES,
    KNOWLEDGE_DIR,
    parseFrontmatter,
    parseMarkdownQA,
    loadKnowledgeFile,
    loadAllKnowledgeFiles,
    normalizeQuestionText,
    scoreKnowledgeMatch,
    searchKnowledge,
    getRelatedEntries,
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
