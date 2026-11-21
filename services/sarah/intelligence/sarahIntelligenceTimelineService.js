/**
 * SWI-M1 — timeline entries for intelligence memory (version / headline changes).
 */
import { appendWorldMemoryTimelineEvent, queryWorldMemoryTimeline } from "./sarahIntelligenceMemoryPersistence.js";

/** @type {Array<object>} */
const memoryTimeline = [];

/**
 * @param {object} observation
 * @param {{ source?: string, pillar?: string }} [meta]
 */
export async function recordIntelligenceTimelineEvent(observation, meta = {}) {
    if (!observation?.subjectKey) return null;
    const timelineId = `${observation.subjectKey}_v${observation.version || 1}`;
    const row = {
        timelineId,
        subjectKey: observation.subjectKey,
        version: observation.version || 1,
        headline: observation.headline,
        summary: String(observation.summary || "").slice(0, 400),
        domain: observation.domain,
        region: observation.region || null,
        publisher: observation.publisher || null,
        pillar: observation.pillar || meta.pillar || "open_web",
        source: meta.source || "memory_admission",
        at: observation.lastSeenAt || new Date().toISOString(),
    };
    memoryTimeline.unshift(row);
    if (memoryTimeline.length > 500) memoryTimeline.length = 500;
    await appendWorldMemoryTimelineEvent(row);
    return row;
}

/**
 * @param {{ domain?: string, region?: string, query?: string, limit?: number }} [opts]
 */
export async function listIntelligenceTimeline(opts = {}) {
    const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
    const firestoreRows = await queryWorldMemoryTimeline(opts);
    if (firestoreRows.length) return firestoreRows.slice(0, limit);

    const q = String(opts.query || "").trim().toLowerCase();
    let rows = [...memoryTimeline];
    if (opts.domain) rows = rows.filter((r) => r.domain === opts.domain);
    if (opts.region) rows = rows.filter((r) => r.region === opts.region);
    if (q) {
        rows = rows.filter((r) => `${r.headline} ${r.summary}`.toLowerCase().includes(q));
    }
    return rows.slice(0, limit);
}

export function clearIntelligenceTimelineForTests() {
    memoryTimeline.length = 0;
}