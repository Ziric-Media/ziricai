/**
 * MC-PO-03 — platform-wide activity events (PII-minimized).
 */
import { randomUUID } from "node:crypto";
import { PLATFORM_GOVERNANCE } from "../database/schema.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";

const eventsCol = createNetworkCollection(PLATFORM_GOVERNANCE.EVENTS);
const dailyCol = createNetworkCollection(PLATFORM_GOVERNANCE.EVENT_DAILY);

function utcDayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

/**
 * @param {string} type e.g. consumer.registered
 * @param {object} payload minimal metadata (no message bodies)
 */
export async function recordPlatformEvent(type, payload = {}) {
    const eventType = String(type || "").trim();
    if (!eventType) return null;
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const row = {
        eventId: id,
        type: eventType,
        payload: payload && typeof payload === "object" ? payload : {},
        createdAt,
        schemaVersion: 1,
    };
    await eventsCol.put(id, row, { merge: false });
    const dayKey = utcDayKey();
    const dailyId = `${dayKey}__${eventType.replace(/[^a-z0-9._-]/gi, "_")}`;
    const existing = (await dailyCol.get(dailyId)) || { dayKey, eventType, count: 0 };
    await dailyCol.put(
        dailyId,
        {
            ...existing,
            dayKey,
            eventType,
            count: Number(existing.count || 0) + 1,
            updatedAt: createdAt,
            schemaVersion: 1,
        },
        { merge: false }
    );
    return row;
}

export async function countPlatformEventsSince(sinceIso) {
    const since = new Date(sinceIso).getTime();
    const rows = await eventsCol.list({ limit: 2000 });
    return rows.filter((r) => new Date(r.createdAt).getTime() >= since).length;
}

export async function getPlatformActivityOverview({ days = 30 } = {}) {
    const windowDays = Math.min(Math.max(Number(days) || 30, 1), 90);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - windowDays);
    const rows = await eventsCol.list({ limit: 2000 });
    const inWindow = rows.filter((r) => new Date(r.createdAt) >= start);
    const byType = {};
    for (const r of inWindow) {
        byType[r.type] = (byType[r.type] || 0) + 1;
    }
    return {
        generatedAt: new Date().toISOString(),
        windowDays,
        totalEvents: inWindow.length,
        byType,
        partial: rows.length >= 2000,
        note: rows.length >= 2000 ? "Event list capped at 2000; totals are partial." : null,
    };
}

export function clearPlatformEventsForTests() {
    eventsCol.clearMemory();
    dailyCol.clearMemory();
}
