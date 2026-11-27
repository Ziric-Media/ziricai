/**
 * ST-03c — background delivery for personal reminders (FCM + inbox without app poll).
 */
import { listPersonalSarahReminderSubscriberUids } from "./personalSarahReminderSubscriberIndex.js";
import { listDistinctPushSubscriberUids } from "../../network/pushDeviceService.js";
import { deliverDuePersonalReminders } from "./personalSarahReminderDelivery.js";
import { listPersonalSarahTasks } from "./personalSarahTaskStore.js";
import { isActiveReminderTask } from "./personalSarahReminderSlots.js";

/**
 * Drop users from the index when they have no active reminder tasks left.
 * @param {string} uid
 */
async function pruneSubscriberIfIdle(uid) {
    const tasks = await listPersonalSarahTasks(uid, { limit: 100 });
    const hasActive = tasks.some((t) => isActiveReminderTask(t));
    if (!hasActive) {
        const { removePersonalSarahReminderSubscriber } = await import("./personalSarahReminderSubscriberIndex.js");
        await removePersonalSarahReminderSubscriber(uid);
    }
}

/** @returns {Promise<{ users: number, delivered: number }>} */
export async function runPersonalSarahReminderSchedulerTick() {
    const indexed = await listPersonalSarahReminderSubscriberUids();
    const pushUids = await listDistinctPushSubscriberUids();
    const uids = [...new Set([...indexed, ...pushUids])];
    let delivered = 0;
    for (const uid of uids) {
        try {
            const r = await deliverDuePersonalReminders(uid);
            delivered += r.delivered || 0;
            if (r.delivered === 0) await pruneSubscriberIfIdle(uid);
        } catch (err) {
            console.warn("[personalSarahReminders] scheduler uid failed:", uid, err?.message || err);
        }
    }
    return { users: uids.length, delivered };
}