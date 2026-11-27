/**
 * ST-03 (v1) — schedule inbox notifications for each future slot on a personal task.
 */
export async function schedulePersonalTaskReminderNotifications(uid, task = {}) {
    if (!uid || !task?.id) return { scheduled: 0 };
    const { createSarahReminderScheduledNotification } = await import("../../network/notificationService.js");
    const slots = [];
    const seen = new Set();
    const add = (at, label) => {
        const iso = String(at || "").trim();
        const ms = Date.parse(iso);
        if (!Number.isFinite(ms) || ms < Date.now() + 5000) return;
        if (seen.has(iso)) return;
        seen.add(iso);
        slots.push({ at: iso, label: label || "" });
    };
    for (const row of Array.isArray(task.reminderSchedule) ? task.reminderSchedule : []) {
        add(row?.at, row?.label);
    }
    const isReminder = task.taskKind === "reminder" || task.type === "reminder";
    if (!slots.length && isReminder && task.dueAt) {
        add(task.dueAt, "Reminder");
    }
    slots.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let scheduled = 0;
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        try {
            const body = slot.label ? `${task.title} — ${slot.label}` : task.notes || task.title;
            await createSarahReminderScheduledNotification(uid, {
                reminderId: `${task.id}#${i}`,
                title: task.title,
                body,
                dueAt: slot.at,
            });
            scheduled += 1;
        } catch (err) {
            console.warn("[personalSarahTaskReminders]", err?.message || err);
        }
    }
    return { scheduled };
}