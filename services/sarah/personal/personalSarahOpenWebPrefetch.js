/**
 * Prefetch open-web snippets for general knowledge questions (not news/trend compares).
 */
import {
    formatOpenWebSearchForModel,
    personalSarahOpenWebEnabled,
    searchOpenWeb,
} from "../openWeb/openWebSearchService.js";
import { shouldPrefetchWorldIntelligence } from "./personalSarahWorldIntelPrefetch.js";

const OPEN_WEB_TRIGGERS =
    /\bwhat is\b|\bwho is\b|\bwho was\b|\bhow to\b|\bhow do i\b|\bdefine\b|\bmeaning of\b|\bweather\b|\bpopulation of\b|\bcapital of\b|\bexchange rate\b|\bconvert\b|\bwhen did\b|\bwhere is\b|\bprice of\b|\bscore\b|\brecipe for\b|\bwikipedia\b/i;

export function shouldPrefetchOpenWeb(message = "") {
    const m = String(message || "");
    if (!personalSarahOpenWebEnabled()) return false;
    if (shouldPrefetchWorldIntelligence(m)) return false;
    if (/\bnews\b|\bheadlines?\b|\bbreaking\b/i.test(m)) return false;
    return OPEN_WEB_TRIGGERS.test(m);
}

export function deriveOpenWebQuery(message = "") {
    return String(message || "")
        .replace(/[^\w\s'?-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
}

/**
 * @param {string} message
 */
export async function buildOpenWebPrefetchBlock(message) {
    const query = deriveOpenWebQuery(message);
    const payload = await searchOpenWeb(query, { maxResults: 5 });
    return {
        query,
        block: [
            "OPEN WEB PREFETCH — use this for your reply; do not say you lack internet access:",
            "",
            formatOpenWebSearchForModel(payload),
        ].join("\n"),
        resultCount: payload.resultCount || 0,
    };
}