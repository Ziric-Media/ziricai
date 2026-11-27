/**
 * SNA-01G — server-stored reminders → inbox + push when due.
 */
import {
    listDuePersonalReminders,
    markPersonalReminderFired,
} from "./personalSarahTaskStore.js";
import { createSarahReminderDueNotification } from "../../network/notificationService.js";

/** @param {string} uid */
export async function deliverDuePersonalReminders(uid) {
    if (!uid) return { delivered: 0, items: [] };
    const due = await listDuePersonalReminders(uid);
    const items = [];
    for (const task of due) {
        const loc = task.locationLabel ? ` · ${task.locationLabel}` : "";
        await createSarahReminderDueNotification(uid, {
            reminderId: task.id,
            title: task.title,
            body: (task.notes || task.title) + loc,
        });
        await markPersonalReminderFired(uid, task.id);
        items.push({ id: task.id, title: task.title, notes: task.notes || "", dueAt: task.dueAt });
    }
    return { delivered: items.length, items };
}
