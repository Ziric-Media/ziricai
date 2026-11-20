/**
 * SN-02b — story room payload (facts, timeline, related, sources).
 */
import { splitSentencesForStory } from "./sarahNewsStoryText.js";
import { storiesAreRelated } from "./sarahNewsSlotPolicy.js";

/**
 * @param {{ headline?: string, summary?: string, articleBody?: string }} story
 * @returns {string[]}
 */
export function extractStoryFacts(story) {
    const summary = String(story.summary || "").trim();
    const sentences = splitSentencesForStory(summary);
    const facts = sentences.slice(0, 4).map((s) => s.replace(/\s+/g, " ").trim());
    if (!facts.length && story.headline) facts.push(story.headline.trim());
    return facts;
}

/**
 * @param {{ publishedAt?: number, compiledAt?: string, storyStatus?: string }} story
 */
export function buildStoryTimeline(story) {
    const items = [];
    if (story.publishedAt) {
        items.push({
            at: new Date(story.publishedAt).toISOString(),
            label: "Published by source",
            kind: "source",
        });
    }
    items.push({
        at: story.compiledAt || new Date().toISOString(),
        label:
            story.storyStatus === "updated"
                ? "Sarah flagged new developments"
                : "Compiled into your briefing",
        kind: "sarah",
    });
    return items;
}

/**
 * @param {object} story
 * @param {object[]} pool
 * @param {{ max?: number }} [opts]
 */
export function findRelatedStories(story, pool, opts = {}) {
    const max = Math.min(Math.max(Number(opts.max) || 5, 1), 10);
    const related = [];
    for (const other of pool || []) {
        if (!other?.storyId || other.storyId === story.storyId) continue;
        if (storiesAreRelated(story, other)) related.push(other);
        if (related.length >= max) break;
    }
    return related.map((s) => ({
        storyId: s.storyId,
        headline: s.headline,
        publisher: s.publisher,
        summary: s.summary,
        imageUrl: s.imageUrl,
        link: s.link,
        sourceNote: s.sourceNote,
        storyStatus: s.storyStatus || null,
    }));
}

/**
 * @param {object} story
 * @param {object[]} related
 */
export function buildStorySources(story, related = []) {
    const sources = [];
    if (story.link) {
        sources.push({
            publisher: story.publisher || "Publisher",
            link: story.link,
            attribution: story.sourceNote || null,
            role: "primary",
        });
    }
    for (const r of related) {
        if (!r.link || sources.some((s) => s.link === r.link)) continue;
        sources.push({
            publisher: r.publisher || "Publisher",
            link: r.link,
            attribution: r.sourceNote || null,
            role: "related",
        });
        if (sources.length >= 4) break;
    }
    return sources;
}

/**
 * @param {object} story
 * @param {{ headlines?: object[], topStories?: object[], compiledAt?: string }} edition
 */
export function buildSarahNewsStoryRoom(story, edition = {}) {
    const pool = [...(edition.topStories || []), ...(edition.headlines || [])];
    const compiledAt = edition.compiledAt || new Date().toISOString();
    const enriched = { ...story, compiledAt };
    const related = findRelatedStories(enriched, pool);
    return {
        facts: extractStoryFacts(enriched),
        timeline: buildStoryTimeline(enriched),
        related,
        sources: buildStorySources(enriched, related),
        background:
            enriched.region === "za"
                ? "Sarah is tracking South African angles as reporting develops."
                : enriched.region === "zw"
                  ? "Sarah is tracking Zimbabwe and regional reporting on this story."
                  : null,
    };
}