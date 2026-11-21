/**
 * SWI-M0 — Intelligence Memory store (memory adapter; replace with Firestore in M1).
 */
import { evaluateMemoryAdmission, buildMemorySubjectKey } from "./sarahIntelligenceMemoryAdmission.js";

/** @type {Map<string, object>} */
const observations = new Map();

/**
 * @param {object} input
 * @param {{ pillar?: string }} [meta]
 */
export function recordIntelligenceObservation(input, meta = {}) {
    const admission = evaluateMemoryAdmission(input);
    if (!admission.admit) {
        return { ok: false, stored: false, admission };
    }

    const subjectKey = admission.subjectKey || buildMemorySubjectKey(input);
    const ts = new Date().toISOString();
    const prev = observations.get(subjectKey);
    const row = {
        subjectKey,
        domain: admission.domain,
        confidence: admission.confidence,
        pillar: meta.pillar || "open_web",
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
    observations.set(subjectKey, row);
    return { ok: true, stored: true, admission, observation: row };
}

/**
 * @param {{ domain?: string, region?: string, query?: string, limit?: number }} [opts]
 */
export function listIntelligenceObservations(opts = {}) {
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
    const q = String(opts.query || "").trim().toLowerCase();
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
export function getIntelligenceObservation(subjectKey) {
    return observations.get(String(subjectKey || "").trim()) || null;
}

export function clearIntelligenceMemoryForTests() {
    observations.clear();
}

/**
 * Compare stored context with a fresh headline (M0 — same subject only).
 * @param {string} subjectKey
 * @param {{ headline?: string, summary?: string }} current
 */
export function compareWithMemory(subjectKey, current = {}) {
    const prior = getIntelligenceObservation(subjectKey);
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