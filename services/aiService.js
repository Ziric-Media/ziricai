/**
 * OpenAI orchestration facade — re-exports services/ai/aiService.js for backward compatibility.
 * @deprecated Import from ./ai/aiService.js directly in new code.
 */
export {
    generateReply,
    isAiConfigured,
    getDefaultModel,
    askAI,
} from "./ai/aiService.js";
