/**
 * SN-02 — in-app reader copy in Sarah's voice (from RSS facts, no outbound read required).
 */

import { decodeEntities } from "./sarahNewsRss.js";

export const MIN_STORY_DETAIL_CHARS = 80;
const MAX_DETAIL_FOR_BODY = 1400;
const MAX_BODY_SENTENCES = 4;
const MAX_DETAIL_FOR_READER = 24_000;
const MAX_READER_BODY_SENTENCES = 80;

function splitSentences(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    return clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) || [clean];
}

/**
 * @param {{ headline?: string, summary?: string, description?: string }} story
 */
export function storyHasPublishableDetail(story) {
    const headline = String(story.headline || "").trim();
    const summary = String(story.summary ?? story.description ?? "").trim();
    if (!headline || summary.length < MIN_STORY_DETAIL_CHARS) return false;

    const normTitle = headline.replace(/\s+/g, " ").toLowerCase();
    const normSum = summary.replace(/\s+/g, " ").toLowerCase();
    if (normSum === normTitle) return false;
    if (normSum.startsWith(normTitle) && summary.length < headline.length + 40) return false;

    const sentences = splitSentences(summary);
    if (!sentences.length) return false;
    const longest = sentences.reduce((a, s) => Math.max(a, s.length), 0);
    if (longest < 50 && summary.length < MIN_STORY_DETAIL_CHARS + 20) return false;

    return true;
}

/**
 * @param {{ headline?: string, summary?: string, region?: string|null }} story
 * @returns {string|null} null when feed detail is too thin to publish
 */
export function composeSarahArticleBody(story) {
    if (!storyHasPublishableDetail(story)) return null;

    const headline = decodeEntities(story.headline || "Today's story");
    let summary = decodeEntities(story.summary || "");
    if (summary.length > MAX_DETAIL_FOR_BODY) {
        summary = `${summary.slice(0, MAX_DETAIL_FOR_BODY).replace(/\s+\S*$/, "").trim()}…`;
    }
    const sentences = splitSentences(summary).slice(0, MAX_BODY_SENTENCES);
    const lead = sentences[0] || summary;
    const rest = sentences.slice(1, 3).join(" ");

    const regionNote =
        story.region === "za"
            ? "For South African readers, I'll keep the local angle in mind as this develops."
            : story.region === "zw"
              ? "This one matters for Zimbabwe and the wider region — I'll watch for follow-up reporting."
              : "";

    const paragraphs = [`Here's what I'm seeing: ${lead}`];
    if (rest && rest.length >= 40) {
        paragraphs.push(`What else is known so far: ${rest}`);
    }
    if (regionNote) paragraphs.push(regionNote);
    paragraphs.push(
        "This briefing is Sarah's summary of verified reporting. It is not legal or financial advice; use your judgment before you act on any of it."
    );

    return paragraphs.join("\n\n");
}

/**
 * Full in-app article (story room) — uses the complete feed detail, not the home briefing cap.
 * @param {{ headline?: string, summary?: string, description?: string, region?: string|null }} story
 */
export function composeSarahArticleBodyFull(story) {
    if (!storyHasPublishableDetail(story)) return null;

    const headline = decodeEntities(story.headline || "Today's story");
    let summary = decodeEntities(story.summary ?? story.description ?? "");
    if (summary.length > MAX_DETAIL_FOR_READER) {
        summary = `${summary.slice(0, MAX_DETAIL_FOR_READER).replace(/\s+\S*$/, "").trim()}…`;
    }
    const sentences = splitSentences(summary).slice(0, MAX_READER_BODY_SENTENCES);
    if (!sentences.length) return composeSarahArticleBody(story);

    const regionNote =
        story.region === "za"
            ? "For South African readers, I'll keep the local angle in mind as this develops."
            : story.region === "zw"
              ? "This one matters for Zimbabwe and the wider region — I'll watch for follow-up reporting."
              : "";

    const paragraphs = [];
    if (sentences[0]) paragraphs.push(`Here's what I'm seeing: ${sentences[0]}`);
    const body = sentences.slice(1);
    if (body.length) {
        const chunkSize = 4;
        for (let i = 0; i < body.length; i += chunkSize) {
            paragraphs.push(body.slice(i, i + chunkSize).join(" "));
        }
    }
    if (regionNote) paragraphs.push(regionNote);
    paragraphs.push(
        "This briefing is Sarah's summary of verified reporting. It is not legal or financial advice; use your judgment before you act on any of it."
    );

    return paragraphs.join("\n\n");
}

/**
 * Prefer a wide hero from BBC thumbnail URLs.
 * @param {string|null} imageUrl
 */
export function heroImageUrl(imageUrl) {
    if (!imageUrl) return null;
    const u = String(imageUrl);
    if (u.includes("ichef.bbci.co.uk") && u.includes("/standard/240/")) {
        return u.replace("/standard/240/", "/standard/976/");
    }
    if (u.includes("ichef.bbci.co.uk") && u.includes("/240/")) {
        return u.replace("/240/", "/976/");
    }
    return u;
}