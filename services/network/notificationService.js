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

/**
 * Engagement rollup for one subscriber event (business-visible counts only; no uids).
 * @param {string} eventId
 */
export async function countEngagementForSubscriberEvent(eventId) {
    const id = String(eventId || "").trim();
    if (!id) return { inboxDelivered: 0, read: 0, pushed: 0 };
    const rows = (await col.list({ where: [["eventId", "==", id]], limit: NOTIFICATION_MAX_RECIPIENTS })).map(
        ({ __id, ...rest }) => rest
    );
    return {
        inboxDelivered: rows.length,
        read: rows.filter((r) => Boolean(r.readAt)).length,
        pushed: rows.filter((r) => Boolean(r.pushedAt)).length,
    };
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
        workSessionId: row.workSessionId || null,
        taskId: row.taskId || null,
        deepLink: row.deepLink || null,
    };
}

/**
 * Persist one notification per eligible subscriber.
 * @param {{ eventId: string, companyId: string, snId: string, type: string, channel: string, title: string, body?: string, createdAt: string }} event
 * @param {{ displayName?: string|null, verified?: boolean }} [organisation]
 * @returns {Promise<{ delivered: number }>}
 */
export async function fanOutSubscriberEvent(event, organisation = {}) {
    const recipients = await listNotificationRecipientsForOrg(event.companyId, event.channel, {
        limit: NOTIFICATION_MAX_RECIPIENTS,
        campusId: event.campusId || "",
    });
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
        pushRows.push({
            uid: r.uid,
            notificationId,
            title: event.title,
            body: event.body || "",
            snId: r.snId,
            channel: event.channel,
            pushType: event.channel === "announcements" ? "sarah_network" : event.channel,
        });
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
    return rows
        .filter(
            (r) =>
                r.source === "sarah_work" ||
                r.source === "sarah_reminder" ||
                r.source === "sarah_usage" ||
                r.source === "sarah_news" ||
                r.channel === "sarah_work" ||
                r.channel === "reminders" ||
                r.channel === "sarah_usage" ||
                r.channel === "sarah_news_briefing" ||
                r.channel === "sarah_news_breaking" ||
                active.has(r.snId)
        )
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Inbox row when a personal reminder is scheduled (before due).
 * @param {string} uid
 * @param {{ reminderId: string, title?: string, body?: string, dueAt?: string }} input
 */
export async function createSarahReminderScheduledNotification(uid, input = {}) {
    const reminderId = String(input.reminderId || "").trim();
    const title = String(input.title || "Reminder").trim().slice(0, 120);
    const dueAt = String(input.dueAt || "").trim();
    if (!uid || !reminderId) throw err(422, "REMINDER_SCHEDULE_INVALID", "uid and reminderId required.");
    const eventId = `sarah_reminder_sched_${reminderId}`;
    const notificationId = notificationIdFor(eventId, uid);
    const existing = await col.get(notificationId);
    if (existing) return { notificationId, duplicate: true };
    let whenLabel = "";
    if (dueAt) {
        const ms = Date.parse(dueAt);
        if (Number.isFinite(ms)) {
            try {
                whenLabel = new Date(ms).toLocaleString("en-ZA", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                });
            } catch {
                whenLabel = dueAt;
            }
        }
    }
    const body = String(input.body || title).trim().slice(0, 500);
    const detail = whenLabel ? `${title} · due ${whenLabel}` : title;
    const createdAt = new Date().toISOString();
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_reminder",
            type: "reminder_scheduled",
            channel: "reminders",
            title: "Reminder scheduled",
            body: detail || body,
            reminderId,
            dueAt: dueAt || null,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    return { notificationId, duplicate: false };
}

/**
 * SNA-01F — Sarah Work task completed: consumer inbox + optional push (not an organisation subscriber event).
 * @param {string} uid
 * @param {{ sessionId: string, taskTitle?: string, summary?: string }} input
 */
export async function createSarahReminderDueNotification(uid, input = {}) {
    const reminderId = String(input.reminderId || "").trim();
    const title = String(input.title || "Reminder").trim().slice(0, 120);
    const body = String(input.body || title).trim().slice(0, 500);
    if (!uid || !reminderId) throw err(422, "REMINDER_NOTIFY_INVALID", "uid and reminderId required.");
    const eventId = `sarah_reminder_${reminderId}`;
    const notificationId = notificationIdFor(eventId, uid);
    const existing = await col.get(notificationId);
    if (existing) return { notificationId, duplicate: true };
    const createdAt = new Date().toISOString();
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_reminder",
            type: "reminder",
            channel: "reminders",
            title: "Sarah Reminder",
            body,
            reminderId,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        const { pushed } = await pushForNotificationRows([
            { uid, notificationId, title: "Sarah Reminder", body, snId: null, channel: "reminders", pushType: "sarah_reminder" },
        ]);
        if (pushed > 0) {
            const row = await col.get(notificationId);
            if (row) await col.put(notificationId, { ...row, pushedAt: new Date().toISOString() }, { merge: false });
        }
    } catch {
        /* in-app is authoritative */
    }
    return { notificationId, duplicate: false };
}

/**
 * ST-UX-04 v1 — task workspace update (inbox + push with deep link to task).
 * @param {string} uid
 * @param {{ taskId: string, title?: string, body?: string }} input
 */
export async function createSarahTaskUpdateNotification(uid, input = {}) {
    const taskId = String(input.taskId || "").trim();
    const title = String(input.title || "Sarah Tasks").trim().slice(0, 120);
    const body = String(input.body || "Sarah has an update on your task.").trim().slice(0, 500);
    if (!uid || !taskId) throw err(422, "TASK_NOTIFY_INVALID", "uid and taskId required.");
    const eventId = `sarah_task_${taskId}_${Date.now()}`;
    const notificationId = notificationIdFor(eventId, uid);
    const createdAt = new Date().toISOString();
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_task",
            type: "task_update",
            channel: "tasks",
            title,
            body,
            taskId,
            deepLink: `tasks/${taskId}`,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        const { pushed } = await pushForNotificationRows([
            {
                uid,
                notificationId,
                title,
                body,
                snId: null,
                channel: "tasks",
                pushType: "sarah_task",
                deepLink: `tasks/${taskId}`,
            },
        ]);
        if (pushed > 0) {
            const row = await col.get(notificationId);
            if (row) await col.put(notificationId, { ...row, pushedAt: new Date().toISOString() }, { merge: false });
        }
    } catch {
        /* inbox ok */
    }
    return { notificationId };
}

/**
 * SN-03b — scheduled Sarah News briefing (inbox + push).
 */
export async function createSarahNewsBriefingNotification(uid, input = {}) {
    const slot = String(input.slot || "morning");
    const dayKey = String(input.dayKey || new Date().toISOString().slice(0, 10));
    const storyId = String(input.storyId || "").trim();
    const headline = String(input.headline || "Your briefing is ready").trim().slice(0, 200);
    const count = Math.max(0, Number(input.headlineCount) || 0);
    if (!uid || !storyId) throw err(422, "NEWS_BRIEFING_INVALID", "uid and storyId required.");
    const eventId = `sarah_news_briefing_${slot}_${dayKey}`;
    const notificationId = notificationIdFor(eventId, uid);
    const existing = await col.get(notificationId);
    if (existing) return { notificationId, duplicate: true };
    const label = { morning: "Morning", lunch: "Lunchtime", evening: "Evening" }[slot] || "News";
    const title = `Sarah News — ${label} briefing`;
    const body =
        count > 1
            ? `Top story: ${headline} · ${count} headlines in your edition.`
            : `Top story: ${headline}`;
    const createdAt = new Date().toISOString();
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_news",
            type: "news_briefing",
            channel: "sarah_news_briefing",
            title,
            body,
            storyId,
            slot,
            deepLink: "news",
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah News", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        const { pushed } = await pushForNotificationRows([
            {
                uid,
                notificationId,
                title,
                body,
                snId: null,
                channel: "sarah_news_briefing",
                pushType: "sarah_news_briefing",
                deepLink: "news",
                storyId,
                slot,
            },
        ]);
        if (pushed > 0) {
            const row = await col.get(notificationId);
            if (row) await col.put(notificationId, { ...row, pushedAt: new Date().toISOString() }, { merge: false });
        }
    } catch {
        /* in-app authoritative */
    }
    return { notificationId, duplicate: false };
}

/**
 * SN-04 — breaking news alert (opt-in profile.breaking).
 */
export async function createSarahNewsBreakingNotification(uid, input = {}) {
    const storyId = String(input.storyId || "").trim();
    const dayKey = String(input.dayKey || new Date().toISOString().slice(0, 10));
    const headline = String(input.headline || "Developing story").trim().slice(0, 200);
    const confidence = String(input.confidence || "developing");
    if (!uid || !storyId) throw err(422, "NEWS_BREAKING_INVALID", "uid and storyId required.");
    const eventId = `sarah_news_breaking_${storyId}_${dayKey}`;
    const notificationId = notificationIdFor(eventId, uid);
    const existing = await col.get(notificationId);
    if (existing) return { notificationId, duplicate: true };
    const title = confidence === "verified" ? "Sarah Breaking — Verified update" : "Sarah Breaking — Developing";
    const body = headline;
    const createdAt = new Date().toISOString();
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_news",
            type: "news_breaking",
            channel: "sarah_news_breaking",
            title,
            body,
            storyId,
            deepLink: `news/story/${storyId}`,
            confidence,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah News", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        const { pushed } = await pushForNotificationRows([
            {
                uid,
                notificationId,
                title,
                body,
                snId: null,
                channel: "sarah_news_breaking",
                pushType: "sarah_news_breaking",
                deepLink: `news/story/${storyId}`,
                storyId,
            },
        ]);
        if (pushed > 0) {
            const row = await col.get(notificationId);
            if (row) await col.put(notificationId, { ...row, pushedAt: new Date().toISOString() }, { merge: false });
        }
    } catch {
        /* in-app authoritative */
    }
    return { notificationId, duplicate: false };
}

const USAGE_ALERT_COPY = {
    approaching_80: {
        title: "80% of credits used",
        body: "You've used 80% of your monthly AI allowance. Open My plan & usage in Profile to track balance or buy a top-up.",
    },
    approaching_95: {
        title: "95% of credits used",
        body: "You're almost out of monthly AI credits. Consider a top-up so Sarah can keep helping without interruption.",
    },
    exhausted: {
        title: "AI credits used up",
        body: "Your monthly allowance and top-up balance are exhausted. Buy a top-up or wait for your plan to renew.",
    },
    exhausted_preview: {
        title: "Monthly allowance used",
        body: "You've used your full monthly AI allowance (preview metering). Buy a top-up if limits are enforced on your plan.",
    },
};

/**
 * US-04 — credit usage threshold (consumer inbox + optional push).
 * @param {string} uid
 * @param {{ level: string, usagePercent?: number, periodKey?: string, availableCredits?: number, renewalDate?: string|null }} input
 */
export async function createSarahCreditUsageAlertNotification(uid, input = {}) {
    const level = String(input.level || "").trim();
    const periodKey = String(input.periodKey || "period").trim().replace(/[^\w-]/g, "_");
    const copy = USAGE_ALERT_COPY[level];
    if (!uid || !copy) throw err(422, "USAGE_ALERT_INVALID", "uid and valid level required.");
    const eventId = `sarah_usage_${periodKey}_${level}`;
    const notificationId = notificationIdFor(eventId, uid);
    const existing = await col.get(notificationId);
    if (existing) return { notificationId, duplicate: true };

    const pct = Number(input.usagePercent);
    const body =
        Number.isFinite(pct) && level.startsWith("approaching")
            ? `${copy.body} (${Math.round(pct)}% used.)`
            : copy.body;
    const createdAt = new Date().toISOString();
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_usage",
            type: "usage_alert",
            channel: "sarah_usage",
            alertLevel: level,
            periodKey: input.periodKey || null,
            title: copy.title,
            body,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        const { pushed } = await pushForNotificationRows([
            {
                uid,
                notificationId,
                title: copy.title,
                body,
                snId: null,
                channel: "sarah_usage",
                pushType: "sarah_usage",
            },
        ]);
        if (pushed > 0) {
            const row = await col.get(notificationId);
            if (row) await col.put(notificationId, { ...row, pushedAt: new Date().toISOString() }, { merge: false });
        }
    } catch {
        /* in-app is authoritative */
    }
    return { notificationId, duplicate: false };
}

export async function createSarahWorkCompletionNotification(uid, input = {}) {
    const sessionId = String(input.sessionId || "").trim();
    if (!uid || !sessionId) throw err(422, "WORK_NOTIFY_INVALID", "uid and sessionId required.");
    const taskTitle = String(input.taskTitle || "Work task").trim().slice(0, 120);
    const summary = String(input.summary || "").trim().slice(0, 500);
    const eventId = `sarah_work_complete_${sessionId}`;
    const notificationId = notificationIdFor(eventId, uid);
    const existing = await col.get(notificationId);
    if (existing) return { notificationId, duplicate: true };

    const createdAt = new Date().toISOString();
    const title = "Task completed";
    const body = summary || `Sarah completed: ${taskTitle}`;
    await col.put(
        notificationId,
        {
            notificationId,
            uid,
            snId: null,
            eventId,
            source: "sarah_work",
            type: "sarah_work",
            channel: "sarah_work",
            title,
            body,
            workSessionId: sessionId,
            taskTitle,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah Work", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        const { pushed } = await pushForNotificationRows([{ uid, notificationId, title, body, snId: null, channel: "sarah_work" }]);
        if (pushed > 0) {
            const row = await col.get(notificationId);
            if (row) await col.put(notificationId, { ...row, pushedAt: new Date().toISOString() }, { merge: false });
        }
    } catch {
        /* in-app is authoritative */
    }
    return { notificationId, duplicate: false };
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
