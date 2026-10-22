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

/** @param {object} task */
export function summarizeTaskForSarah(task) {
    if (!task) return null;
    return {
        id: task.id,
        title: task.title || "",
        status: task.status || "open",
        priority: task.priority || "medium",
        dueAt: task.dueAt ?? null,
        assigneeUid: task.assigneeUid || task.assigneeId || null,
        notes: task.notes ?? null,
        createdAt: task.createdAt ?? null,
        updatedAt: task.updatedAt ?? null,
    };
}
