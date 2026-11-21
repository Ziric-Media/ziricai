/**
 * SWI-M0 — ingest headline rows into Intelligence Memory (admission gated).
 */
import { recordIntelligenceObservation } from "./sarahIntelligenceMemoryStore.js";

/**
 * @param {object[]} headlines
 * @param {{ pillar?: string, source?: string }} [meta]
 */
export async function ingestHeadlinesIntoMemory(headlines = [], meta = {}) {
    let admitted = 0;
    let rejected = 0;
    const samples = [];
    for (const h of headlines) {
        const result = await recordIntelligenceObservation(
            {
                headline: h.headline,
                summary: h.summary,
                publisher: h.publisher,
                link: h.link,
                region: h.region,
                interest: h.interest,
                storyId: h.storyId,
                publishedAt: h.publishedAt,
            },
            { pillar: meta.pillar || "open_web", source: meta.source || "sarah_news" }
        );
        if (result.stored) {
            admitted += 1;
            if (samples.length < 5) samples.push(result.observation?.subjectKey);
        } else {
            rejected += 1;
        }
    }
    return { admitted, rejected, samples };
}

/**
 * Called from edition compile when SARAH_INTELLIGENCE_MEMORY_ENABLED=true.
 * @param {object} edition
 */
export async function ingestEditionIntoMemoryIfEnabled(edition) {
    const on = String(process.env.SARAH_INTELLIGENCE_MEMORY_ENABLED || "").toLowerCase() === "true";
    if (!on || !edition?.headlines) return { skipped: true };
    const headlines = [...(edition.topStories || []), ...(edition.headlines || [])];
    return ingestHeadlinesIntoMemory(headlines, { source: "sarah_news_edition" });
}