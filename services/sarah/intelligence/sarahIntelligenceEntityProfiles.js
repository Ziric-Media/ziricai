/**
 * SWI-M1 — lightweight entity profiles derived from admitted observations.
 */
import { upsertWorldMemoryEntityProfile, worldMemoryPersistenceEnabled } from "./sarahIntelligenceMemoryPersistence.js";

const TOPIC_PATTERNS = [
    { entityId: "topic_mining", label: "Mining & commodities", re: /\bmining|platinum|gold mine|commodit|mineral\b/i },
    { entityId: "topic_zimbabwe", label: "Zimbabwe", re: /\bzimbabwe|harare|bulawayo|zvishavane\b/i },
    { entityId: "topic_south_africa", label: "South Africa", re: /\bsouth africa|\beskom\b|\bcape town\b|\bjohannesburg\b/i },
    { entityId: "topic_tech_ai", label: "Technology & AI", re: /\bai\b|artificial intelligence|startup|software\b/i },
    { entityId: "topic_energy", label: "Energy", re: /\benergy|power grid|renewable|oil|gas\b/i },
];

/**
 * @param {object} observation
 * @returns {Array<{ entityId: string, kind: string, label: string, region?: string|null }>}
 */
export function deriveEntityRefsFromObservation(observation = {}) {
    const hay = `${observation.headline || ""} ${observation.summary || ""}`;
    const refs = [];
    const region = observation.region ? String(observation.region).trim().toLowerCase() : null;
    if (region) {
        refs.push({
            entityId: `region_${region}`,
            kind: "region",
            label: region.toUpperCase(),
            region,
        });
    }
    for (const p of TOPIC_PATTERNS) {
        if (p.re.test(hay)) {
            refs.push({
                entityId: p.entityId,
                kind: "topic",
                label: p.label,
                region: region || null,
            });
        }
    }
    const seen = new Set();
    return refs.filter((r) => {
        if (seen.has(r.entityId)) return false;
        seen.add(r.entityId);
        return true;
    });
}

/**
 * @param {object} observation
 */
export async function syncEntityProfilesForObservation(observation) {
    if (!observation?.subjectKey || !worldMemoryPersistenceEnabled()) return { updated: 0 };
    const refs = deriveEntityRefsFromObservation(observation);
    let updated = 0;
    for (const ref of refs) {
        const ok = await upsertWorldMemoryEntityProfile(ref.entityId, {
            kind: ref.kind,
            label: ref.label,
            region: ref.region,
            domain: observation.domain,
            lastHeadline: observation.headline,
            lastSeenAt: observation.lastSeenAt,
            incrementObservations: 1,
            relatedSubjectKeys: [observation.subjectKey],
        });
        if (ok) updated += 1;
    }
    return { updated, entityIds: refs.map((r) => r.entityId) };
}