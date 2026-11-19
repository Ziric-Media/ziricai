/**
 * REC-05 — recommendation attribution events (append-only).
 */
import { randomUUID } from "node:crypto";
import { attributionCol } from "./recommendationStore.js";

function strip(row) {
    const { __id, ...rest } = row;
    return rest;
}

/**
 * @param {string} type
 * @param {object} payload
 */
export async function recordRecommendationEvent(type, payload = {}) {
    const eventId = `rea_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    const row = {
        eventId,
        type,
        at: new Date().toISOString(),
        ...payload,
    };
    await attributionCol.put(eventId, row, { merge: false });
    return strip(row);
}

export async function listAttributionEventsForTests({ limit = 50 } = {}) {
    return (await attributionCol.list({ limit })).map(strip);
}