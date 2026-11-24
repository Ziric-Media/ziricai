/**
 * SW-01 / Work 1.0 — milestone-driven user notifications (no spam).
 */
import { notificationIdFor } from "../../network/notificationService.js";
import { NETWORK_COLLECTIONS } from "../../database/schema.js";
import { createNetworkCollection } from "../../network/networkCollectionStore.js";
import { pushForNotificationRows } from "../../network/webPushService.js";
import { workSettingsNotify } from "./personalSarahWorkSettings.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.NOTIFICATIONS);

async function putWorkNotification(uid, { eventId, title, body, sessionId, taskTitle }) {
    if (!uid || !eventId) return null;
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
            source: "sarah_work",
            type: "sarah_work",
            channel: "sarah_work",
            title,
            body,
            workSessionId: sessionId || null,
            taskTitle: taskTitle || null,
            createdAt,
            readAt: null,
            pushedAt: null,
            organisation: { displayName: "Sarah Work", verified: true },
            schemaVersion: 1,
        },
        { merge: false }
    );
    try {
        await pushForNotificationRows([{ uid, notificationId, title, body, snId: null, channel: "sarah_work" }]);
    } catch {
        /* in-app authoritative */
    }
    return { notificationId, duplicate: false };
}

function taskTitle(session) {
    return String(session?.title || "Work assignment").slice(0, 120);
}

export async function notifyWorkAssignmentStarted(session) {
    if (!session?.userId || !workSettingsNotify(session, "notifyOnStart")) return null;
    const sid = session.id;
    return putWorkNotification(session.userId, {
        eventId: `sarah_work_start_${sid}`,
        title: "Work started",
        body: `Sarah is working on: ${taskTitle(session)}`,
        sessionId: sid,
        taskTitle: taskTitle(session),
    });
}

export async function notifyWorkMilestoneIfMeaningful(session, milestoneId, progressPercent) {
    if (!session?.userId || !workSettingsNotify(session, "notifyOnMilestone")) return null;
    const pct = Number(progressPercent) || 0;
    const shouldNotify = milestoneId === "m4" || pct >= 50;
    if (!shouldNotify) return null;
    const sid = session.id;
    const eventId = `sarah_work_ms_${sid}_${milestoneId}_${pct >= 100 ? "done" : "half"}`;
    const ms = (session.workWorkspace?.milestones || []).find((m) => m.id === milestoneId);
    const label = ms?.title || "Milestone";
    return putWorkNotification(session.userId, {
        eventId,
        title: pct >= 100 ? "Assignment complete" : "Progress update",
        body: pct >= 100 ? `${taskTitle(session)} is complete.` : `${label} — ${pct}% complete on ${taskTitle(session)}.`,
        sessionId: sid,
        taskTitle: taskTitle(session),
    });
}

export async function notifyWorkNeedsApproval(session) {
    if (!session?.userId || !workSettingsNotify(session, "notifyOnApproval")) return null;
    const sid = session.id;
    return putWorkNotification(session.userId, {
        eventId: `sarah_work_approval_${sid}`,
        title: "Approval needed",
        body: `Sarah needs your approval to continue: ${taskTitle(session)}`,
        sessionId: sid,
        taskTitle: taskTitle(session),
    });
}

export async function notifyWorkPaused(session, reason) {
    if (!session?.userId || !workSettingsNotify(session, "notifyOnPause")) return null;
    const sid = session.id;
    return putWorkNotification(session.userId, {
        eventId: `sarah_work_pause_${sid}`,
        title: "Work paused",
        body: reason || `Sarah paused: ${taskTitle(session)}`,
        sessionId: sid,
        taskTitle: taskTitle(session),
    });
}