/**
 * Phase 2.0 — in-app notifications for Sarah Network subscriber events.
 *
 * Gate 5 logged what a business wants to tell its subscribers; Gate 6 let consumers PULL a computed feed. This adds a
 * persisted per-recipient inbox: when a business records a subscriber event, `fanOutSubscriberEvent` writes one
 * `networkNotifications/{notificationId}` doc per eligible subscriber (subscribed/connected, valid consent, channel
 * enabled in My Organisations). The consumer polls `GET /api/network/v1/my-notifications` (unread count drives the
 * Sarah App badge) and marks items read.
 *
 * Privacy:
 *   - recipients are only ever visible to themselves; the business-visible event log still holds counts, never uids;
 *   - the payload never carries `companyId`, `uid`, `createdBy` or audience counts;
 *   - at read time notifications from organisations the user is no longer subscribed to (or that blocked them) are hidden.
 * Phase 2.1 adds optional FCM push when the consumer registered a consented device token (poll unchanged as fallback).
 */
import { createHash } from "node:crypto";
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { listMyOrganisationConnections, listNotificationRecipientsForOrg } from "./connectionService.js";
import { pushForNotificationRows } from "./webPushService.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.NOTIFICATIONS);

export const NOTIFICATION_MAX_RECIPIENTS = 5000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const SCAN = 500;

function err(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

export function notificationIdFor(eventId, uid) {
    return `ntf_${createHash("sha256").update(`${eventId}|${uid}`).digest("hex").slice(0, 24)}`;
}

function view(row) {
    return {
        notificationId: row.notificationId,
        eventId: row.eventId,
        snId: row.snId,
        type: row.type,
        channel: row.channel,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        read: Boolean(row.readAt),
        readAt: row.readAt || null,
        organisation: row.organisation || { displayName: null, verified: false },
    };
}

/**
 * Persist one notification per eligible subscriber.
 * @param {{ eventId: string, companyId: string, snId: string, type: string, channel: string, title: string, body?: string, createdAt: string }} event
 * @param {{ displayName?: string|null, verified?: boolean }} [organisation]
 * @returns {Promise<{ delivered: number }>}
 */
export async function fanOutSubscriberEvent(event, organisation = {}) {
    const recipients = await listNotificationRecipientsForOrg(event.companyId, event.channel, { limit: NOTIFICATION_MAX_RECIPIENTS });
    let delivered = 0;
    const pushRows = [];
    for (const r of recipients) {
        const notificationId = notificationIdFor(event.eventId, r.uid);
        await col.put(
            notificationId,
            {
                notificationId,
                uid: r.uid,
                snId: r.snId,
                eventId: event.eventId,
                type: event.type,
                channel: event.channel,
                title: event.title,
                body: event.body || "",
                createdAt: event.createdAt,
                readAt: null,
                pushedAt: null,
                organisation: { displayName: organisation.displayName || null, verified: Boolean(organisation.verified) },
                schemaVersion: 1,
            },
            { merge: false }
        );
        pushRows.push({ uid: r.uid, notificationId, title: event.title, body: event.body || "", snId: r.snId });
        delivered += 1;
    }
    if (pushRows.length) {
        try {
            const { pushed } = await pushForNotificationRows(pushRows);
            if (pushed > 0) {
                const now = new Date().toISOString();
                for (const row of pushRows) {
                    const existing = await col.get(row.notificationId);
                    if (existing) await col.put(row.notificationId, { ...existing, pushedAt: now }, { merge: false });
                }
            }
        } catch {
            /* in-app delivery is authoritative */
        }
    }
    return { delivered };
}

async function visibleForUser(uid) {
    const rows = (await col.list({ where: [["uid", "==", uid]], limit: SCAN })).map(({ __id, ...rest }) => rest);
    if (!rows.length) return [];
    const active = new Set(
        (await listMyOrganisationConnections(uid))
            .filter(({ conn }) => ["subscribed", "connected"].includes(conn.state))
            .map(({ conn }) => conn.snId)
    );
    return rows.filter((r) => active.has(r.snId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * @param {string} uid
 * @param {{ limit?: number, unreadOnly?: boolean }} [opts]
 * @returns {Promise<{ notifications: object[], unread: number, delivery: "in_app" }>}
 */
export async function listNotificationsForUser(uid, { limit = DEFAULT_LIMIT, unreadOnly = false } = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    const cap = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await visibleForUser(uid);
    const unread = rows.filter((r) => !r.readAt).length;
    const shown = (unreadOnly ? rows.filter((r) => !r.readAt) : rows).slice(0, cap);
    return { notifications: shown.map(view), unread, delivery: "in_app" };
}

export async function countUnreadNotifications(uid) {
    if (!uid) return 0;
    return (await visibleForUser(uid)).filter((r) => !r.readAt).length;
}

/**
 * Mark read. `ids` = specific notificationIds (only the caller's own are touched); `all` marks every unread one.
 * @param {string} uid
 * @param {{ ids?: string[], all?: boolean }} input
 */
export async function markNotificationsRead(uid, { ids = [], all = false } = {}) {
    if (!uid) throw err(401, "AUTH_REQUIRED", "Sign in required.");
    if (!all && (!Array.isArray(ids) || ids.length === 0)) throw err(422, "NOTIFICATIONS_INVALID", "Provide ids[] or all:true.");
    if (Array.isArray(ids) && ids.length > 200) throw err(422, "NOTIFICATIONS_INVALID", "At most 200 ids per request.");
    const want = new Set((ids || []).map(String));
    const rows = (await col.list({ where: [["uid", "==", uid]], limit: SCAN })).map(({ __id, ...rest }) => rest);
    const now = new Date().toISOString();
    let updated = 0;
    for (const row of rows) {
        if (row.readAt) continue;
        if (!all && !want.has(row.notificationId)) continue;
        await col.put(row.notificationId, { ...row, readAt: now }, { merge: false });
        updated += 1;
    }
    return { updated, unread: await countUnreadNotifications(uid) };
}

export function clearNotificationsForTests() {
    col.clearMemory();
}
