/**
 * SWI-M2 — emergent trend objects with corroboration gating.
 */
import { deriveEntityRefsFromObservation } from "./sarahIntelligenceEntityProfiles.js";
import { evaluateMemoryAdmission } from "./sarahIntelligenceMemoryAdmission.js";
import { evaluateTrendCorroboration } from "./sarahIntelligenceCorroborationPolicy.js";
import {
    loadWorldMemoryTrend,
    saveWorldMemoryTrend,
    queryWorldMemoryTrends,
    worldMemoryPersistenceEnabled,
} from "./sarahIntelligenceMemoryPersistence.js";
import { sarahIntelligenceGraphActive } from "./sarahIntelligenceGraphService.js";

/** @type {Map<string, object>} */
const trendsById = new Map();

/**
 * @param {object} ref - entity ref from deriveEntityRefsFromObservation
 * @param {string|null} region
 */
export function buildTrendId(ref, region = null) {
    const regionPart = region ? String(region).toLowerCase() : "global";
    return `trend_${ref.entityId}_${regionPart}`;
}

/**
 * @param {object} observation
 */
export async function updateTrendsForObservation(observation) {
    if (!sarahIntelligenceGraphActive() || !observation?.subjectKey) {
        return { updated: 0, skipped: true };
    }

    const topicRefs = deriveEntityRefsFromObservation(observation).filter((r) => r.kind === "topic");
    if (!topicRefs.length) return { updated: 0, skipped: false };

    const region = observation.region ? String(observation.region).toLowerCase() : null;
    const ts = observation.lastSeenAt || new Date().toISOString();
    const updated = [];

    for (const ref of topicRefs) {
        const trendId = buildTrendId(ref, region);
        const prev =
            trendsById.get(trendId) ||
            (worldMemoryPersistenceEnabled() ? await loadWorldMemoryTrend(trendId) : null);

        const publishers = new Set(prev?.publishers || []);
        if (observation.publisher) publishers.add(String(observation.publisher).trim());

        const subjectKeys = new Set([...(prev?.subjectKeys || []), observation.subjectKey]);
        const allowListPublishers = [...publishers].filter((p) => {
            const fake = evaluateMemoryAdmission({ headline: "x", summary: "y".repeat(80), publisher: p });
            return fake.publisherTier === "allow_list";
        });

        const corroboration = evaluateTrendCorroboration({
            publishers: [...publishers],
            allowListPublishers,
        });

        const row = {
            trendId,
            label: ref.label,
            entityId: ref.entityId,
            region,
            domain: "trends",
            subjectKeys: [...subjectKeys].slice(-30),
            publishers: [...publishers].slice(-12),
            evidenceCount: subjectKeys.size,
            headlineSample: observation.headline || prev?.headlineSample || null,
            firstSeenAt: prev?.firstSeenAt || ts,
            lastSeenAt: ts,
            corroborationTier: corroboration.tier,
            strength: corroboration.strength,
            corroborated: corroboration.corroborated,
            publisherCount: corroboration.publisherCount,
        };

        trendsById.set(trendId, row);
        await saveWorldMemoryTrend(trendId, row);
        updated.push(row);
    }

    return { updated: updated.length, trends: updated.map((t) => t.trendId) };
}

/**
 * @param {{ query?: string, region?: string, corroboratedOnly?: boolean, limit?: number }} [opts]
 */
export async function listIntelligenceTrends(opts = {}) {
    const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
    const persisted = await queryWorldMemoryTrends({ ...opts, limit });
    if (persisted.length) return persisted.slice(0, limit);

    const q = String(opts.query || "").trim().toLowerCase();
    let rows = [...trendsById.values()];
    if (opts.region) rows = rows.filter((r) => r.region === opts.region);
    if (opts.corroboratedOnly) rows = rows.filter((r) => r.corroborated === true);
    if (q) {
        rows = rows.filter(
            (r) =>
                `${r.label || ""} ${r.headlineSample || ""} ${r.entityId || ""}`.toLowerCase().includes(q) ||
                (r.region && q.includes(String(r.region).toLowerCase()))
        );
    }
    rows.sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
    return rows.slice(0, limit);
}

export function clearIntelligenceTrendsForTests() {
    trendsById.clear();
}