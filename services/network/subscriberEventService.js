/**
 * Gate 5 — subscriber notification STUB (event log only).
 *
 * A business can record an announcement / notification / reminder aimed at its subscribers. The platform stores the
 * event and the audience SIZE (honouring each subscriber's My Organisations channel preferences) — it does NOT deliver
 * anything: no push, no inbox message, no per-recipient record. `status` is always `logged_only` until a delivery
 * worker (SNET-07 gap) consumes these events. Keeping recipients out of the log also keeps this privacy-neutral.
 *
 * System of record: `networkSubscriberEvents/{eventId}`.
 */
import { randomUUID } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { getOrgEntityByCompanyId } from "./networkIdentityService.js";
import { countSubscribersForOrg } from "./connectionService.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.SUBSCRIBER_EVENTS);

/** event type → the My Organisations preference channel it respects */
export const SUBSCRIBER_EVENT_TYPES = Object.freeze({
    announcement: "announcements",
    notification: "notifications",
    reminder: "reminders",
});
export const SUBSCRIBER_EVENTS_PER_DAY = 20;

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function strip(row) {
    if (!row) return null;
    const { __id, ...rest } = row;
    return rest;
}

/**
 * @param {string} companyId
 * @param {{ type?: string, title?: string, body?: string }} input
 * @param {string} [actor]
 */
export async function recordSubscriberEvent(companyId, input = {}, actor = "business") {
    const type = String(input.type || "").trim();
    const channel = SUBSCRIBER_EVENT_TYPES[type];
    if (!channel) throw err(422, "SUBSCRIBER_EVENT_TYPE_INVALID", `type must be one of: ${Object.keys(SUBSCRIBER_EVENT_TYPES).join(", ")}`);
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    if (title.length < 1 || title.length > 120) throw err(422, "SUBSCRIBER_EVENT_INVALID", "title is required (max 120 characters).");
    if (body.length > 1000) throw err(422, "SUBSCRIBER_EVENT_INVALID", "body is limited to 1000 characters.");

    const entity = await getOrgEntityByCompanyId(companyId);
    if (!entity) throw err(404, "ENTITY_NOT_FOUND", "This business has no Sarah Network presence yet.");
    if (entity.status === "suspended") throw err(403, "ENTITY_SUSPENDED", "This business is suspended on Sarah Network.");

    const today = new Date().toISOString().slice(0, 10);
    const recent = await col.list({ where: [["companyId", "==", companyId]], limit: 500 });
    if (recent.filter((e) => String(e.createdAt || "").startsWith(today)).length >= SUBSCRIBER_EVENTS_PER_DAY) {
        throw err(429, "SUBSCRIBER_EVENT_RATE_LIMITED", `At most ${SUBSCRIBER_EVENTS_PER_DAY} subscriber events per day.`);
    }

    const audience = await countSubscribersForOrg(companyId);
    const event = {
        eventId: `sevt_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
        companyId,
        snId: entity.snId,
        type,
        channel,
        title,
        body,
        audience: { subscribers: audience.subscribers, wouldReceive: audience.byChannel[channel] },
        status: "logged_only",
        delivered: 0,
        createdBy: String(actor || "business"),
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
    };
    await col.put(event.eventId, event, { merge: false });
    return event;
}

/** @param {string} companyId @param {{ limit?: number }} [opts] */
export async function listSubscriberEvents(companyId, { limit = 50 } = {}) {
    const rows = (await col.list({ where: [["companyId", "==", companyId]], limit: 500 })).map(strip);
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return rows.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 100));
}

export function clearSubscriberEventsForTests() {
    col.clearMemory();
}
