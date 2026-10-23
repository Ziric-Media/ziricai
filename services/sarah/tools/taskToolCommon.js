/**
 * Shared helpers for Sarah tenant task tools (Operations Centre).
 */
export function requireSarahTenantContext(ctx) {
    const companyId = ctx?.companyId;
    if (!companyId || String(companyId).trim() === "") {
        throw Object.assign(new Error("No tenant company context for task operations."), {
            code: "NO_TENANT",
            status: 400,
        });
    }
    return String(companyId).trim();
}

/** @param {{ role?: string|null, uid?: string|null }} ctx */
export function sarahTaskAccess(ctx) {
    return { role: ctx.role ?? null, uid: ctx.uid ?? null };
}

/** Same overdue rule as js/portal/modules/operations.js */
export function isTaskOverdue(task, nowMs = Date.now()) {
    if (!task) return false;
    const status = String(task.status || "open").toLowerCase();
    if (status === "done" || status === "completed") return false;
    if (!task.dueAt) return false;
    const t = Date.parse(String(task.dueAt));
    return Number.isFinite(t) && t < nowMs;
}

/** @param {object} task */
export function summarizeTaskForSarah(task, { nowMs = Date.now() } = {}) {
    if (!task) return null;
    const status = task.status || "open";
    return {
        id: task.id,
        title: task.title || "",
        status,
        priority: task.priority || "medium",
        dueAt: task.dueAt ?? null,
        overdue: isTaskOverdue(task, nowMs),
        assigneeUid: task.assigneeUid || task.assigneeId || null,
        createdAt: task.createdAt ?? null,
        updatedAt: task.updatedAt ?? null,
    };
}
