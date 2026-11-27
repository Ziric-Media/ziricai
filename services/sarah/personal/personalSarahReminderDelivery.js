/**
 * SNA-01G / ST-03 — server-stored reminders → inbox + push when due (per schedule slot).
 */
import { listPersonalSarahTasks, markReminderScheduleSlotFired } from "./personalSarahTaskStore.js";
import { createSarahReminderDueNotification } from "../../network/notificationService.js";
import { dueSlotsForTask, isActiveReminderTask } from "./personalSarahReminderSlots.js";

/**
 * @param {string} uid
 * @returns {Promise<{ task: object, slot: { at: string, label: string, key: string } }[]>}
 */
export async function listDuePersonalReminderDeliveries(uid) {
    if (!uid) return [];
    const tasks = await listPersonalSarahTasks(uid, { limit: 200 });
    const now = Date.now();
    const deliveries = [];
    for (const task of tasks) {
        if (!isActiveReminderTask(task)) continue;
        for (const slot of dueSlotsForTask(task, now)) {
            deliveries.push({ task, slot });
        }
    }
    return deliveries;
}

/** @deprecated — use listDuePersonalReminderDeliveries */
export async function listDuePersonalReminders(uid) {
    const deliveries = await listDuePersonalReminderDeliveries(uid);
    return deliveries.map((d) => d.task);
}

/** @param {string} uid */
export async function deliverDuePersonalReminders(uid) {
    if (!uid) return { delivered: 0, items: [] };
    const deliveries = await listDuePersonalReminderDeliveries(uid);
    const items = [];
    for (const { task, slot } of deliveries) {
        const loc = task.locationLabel ? ` · ${task.locationLabel}` : "";
        const body = slot.label
            ? `${task.title} — ${slot.label}`
            : (task.notes || task.title) + loc;
        await createSarahReminderDueNotification(uid, {
            reminderId: `${task.id}#${slot.key}`,
            title: task.title,
            body,
        });
        await markReminderScheduleSlotFired(uid, task.id, slot.key);
        items.push({
            id: `${task.id}#${slot.key}`,
            title: task.title,
            notes: body,
            dueAt: slot.at,
            slotLabel: slot.label || null,
        });
    }
    return { delivered: items.length, items };
}