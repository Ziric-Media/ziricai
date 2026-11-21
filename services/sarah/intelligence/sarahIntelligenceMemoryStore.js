/**
 * SWI — Intelligence Memory store (in-process + optional Firestore durability in M1).
 */
import { evaluateMemoryAdmission, buildMemorySubjectKey } from "./sarahIntelligenceMemoryAdmission.js";
import {
    loadWorldMemoryObservation,
    queryWorldMemoryObservations,
    saveWorldMemoryObservation,
    worldMemoryPersistenceEnabled,
} from "./sarahIntelligenceMemoryPersistence.js";
import { syncEntityProfilesForObservation } from "./sarahIntelligenceEntityProfiles.js";
import { recordIntelligenceTimelineEvent } from "./sarahIntelligenceTimelineService.js";
import { sarahIntelligenceGraphActive, syncGraphEdgesForObservation } from "./sarahIntelligenceGraphService.js";
import { updateTrendsForObservation } from "./sarahIntelligenceTrendService.js";

/** @type {Map<string, object>} */
const observations = new Map();

/**
 * @param {object} input
 * @param {object|null} prev
 * @param {{ pillar?: string }} [meta]
 */
function buildObservationRow(input, prev, meta = {}) {
    const subjectKey =
        (input.subjectKey && String(input.subjectKey)) || buildMemorySubjectKey(input);
    const ts = new Date().toISOString();
    return {
        subjectKey,
        domain: input.domain,
        confidence: input.confidence,
        pillar: meta.pillar || input.pillar || "open_web",
        headline: String(input.headline || "").slice(0, 500),
        summary: String(input.summary || "").slice(0, 1200),
        publisher: input.publisher || null,
        link: input.link || null,
        region: input.region || null,
        storyId: input.storyId || null,
        publishedAt: input.publishedAt || null,
        firstSeenAt: prev?.firstSeenAt || ts,
        lastSeenAt: ts,
        version: (prev?.version || 0) + 1,
        sources: [
            ...(prev?.sources || []),
            { publisher: input.publisher, link: input.link, seenAt: ts },
        ].slice(-8),
    };
}

/**
 * @param {object} input
 * @param {{ pillar?: string, source?: string }} [meta]
 */
export async function recordIntelligenceObservation(input, meta = {}) {
    const admission = evaluateMemoryAdmission(input);
    if (!admission.admit) {
        return { ok: false, stored: false, admission };
    }

    const subjectKey = admission.subjectKey || buildMemorySubjectKey(input);
    const prev =
        observations.get(subjectKey) ||
        (worldMemoryPersistenceEnabled() ? await loadWorldMemoryObservation(subjectKey) : null);
    const row = buildObservationRow(
        {
            ...input,
            domain: admission.domain,
            confidence: admission.confidence,
            subjectKey,
        },
        prev,
        meta
    );
    observations.set(subjectKey, row);
    if (worldMemoryPersistenceEnabled()) {
        await saveWorldMemoryObservation(subjectKey, row);
        await recordIntelligenceTimelineEvent(row, meta);
        await syncEntityProfilesForObservation(row);
    } else {
        await recordIntelligenceTimelineEvent(row, meta);
    }
    if (sarahIntelligenceGraphActive()) {
        await syncGraphEdgesForObservation(row);
        await updateTrendsForObservation(row);
    }
    return { ok: true, stored: true, admission, observation: row };
}

/**
 * @param {{ domain?: string, region?: string, query?: string, limit?: number }} [opts]
 */
export async function listIntelligenceObservations(opts = {}) {
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
    const q = String(opts.query || "").trim().toLowerCase();

    const persisted = await queryWorldMemoryObservations(opts);
    if (persisted.length) return persisted;
    // Firestore may be enabled but still warming — keep serving in-process rows until data exists.

    let rows = [...observations.values()];
    if (opts.domain) rows = rows.filter((r) => r.domain === opts.domain);
    if (opts.region) rows = rows.filter((r) => r.region === opts.region);
    if (q) {
        rows = rows.filter((r) => `${r.headline} ${r.summary}`.toLowerCase().includes(q));
    }
    rows.sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
    return rows.slice(0, limit);
}

/**
 * @param {string} subjectKey
 */
export async function getIntelligenceObservation(subjectKey) {
    const key = String(subjectKey || "").trim();
    if (!key) return null;
    if (observations.has(key)) return observations.get(key);
    if (worldMemoryPersistenceEnabled()) {
        const row = await loadWorldMemoryObservation(key);
        if (row) observations.set(key, row);
        return row;
    }
    return null;
}

export function clearIntelligenceMemoryForTests() {
    observations.clear();
}

/**
 * Compare stored context with a fresh headline (same subject cluster).
 * @param {string} subjectKey
 * @param {{ headline?: string, summary?: string }} current
 */
export async function compareWithMemory(subjectKey, current = {}) {
    const prior = await getIntelligenceObservation(subjectKey);
    if (!prior) {
        return { hasHistory: false, prior: null, current };
    }
    const sameHeadline = String(prior.headline || "").trim() === String(current.headline || "").trim();
    return {
        hasHistory: true,
        prior,
        current,
        unchanged: sameHeadline,
        priorFirstSeen: prior.firstSeenAt,
        priorVersion: prior.version,
    };
}