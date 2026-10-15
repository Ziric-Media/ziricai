const MAX_ACTIVITY = 50;

/**
 * Append server-side activity entry (system / worker — not client PATCH).
 * @param {string} companyId
 * @param {string} taskId
 * @param {{ type: string, message: string, at?: string, jobId?: string|null }} entry
 */
export async function appendTaskActivity(companyId, taskId, entry) {
    const { getTask, updateTask } = await import("./taskService.js");
    const task = await getTask(companyId, taskId);
    if (!task) return null;
    const log = Array.isArray(task.activityLog) ? [...task.activityLog] : [];
    log.push({
        type: entry.type,
        message: entry.message,
        at: entry.at || new Date().toISOString(),
        jobId: entry.jobId ?? null,
    });
    while (log.length > MAX_ACTIVITY) log.shift();
    return updateTask(companyId, taskId, { activityLog: log });
}
