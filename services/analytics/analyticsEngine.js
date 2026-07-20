/**
 * Analytics engine — ingest events and update aggregates.
 */
import { extractMetricDeltas } from "./metricsRegistry.js";
import { queueAggregateUpdate, flushPendingAggregates } from "./aggregatesStore.js";

/**
 * Ingest a single event into analytics aggregates.
 * @param {import('../events/eventTypes.js').ZiricEvent} event
 */
export async function ingestEvent(event) {
    if (!event?.companyId || !event?.type) return null;
    const deltas = extractMetricDeltas(event);
    queueAggregateUpdate(event.companyId, deltas, event.timestamp);
    return deltas;
}

/**
 * Ingest multiple events (batch import).
 * @param {import('../events/eventTypes.js').ZiricEvent[]} events
 */
export async function ingestEvents(events = []) {
    for (const event of events) {
        await ingestEvent(event);
    }
    return events.length;
}

export async function flushAnalytics() {
    return flushPendingAggregates();
}
