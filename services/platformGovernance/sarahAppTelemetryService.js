/**
 * MC-PO-06 — Sarah App client telemetry ingest + daily rollups.
 */
import { PLATFORM_GOVERNANCE } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

const dailyCol = createNetworkCollection(PLATFORM_GOVERNANCE.APP_TELEMETRY_DAILY);

function utcDayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

const ALLOWED_EVENTS = new Set([
    "session.start",
    "install.prompted",
    "install.accepted",
    "error.client",
    "login.success",
    "login.failure",
]);

/**
 * @param {string} uid
 * @param {{ type: string, appVersion?: string, platform?: string, meta?: object }} payload
 */
export async function ingestSarahAppTelemetry(uid, payload = {}) {
    const type = String(payload.type || "").trim();
    if (!ALLOWED_EVENTS.has(type)) return { accepted: false, reason: "EVENT_TYPE_INVALID" };
    const dayKey = utcDayKey();
    const docId = dayKey;
    const existing = (await dailyCol.get(docId)) || {
        dayKey,
        counts: {},
        uniqueUids: {},
        schemaVersion: 1,
    };
    const counts = { ...(existing.counts || {}) };
    counts[type] = Number(counts[type] || 0) + 1;
    const uniqueUids = { ...(existing.uniqueUids || {}) };
    if (uid) uniqueUids[uid] = true;
    const row = {
        ...existing,
        dayKey,
        counts,
        uniqueSessions: Object.keys(uniqueUids).length,
        lastEventAt: new Date().toISOString(),
        lastAppVersion: payload.appVersion || existing.lastAppVersion || null,
        lastPlatform: payload.platform || existing.lastPlatform || null,
        schemaVersion: 1,
    };
    await dailyCol.put(docId, row, { merge: false });
    return { accepted: true, dayKey };
}

export async function getSarahAppMonitorOverview({ days = 7 } = {}) {
    const window = Math.min(Math.max(Number(days) || 7, 1), 30);
    const rows = await dailyCol.list({ limit: 60 });
    const sorted = rows.sort((a, b) => String(b.dayKey).localeCompare(String(a.dayKey))).slice(0, window);
    const totals = {};
    for (const row of sorted) {
        for (const [k, v] of Object.entries(row.counts || {})) {
            totals[k] = Number(totals[k] || 0) + Number(v || 0);
        }
    }
    return {
        generatedAt: new Date().toISOString(),
        windowDays: window,
        daily: sorted.map((r) => ({
            dayKey: r.dayKey,
            counts: r.counts || {},
            uniqueSessions: r.uniqueSessions || 0,
        })),
        totals,
        note: "PWA install/remove is partially observable; distinguish sessions from store downloads.",
    };
}

export function clearSarahAppTelemetryForTests() {
    dailyCol.clearMemory();
}
