/**
 * SWI-M1 — durable World Intelligence Memory (Firestore Admin, platform-scoped).
 */
import { getAdminFirestore } from "../../database/firestoreAdmin.js";
import { useAdminBackend } from "../../database/firestoreClient.js";
import { getConfiguredStorageBackend } from "../../storage/storageAdapter.js";
import {
    platformSarahWorldMemoryEntityPath,
    platformSarahWorldMemoryObservationPath,
    platformSarahWorldMemoryObservationsCollectionPath,
    platformSarahWorldMemoryTimelinePath,
    platformSarahWorldMemoryTimelineCollectionPath,
    platformSarahWorldMemoryEntitiesCollectionPath,
    platformSarahWorldMemoryGraphEdgePath,
    platformSarahWorldMemoryGraphCollectionPath,
    platformSarahWorldMemoryTrendPath,
    platformSarahWorldMemoryTrendsCollectionPath,
} from "../../database/schema.js";

export function worldMemoryPersistenceEnabled() {
    return getConfiguredStorageBackend() === "firestore" && useAdminBackend();
}

function db() {
    return getAdminFirestore();
}

/**
 * @param {string} subjectKey
 */
export async function loadWorldMemoryObservation(subjectKey) {
    if (!worldMemoryPersistenceEnabled()) return null;
    const snap = await db().doc(platformSarahWorldMemoryObservationPath(subjectKey)).get();
    if (!snap.exists) return null;
    return snap.data();
}

/**
 * @param {string} subjectKey
 * @param {object} row
 */
export async function saveWorldMemoryObservation(subjectKey, row) {
    if (!worldMemoryPersistenceEnabled()) return false;
    await db().doc(platformSarahWorldMemoryObservationPath(subjectKey)).set(row, { merge: true });
    return true;
}

/**
 * @param {{ domain?: string, region?: string, query?: string, limit?: number }} opts
 */
export async function queryWorldMemoryObservations(opts = {}) {
    if (!worldMemoryPersistenceEnabled()) return [];
    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
    const q = String(opts.query || "").trim().toLowerCase();
    let query = db()
        .collection(platformSarahWorldMemoryObservationsCollectionPath())
        .orderBy("lastSeenAt", "desc")
        .limit(Math.min(limit * 8, 200));

    if (opts.domain) {
        query = query.where("domain", "==", opts.domain);
    } else if (opts.region) {
        query = query.where("region", "==", opts.region);
    }

    const snap = await query.get();
    let rows = snap.docs.map((d) => d.data());
    if (opts.domain && opts.region) {
        rows = rows.filter((r) => r.region === opts.region);
    }
    if (q) {
        rows = rows.filter((r) => `${r.headline || ""} ${r.summary || ""}`.toLowerCase().includes(q));
    }
    rows.sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
    return rows.slice(0, limit);
}

/**
 * @param {object} timelineRow
 */
export async function appendWorldMemoryTimelineEvent(timelineRow) {
    if (!worldMemoryPersistenceEnabled() || !timelineRow?.timelineId) return false;
    await db().doc(platformSarahWorldMemoryTimelinePath(timelineRow.timelineId)).set(timelineRow, { merge: true });
    return true;
}

/**
 * @param {{ domain?: string, region?: string, query?: string, limit?: number }} opts
 */
export async function queryWorldMemoryTimeline(opts = {}) {
    if (!worldMemoryPersistenceEnabled()) return [];
    const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
    const q = String(opts.query || "").trim().toLowerCase();
    let query = db()
        .collection(platformSarahWorldMemoryTimelineCollectionPath())
        .orderBy("at", "desc")
        .limit(Math.min(limit * 6, 150));

    if (opts.domain) query = query.where("domain", "==", opts.domain);
    else if (opts.region) query = query.where("region", "==", opts.region);

    const snap = await query.get();
    let rows = snap.docs.map((d) => d.data());
    if (opts.domain && opts.region) {
        rows = rows.filter((r) => r.region === opts.region);
    }
    if (q) {
        rows = rows.filter((r) => `${r.headline || ""} ${r.summary || ""}`.toLowerCase().includes(q));
    }
    return rows.slice(0, limit);
}

/**
 * @param {string} entityId
 * @param {object} patch
 */
export async function upsertWorldMemoryEntityProfile(entityId, patch) {
    if (!worldMemoryPersistenceEnabled()) return false;
    const ref = db().doc(platformSarahWorldMemoryEntityPath(entityId));
    const snap = await ref.get();
    const prev = snap.exists ? snap.data() : null;
    const observationCount = (prev?.observationCount || 0) + (patch.incrementObservations || 0);
    const entityRefs = new Set([...(prev?.relatedSubjectKeys || []), ...(patch.relatedSubjectKeys || [])]);
    await ref.set(
        {
            entityId,
            kind: patch.kind || prev?.kind || "topic",
            label: patch.label || prev?.label || entityId,
            domain: patch.domain || prev?.domain || null,
            region: patch.region || prev?.region || null,
            lastHeadline: patch.lastHeadline || prev?.lastHeadline || null,
            lastSeenAt: patch.lastSeenAt || prev?.lastSeenAt || new Date().toISOString(),
            observationCount: Math.max(observationCount, 1),
            relatedSubjectKeys: [...entityRefs].slice(-40),
            updatedAt: new Date().toISOString(),
        },
        { merge: true }
    );
    return true;
}

/**
 * @param {{ query?: string, limit?: number }} [opts]
 */
export async function queryWorldMemoryEntityProfiles(opts = {}) {
    if (!worldMemoryPersistenceEnabled()) return [];
    const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 40);
    const q = String(opts.query || "").trim().toLowerCase();
    const snap = await db()
        .collection(platformSarahWorldMemoryEntitiesCollectionPath())
        .orderBy("lastSeenAt", "desc")
        .limit(80)
        .get();
    let rows = snap.docs.map((d) => d.data());
    if (q) {
        rows = rows.filter(
            (r) =>
                `${r.label || ""} ${r.entityId || ""} ${r.lastHeadline || ""}`.toLowerCase().includes(q) ||
                (r.region && q.includes(String(r.region).toLowerCase()))
        );
    }
    return rows.slice(0, limit);
}

/**
 * @param {object} edgeRow
 */
export async function appendWorldMemoryGraphEdge(edgeRow) {
    if (!worldMemoryPersistenceEnabled() || !edgeRow?.edgeId) return false;
    await db().doc(platformSarahWorldMemoryGraphEdgePath(edgeRow.edgeId)).set(edgeRow, { merge: true });
    return true;
}

/**
 * @param {{ fromNodeId?: string, toNodeId?: string, edgeType?: string, query?: string, limit?: number }} opts
 */
export async function queryWorldMemoryGraphEdges(opts = {}) {
    if (!worldMemoryPersistenceEnabled()) return [];
    const limit = Math.min(Math.max(Number(opts.limit) || 24, 1), 100);
    const snap = await db()
        .collection(platformSarahWorldMemoryGraphCollectionPath())
        .orderBy("at", "desc")
        .limit(Math.min(limit * 6, 180))
        .get();
    let rows = snap.docs.map((d) => d.data());
    if (opts.fromNodeId) rows = rows.filter((r) => r.fromNodeId === opts.fromNodeId);
    if (opts.toNodeId) rows = rows.filter((r) => r.toNodeId === opts.toNodeId);
    if (opts.edgeType) rows = rows.filter((r) => r.edgeType === opts.edgeType);
    const q = String(opts.query || "").trim().toLowerCase();
    if (q) {
        rows = rows.filter((r) => `${r.headline || ""} ${r.fromNodeId} ${r.toNodeId}`.toLowerCase().includes(q));
    }
    return rows.slice(0, limit);
}

/**
 * @param {string} trendId
 */
export async function loadWorldMemoryTrend(trendId) {
    if (!worldMemoryPersistenceEnabled()) return null;
    const snap = await db().doc(platformSarahWorldMemoryTrendPath(trendId)).get();
    if (!snap.exists) return null;
    return snap.data();
}

/**
 * @param {string} trendId
 * @param {object} row
 */
export async function saveWorldMemoryTrend(trendId, row) {
    if (!worldMemoryPersistenceEnabled()) return false;
    await db().doc(platformSarahWorldMemoryTrendPath(trendId)).set(row, { merge: true });
    return true;
}

/**
 * @param {{ query?: string, region?: string, corroboratedOnly?: boolean, limit?: number }} opts
 */
export async function queryWorldMemoryTrends(opts = {}) {
    if (!worldMemoryPersistenceEnabled()) return [];
    const limit = Math.min(Math.max(Number(opts.limit) || 12, 1), 60);
    const snap = await db()
        .collection(platformSarahWorldMemoryTrendsCollectionPath())
        .orderBy("lastSeenAt", "desc")
        .limit(Math.min(limit * 8, 120))
        .get();
    let rows = snap.docs.map((d) => d.data());
    if (opts.region) rows = rows.filter((r) => r.region === opts.region);
    if (opts.corroboratedOnly) rows = rows.filter((r) => r.corroborated === true);
    const q = String(opts.query || "").trim().toLowerCase();
    if (q) {
        rows = rows.filter(
            (r) =>
                `${r.label || ""} ${r.headlineSample || ""}`.toLowerCase().includes(q) ||
                (r.region && q.includes(String(r.region).toLowerCase()))
        );
    }
    return rows.slice(0, limit);
}