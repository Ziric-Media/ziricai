/**
 * SNET — Discover / Status presence metrics (profile views, post reactions, interested leads).
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";

const metricsCol = createNetworkCollection(NETWORK_COLLECTIONS.PRESENCE_METRICS);

function emptyMetrics(companyId) {
    return {
        companyId,
        profileViews: 0,
        postReactions: 0,
        leadsInterested: 0,
        profileBoostUntil: null,
        updatedAt: new Date().toISOString(),
    };
}

export async function getPresenceMetrics(companyId) {
    const row = await metricsCol.get(String(companyId || ""));
    if (!row) return emptyMetrics(companyId);
    return {
        ...emptyMetrics(companyId),
        ...row,
        companyId,
    };
}

async function bump(companyId, field, by = 1) {
    const cur = await getPresenceMetrics(companyId);
    const next = { ...cur, [field]: Math.max(0, Number(cur[field] || 0) + by), updatedAt: new Date().toISOString() };
    await metricsCol.put(companyId, next, { merge: false });
    return next;
}

export async function recordProfileView(companyId) {
    return bump(companyId, "profileViews");
}

export async function recordPostReaction(companyId, _postId) {
    return bump(companyId, "postReactions");
}

export async function recordLeadInterested(companyId) {
    return bump(companyId, "leadsInterested");
}

export async function setProfileBoostUntil(companyId, untilIso) {
    const cur = await getPresenceMetrics(companyId);
    const next = { ...cur, profileBoostUntil: untilIso || null, updatedAt: new Date().toISOString() };
    await metricsCol.put(companyId, next, { merge: false });
    return next;
}

export function clearPresenceMetricsForTests() {
    metricsCol.clearMemory();
}
