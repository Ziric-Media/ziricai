/**
 * Persist raw events — memory backend + Firestore tenant path.
 * companies/{companyId}/events/{eventId}
 */
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

const EVENT_TTL_DAYS = 90;
const eventsRepo = new TenantRepository(TENANT_COLLECTIONS.EVENTS);

/** @type {Map<string, Set<string>>} companyId → event ids (memory index) */
const memoryEventIndex = new Map();

function pruneExpired(record) {
    const ts = new Date(record.timestamp || record.createdAt).getTime();
    const cutoff = Date.now() - EVENT_TTL_DAYS * 24 * 60 * 60 * 1000;
    return ts >= cutoff;
}

/**
 * @param {import('./eventTypes.js').ZiricEvent} event
 */
export async function persistEvent(event) {
    const saved = await eventsRepo.set(event.companyId, event.id, {
        ...event,
        expiresAt: new Date(Date.now() + EVENT_TTL_DAYS * 86400000).toISOString(),
    });

    if (!memoryEventIndex.has(event.companyId)) {
        memoryEventIndex.set(event.companyId, new Set());
    }
    memoryEventIndex.get(event.companyId).add(event.id);
    return saved;
}

/**
 * List recent events for a company (paginated).
 * @param {string} companyId
 * @param {{ limit?: number, cursor?: string, type?: string }} [options]
 */
export async function listEvents(companyId, { limit = 50, cursor = null, type = null } = {}) {
    const max = Math.min(Math.max(limit, 1), 200);
    let items = await eventsRepo.list(companyId, {
        max: max + 50,
        orderByField: "timestamp",
    });

    items = items.filter(pruneExpired);
    if (type) items = items.filter((e) => e.type === type);

    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let startIdx = 0;
    if (cursor) {
        const idx = items.findIndex((e) => e.id === cursor);
        startIdx = idx >= 0 ? idx + 1 : 0;
    }

    const page = items.slice(startIdx, startIdx + max);
    const nextCursor = page.length === max ? page[page.length - 1]?.id : null;

    return {
        items: page,
        nextCursor,
        total: items.length,
        hasMore: Boolean(nextCursor),
    };
}

export async function getEvent(companyId, eventId) {
    return eventsRepo.get(companyId, eventId);
}

export { EVENT_TTL_DAYS };
