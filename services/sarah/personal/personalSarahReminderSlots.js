/**
 * ST-03 — due reminder slots from task.dueAt and reminderSchedule rows.
 */

function slotKey(at) {
    return String(at || "").trim();
}

/**
 * @param {object} task
 * @param {number} [now]
 * @returns {{ at: string, label: string, key: string }[]}
 */
export function dueSlotsForTask(task, now = Date.now()) {
    if (!task) return [];
    const fired = new Set(Array.isArray(task.firedScheduleKeys) ? task.firedScheduleKeys : []);
    const out = [];
    const schedule = Array.isArray(task.reminderSchedule) ? task.reminderSchedule : [];

    for (const row of schedule) {
        const at = slotKey(row?.at);
        const ms = Date.parse(at);
        if (!at || !Number.isFinite(ms) || ms > now) continue;
        if (fired.has(at)) continue;
        out.push({ at, label: String(row?.label || "").trim(), key: at });
    }

    const mainAt = slotKey(task.dueAt);
    const mainMs = Date.parse(mainAt);
    const hasSchedule = schedule.length > 0;
    if (mainAt && Number.isFinite(mainMs) && mainMs <= now && !fired.has("__main__")) {
        if (!hasSchedule) {
            out.push({ at: mainAt, label: "Reminder", key: "__main__" });
        } else if (mainMs <= now) {
            out.push({ at: mainAt, label: "Event", key: "__main__" });
        }
    }

    return out;
}

export function futureSlotsRemaining(task, firedKeys = []) {
    const fired = new Set(firedKeys);
    const now = Date.now();
    const schedule = Array.isArray(task.reminderSchedule) ? task.reminderSchedule : [];
    for (const row of schedule) {
        const at = slotKey(row?.at);
        const ms = Date.parse(at);
        if (at && Number.isFinite(ms) && ms > now && !fired.has(at)) return true;
    }
    const mainAt = slotKey(task.dueAt);
    const mainMs = Date.parse(mainAt);
    if (mainAt && Number.isFinite(mainMs) && mainMs > now && !fired.has("__main__")) return true;
    return false;
}

export function isActiveReminderTask(task) {
    const st = String(task?.status || "").toLowerCase();
    if (["cancelled", "completed", "fired", "dismissed"].includes(st)) return false;
    if (task?.taskKind === "reminder" || task?.type === "reminder") return true;
    return (Array.isArray(task?.reminderSchedule) ? task.reminderSchedule : []).length > 0;
}