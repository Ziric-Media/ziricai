/**
 * SNET-05 — lightweight search analytics (spec §13 "review zero-result searches").
 * IN-PROCESS ONLY (bounded ring + counters, no user ids): resets on restart and is per-replica. Durable search
 * analytics (event stream → Analytics Service) is a follow-up; Mission Control labels this as "since last restart".
 */
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

/** @param {{ q?: string, category?: string, resultCount: number }} evt */
export function recordSearch({ q = "", category = "", resultCount }) {
    const query = String(q || "").trim().toLowerCase().slice(0, 120);
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

export function resetSearchStatsForTests() {
    state.total = 0;
    state.withQuery = 0;
    state.zeroResults = 0;
    state.recent = [];
    state.zeroByQuery.clear();
    state.startedAt = new Date().toISOString();
}
