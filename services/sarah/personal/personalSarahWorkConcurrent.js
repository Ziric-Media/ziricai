/**
 * SW-02 — concurrent active Work assignment cap per tier.
 */
import { listPersonalSarahSessions, getPersonalSarahSessionForUser } from "./personalSarahSessionStore.js";
import { getConsumerEntitlements } from "../../revenue/entitlementEngine.js";

function concurrentCapForEntitlements(entitlements) {
    const fromTpl = Number(entitlements?.sarahLimits?.workConcurrentCap);
    if (Number.isFinite(fromTpl) && fromTpl > 0) return Math.min(fromTpl, 10);
    const sku = String(entitlements?.skuId || "");
    if (sku.includes(".ultimate.")) return 5;
    if (sku.includes(".premium.")) return 3;
    if (sku.includes(".plus.")) return 2;
    return 1;
}

function isActiveWorkRow(row) {
    if (!row || row.mode !== "work") return false;
    if (row.workCancelledAt || row.workCompletedAt) return false;
    return Boolean(row.workSubmittedAt) || row.assignmentStatus === "running" || row.assignmentStatus === "paused";
}

/**
 * @param {string} uid
 * @param {{ excludeSessionId?: string }} [opts]
 */
export async function getActiveWorkAssignmentCount(uid, opts = {}) {
    if (!uid) return { active: 0, cap: 1, sessions: [] };
    const entitlements = await getConsumerEntitlements(uid);
    const cap = concurrentCapForEntitlements(entitlements);
    const exclude = String(opts.excludeSessionId || "").trim();
    const summaries = await listPersonalSarahSessions(uid, { limit: 40 });
    const workRows = summaries.filter((s) => s.mode === "work");
    const activeIds = [];
    for (const row of workRows) {
        if (exclude && row.id === exclude) continue;
        if (row.workSubmittedAt && !row.workCompletedAt && !row.workCancelledAt) {
            activeIds.push(row.id);
            continue;
        }
        if (row.workPausedAt && !row.workCompletedAt && !row.workCancelledAt) {
            activeIds.push(row.id);
        }
    }
    return { active: activeIds.length, cap, sessions: activeIds };
}

/**
 * @param {string} uid
 * @param {string} sessionId
 */
export async function assertWorkConcurrentCapacity(uid, sessionId) {
    const snap = await getActiveWorkAssignmentCount(uid, { excludeSessionId: sessionId });
    if (snap.active >= snap.cap) {
        return {
            allowed: false,
            code: "WORK_CONCURRENT_CAP",
            active: snap.active,
            cap: snap.cap,
            message: `You have ${snap.active} assignment(s) in progress (limit ${snap.cap}). Finish or cancel one before submitting another.`,
        };
    }
    return { allowed: true, ...snap };
}