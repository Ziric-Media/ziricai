/**
 * SWI-M2 — intelligence graph edges derived from admitted observations.
 */
import { createHash } from "node:crypto";
import { deriveEntityRefsFromObservation } from "./sarahIntelligenceEntityProfiles.js";
import {
    appendWorldMemoryGraphEdge,
    queryWorldMemoryGraphEdges,
    worldMemoryPersistenceEnabled,
} from "./sarahIntelligenceMemoryPersistence.js";

/** @type {Map<string, object>} */
const edgesById = new Map();

export function sarahIntelligenceGraphActive() {
    return String(process.env.SARAH_INTELLIGENCE_GRAPH_ENABLED || "").toLowerCase() === "true";
}

function edgeId(fromNodeId, edgeType, toNodeId) {
    const seed = `${fromNodeId}|${edgeType}|${toNodeId}`;
    return `edge_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

/**
 * @param {object} observation
 */
export async function syncGraphEdgesForObservation(observation) {
    if (!sarahIntelligenceGraphActive() || !observation?.subjectKey) {
        return { synced: 0, skipped: true };
    }

    const refs = deriveEntityRefsFromObservation(observation);
    const developmentId = observation.subjectKey;
    const at = observation.lastSeenAt || new Date().toISOString();
    const created = [];

    for (const ref of refs) {
        if (ref.kind === "region") {
            const row = {
                edgeId: edgeId(ref.entityId, "located_in", developmentId),
                fromNodeId: developmentId,
                fromNodeType: "development",
                toNodeId: ref.entityId,
                toNodeType: "region",
                edgeType: "located_in",
                subjectKey: observation.subjectKey,
                headline: String(observation.headline || "").slice(0, 200),
                at,
            };
            edgesById.set(row.edgeId, row);
            created.push(row);
            await appendWorldMemoryGraphEdge(row);

            const industryRef = refs.find((r) => r.kind === "topic");
            if (industryRef) {
                const contains = {
                    edgeId: edgeId(ref.entityId, "contains_industry", industryRef.entityId),
                    fromNodeId: ref.entityId,
                    fromNodeType: "region",
                    toNodeId: industryRef.entityId,
                    toNodeType: "industry",
                    edgeType: "contains_industry",
                    subjectKey: observation.subjectKey,
                    at,
                };
                edgesById.set(contains.edgeId, contains);
                created.push(contains);
                await appendWorldMemoryGraphEdge(contains);

                const rel = {
                    edgeId: edgeId(industryRef.entityId, "related_development", developmentId),
                    fromNodeId: industryRef.entityId,
                    fromNodeType: "industry",
                    toNodeId: developmentId,
                    toNodeType: "development",
                    edgeType: "related_development",
                    subjectKey: observation.subjectKey,
                    headline: String(observation.headline || "").slice(0, 200),
                    at,
                };
                edgesById.set(rel.edgeId, rel);
                created.push(rel);
                await appendWorldMemoryGraphEdge(rel);
            }
        }
    }

    if (!refs.some((r) => r.kind === "region")) {
        for (const ref of refs.filter((r) => r.kind === "topic")) {
            const rel = {
                edgeId: edgeId(ref.entityId, "related_development", developmentId),
                fromNodeId: ref.entityId,
                fromNodeType: "industry",
                toNodeId: developmentId,
                toNodeType: "development",
                edgeType: "related_development",
                subjectKey: observation.subjectKey,
                headline: String(observation.headline || "").slice(0, 200),
                at,
            };
            edgesById.set(rel.edgeId, rel);
            created.push(rel);
            await appendWorldMemoryGraphEdge(rel);
        }
    }

    return { synced: created.length, skipped: false, edgeIds: created.map((e) => e.edgeId) };
}

/**
 * @param {{ fromNodeId?: string, toNodeId?: string, edgeType?: string, query?: string, limit?: number }} [opts]
 */
export async function listIntelligenceGraphEdges(opts = {}) {
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 80);
    const persisted = await queryWorldMemoryGraphEdges({ ...opts, limit });
    if (persisted.length) return persisted.slice(0, limit);

    const q = String(opts.query || "").trim().toLowerCase();
    let rows = [...edgesById.values()];
    if (opts.fromNodeId) rows = rows.filter((r) => r.fromNodeId === opts.fromNodeId);
    if (opts.toNodeId) rows = rows.filter((r) => r.toNodeId === opts.toNodeId);
    if (opts.edgeType) rows = rows.filter((r) => r.edgeType === opts.edgeType);
    if (q) {
        rows = rows.filter(
            (r) =>
                `${r.headline || ""} ${r.fromNodeId} ${r.toNodeId}`.toLowerCase().includes(q) ||
                r.subjectKey === q
        );
    }
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return rows.slice(0, limit);
}

/**
 * Related graph slice for recall — edges touching topic/region entity ids.
 * @param {string[]} entityIds
 * @param {{ limit?: number }} [opts]
 */
export async function graphContextForEntityIds(entityIds = [], opts = {}) {
    if (!sarahIntelligenceGraphActive() || !entityIds.length) return [];
    const limit = Math.min(Number(opts.limit) || 12, 40);
    const merged = [];
    for (const id of entityIds.slice(0, 6)) {
        const out = await listIntelligenceGraphEdges({ fromNodeId: id, limit: 8 });
        const inn = await listIntelligenceGraphEdges({ toNodeId: id, limit: 8 });
        merged.push(...out, ...inn);
    }
    const seen = new Set();
    return merged
        .filter((e) => {
            if (seen.has(e.edgeId)) return false;
            seen.add(e.edgeId);
            return true;
        })
        .slice(0, limit);
}

export function clearIntelligenceGraphForTests() {
    edgesById.clear();
}

export { worldMemoryPersistenceEnabled };