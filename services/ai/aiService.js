/**
 * OpenAI orchestration facade — delegates to services/openai.js.
 */
import { askAI as openAiAsk } from "../openai.js";

export async function generateReply(message, options = {}) {
    return openAiAsk(message, options);
}

export function isAiConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
}

export function getDefaultModel() {
    return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

/** @deprecated use generateReply */
export const askAI = generateReply;
