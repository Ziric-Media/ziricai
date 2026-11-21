/**
 * SNET-05 — lightweight search analytics (spec §13 "review zero-result searches").
 * The `recent` ring and live counters are IN-PROCESS (reset on restart, per replica).
 * Gate 5 — counters are ALSO flushed to Firestore as daily docs (`networkSearchStats/day_YYYY-MM-DD`, no user ids)
 * so they survive restarts; `getDurableSearchStats()` reads them. The merge is read-then-write per replica (not a
 * transaction), so concurrent replicas can lose a few increments — fine for ops analytics, not for billing.
 * Zero-result query text is stored only when it does not look like an email / phone number.
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { createNetworkCollection } from "./networkCollectionStore.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.SEARCH_STATS);
const FLUSH_DELAY_MS = 15_000;
const MAX_ZERO_PER_DAY = 100;
const MAX_RECENT = 200;
const MAX_ZERO = 100;

const state = {
    startedAt: new Date().toISOString(),
    total: 0,
    withQuery: 0,
    zeroResults: 0,
    /** @type {Array<{ q: string, category: string|null, results: number, at: string }>} */
    recent: [],
    /** @type {Map<string, number>} */
    zeroByQuery: new Map(),
};

function dayKey(d = new Date()) {
    return `day_${d.toISOString().slice(0, 10)}`;
}

const emptyDelta = () => ({ day: dayKey(), total: 0, withQuery: 0, zeroResults: 0, zeroByQuery: {} });
let pending = emptyDelta();
let flushTimer = null;

function looksPersonal(q) {
    return q.includes("@") || /\d{6,}/.test(q.replace(/[\s-]/g, ""));
}

function scheduleFlush() {
    if (flushTimer || !useAdminBackend()) return; // memory mode: flushed on read / explicit call only
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushSearchStats().catch((err) => console.warn("[networkSearchStats] flush failed:", err.message));
    }, FLUSH_DELAY_MS);
    flushTimer.unref?.();
}

function mergeCounts(into, from) {
    for (const [q, n] of Object.entries(from || {})) into[q] = (into[q] || 0) + n;
    const keys = Object.keys(into);
    if (keys.length > MAX_ZERO_PER_DAY) {
        keys.sort((a, b) => into[b] - into[a]).slice(MAX_ZERO_PER_DAY).forEach((k) => delete into[k]);
    }
    return into;
}

/** Write pending counters into today's (or the delta's) daily doc. Safe to call any time; never throws on empty. */
export async function flushSearchStats() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    const delta = pending;
    if (!delta.total) return { flushed: 0 };
    pending = emptyDelta();
    try {
        const id = delta.day;
        const existing = (await col.get(id)) || { total: 0, withQuery: 0, zeroResults: 0, zeroByQuery: {} };
        await col.put(
            id,
            {
                day: id.slice(4),
                total: (existing.total || 0) + delta.total,
                withQuery: (existing.withQuery || 0) + delta.withQuery,
                zeroResults: (existing.zeroResults || 0) + delta.zeroResults,
                zeroByQuery: mergeCounts({ ...(existing.zeroByQuery || {}) }, delta.zeroByQuery),
                updatedAt: new Date().toISOString(),
            },
            { merge: false }
        );
        return { flushed: delta.total };
    } catch (err) {
        // Keep the counts for the next attempt.
        pending.total += delta.total;
        pending.withQuery += delta.withQuery;
        pending.zeroResults += delta.zeroResults;
        mergeCounts(pending.zeroByQuery, delta.zeroByQuery);
        throw err;
    }
}

/**
 * Durable counters for the last `days` UTC days (includes anything not yet flushed).
 * @param {{ days?: number }} [opts]
 */
export async function getDurableSearchStats({ days = 7 } = {}) {
    await flushSearchStats().catch(() => {});
    const n = Math.min(Math.max(Number(days) || 7, 1), 31);
    const perDay = [];
    const zero = {};
    const totals = { total: 0, withQuery: 0, zeroResults: 0 };
    for (let i = 0; i < n; i++) {
        const d = new Date(Date.now() - i * 86_400_000);
        const doc = await col.get(dayKey(d));
        if (!doc) continue;
        perDay.push({ day: doc.day, total: doc.total || 0, withQuery: doc.withQuery || 0, zeroResults: doc.zeroResults || 0 });
        totals.total += doc.total || 0;
        totals.withQuery += doc.withQuery || 0;
        totals.zeroResults += doc.zeroResults || 0;
        for (const [q, c] of Object.entries(doc.zeroByQuery || {})) zero[q] = (zero[q] || 0) + c;
    }
    return {
        scope: "durable_daily",
        days: n,
        ...totals,
        perDay,
        topZeroResultQueries: Object.entries(zero)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([q, count]) => ({ q, count })),
    };
}

/** @param {{ q?: string, category?: string, resultCount: number }} evt */
export function recordSearch({ q = "", category = "", resultCount }) {
    const query = String(q || "").trim().toLowerCase().slice(0, 120);
    pending.total += 1;
    if (query) pending.withQuery += 1;
    if (query && resultCount === 0) {
        pending.zeroResults += 1;
        if (!looksPersonal(query)) {
            // Safe Firestore map key (no path separators, no reserved `__x__` form).
            const key = query.replace(/[./]/g, " ").replace(/^__/, "_");
            pending.zeroByQuery[key] = (pending.zeroByQuery[key] || 0) + 1;
        }
    }
    scheduleFlush();
    state.total += 1;
    if (query) state.withQuery += 1;
    if (query || category) {
        state.recent.unshift({ q: query, category: category || null, results: resultCount, at: new Date().toISOString() });
        if (state.recent.length > MAX_RECENT) state.recent.length = MAX_RECENT;
    }
    if (query && resultCount === 0) {
        state.zeroResults += 1;
        state.zeroByQuery.set(query, (state.zeroByQuery.get(query) || 0) + 1);
        if (state.zeroByQuery.size > MAX_ZERO) {
            const oldest = state.zeroByQuery.keys().next().value;
            state.zeroByQuery.delete(oldest);
        }
    }
}

export function getSearchStats() {
    return {
        scope: "in_process_since_restart",
        since: state.startedAt,
        total: state.total,
        withQuery: state.withQuery,
        zeroResults: state.zeroResults,
        topZeroResultQueries: [...state.zeroByQuery.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([q, count]) => ({ q, count })),
        recent: state.recent.slice(0, 20),
    };
}

/** Tests: drop in-process counters + the `recent` ring but keep the durable docs (what a process restart does). */
export function simulateSearchStatsRestartForTests() {
    pending = emptyDelta();
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    state.total = 0;
    state.withQuery = 0;
    state.zeroResults = 0;
    state.recent = [];
    state.zeroByQuery.clear();
    state.startedAt = new Date().toISOString();
}

export function resetSearchStatsForTests() {
    pending = emptyDelta();
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    col.clearMemory();
    state.total = 0;
    state.withQuery = 0;
    state.zeroResults = 0;
    state.recent = [];
    state.zeroByQuery.clear();
    state.startedAt = new Date().toISOString();
}
