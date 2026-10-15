/**
 * Normalize portal/Sarah due dates to ISO strings (or null).
 */
export function normalizeTaskDueAt(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value).toISOString();
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T12:00:00.000Z`);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
    }
    throw Object.assign(new Error(`Invalid due date: "${s}" — use a calendar date or ISO datetime.`), {
        status: 400,
        code: "TASK_DUE_AT_INVALID",
    });
}
