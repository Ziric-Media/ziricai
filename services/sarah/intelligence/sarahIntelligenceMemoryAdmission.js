/**
 * SWI-M0 — admission gate before a signal enters Intelligence Memory.
 */
import { createHash } from "node:crypto";
import { SARAH_MEMORY_DOMAINS } from "./sarahIntelligencePillars.js";

const ALLOWED_PUBLISHERS = new Set([
    "BBC News",
    "Reuters",
    "News24",
    "Fin24",
    "Daily Maverick",
    "Al Jazeera",
    "France 24",
    "The Guardian",
    "CNN",
    "Africanews",
    "SABC News",
    "Moneyweb",
    "IOL",
]);

const MIN_SUMMARY_CHARS = 80;
const MIN_HEADLINE_CHARS = 12;

/**
 * @param {{ headline?: string, summary?: string, publisher?: string, link?: string|null, region?: string|null, storyId?: string, publishedAt?: number|null }} input
 */
export function buildMemorySubjectKey(input) {
    const seed = String(input.storyId || input.link || `${input.headline}|${input.publisher}`).trim();
    return `mem_${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`;
}

/**
 * @param {{ headline?: string, summary?: string, publisher?: string, link?: string|null, region?: string|null, interest?: string|null }} input
 * @returns {{ admit: boolean, domain: string, subjectKey: string, confidence: string, reasons: string[] }}
 */
export function evaluateMemoryAdmission(input = {}) {
    const reasons = [];
    const headline = String(input.headline || "").trim();
    const summary = String(input.summary || "").trim();
    const publisher = String(input.publisher || "").trim();

    if (headline.length < MIN_HEADLINE_CHARS) reasons.push("headline_too_short");
    if (summary.length < MIN_SUMMARY_CHARS) reasons.push("summary_too_thin");
    if (!publisher) reasons.push("publisher_missing");

    const subjectKey = buildMemorySubjectKey(input);
    let domain = "global_events";

    const hay = `${headline} ${summary}`.toLowerCase();
    if (input.interest === "business" || input.interest === "mining" || /\bmining|commodit|inflation|market|gdp|budget\b/.test(hay)) {
        domain = "economy";
    } else if (input.interest === "tech" || /\bai\b|artificial intelligence|software|startup|chip\b/.test(hay)) {
        domain = "technology";
    } else if (/\belection|government|minister|parliament|war|conflict|sanction\b/.test(hay)) {
        domain = "global_events";
    } else if (input.interest === "mining" || /\bmining|mine\b/.test(hay)) {
        domain = "industry";
    } else if (SARAH_MEMORY_DOMAINS.includes(String(input.interest || ""))) {
        domain = input.interest;
    }

    const publisherTier = ALLOWED_PUBLISHERS.has(publisher) ? "allow_list" : "other";
    if (publisherTier === "other") reasons.push("publisher_not_on_allow_list");

    const admit = reasons.length === 0 || (reasons.length === 1 && reasons[0] === "publisher_not_on_allow_list");
    const confidence = publisherTier === "allow_list" ? "medium" : "low";

    return {
        admit,
        domain,
        subjectKey,
        confidence,
        reasons,
        publisherTier,
    };
}