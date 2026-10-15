/**
 * Keep Operations task execution fields aligned with queue job transitions (server-only).
 * Full bidirectional reconciliation is not implemented — these are targeted sync hooks.
 */
import { getTask, updateTask } from "../tenants/taskService.js";
import { appendTaskActivity } from "../tenants/taskActivity.js";

export { syncTaskExecutionWithFailedJob } from "./aiTaskJobSync.js";

function taskIdFromJob(job) {
    return job.taskId || job.payload?.taskId || null;
}

/**
 * @param {object} job
 * @param {number|null|undefined} nextRunAtMs
 */
export async function syncTaskExecutionRetrying(job, nextRunAtMs) {
    const companyId = job.companyId;
    const taskId = taskIdFromJob(job);
    if (!companyId || !taskId) return null;

    const task = await getTask(companyId, taskId);
    if (!task || task.executionStatus === "completed") return null;

    const retryAt =
        nextRunAtMs != null && Number.isFinite(Number(nextRunAtMs))
            ? new Date(Number(nextRunAtMs)).toISOString()
            : null;

    await updateTask(companyId, taskId, {
        executionStatus: "retrying",
        executionRetryAt: retryAt,
        executionJobId: job.id || task.executionJobId || null,
    });
    await appendTaskActivity(companyId, taskId, {
        type: "execution_retry_scheduled",
        message: retryAt
            ? `Waiting for next execution attempt (scheduled ${retryAt}).`
            : "Waiting for next execution attempt.",
        jobId: job.id || null,
    });
    return getTask(companyId, taskId);
}

/**
 * @param {object} job
 * @param {string} reason
 */
export async function syncTaskExecutionStaleRecovery(job, reason) {
    const companyId = job.companyId;
    const taskId = taskIdFromJob(job);
    if (!companyId || !taskId) return null;

    const task = await getTask(companyId, taskId);
    if (!task || task.executionStatus === "completed") return null;

    const nextRunAtMs = job.nextRunAt != null ? Number(job.nextRunAt) : null;
    await syncTaskExecutionRetrying(job, nextRunAtMs);
    await appendTaskActivity(companyId, taskId, {
        type: "execution_lease_recovered",
        message: reason || "Stale worker lease recovered; job re-queued for retry.",
        jobId: job.id || null,
    });
    return getTask(companyId, taskId);
}
