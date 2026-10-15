/**
 * Align task execution fields when the durable queue reaches a terminal failed state.
 */
import { getTask, updateTask } from "../tenants/taskService.js";
import { appendTaskActivity } from "../tenants/taskActivity.js";

/**
 * @param {{ companyId?: string, taskId?: string, id?: string }} job
 * @param {string} errorMessage
 */
export async function syncTaskExecutionWithFailedJob(job, errorMessage) {
    const companyId = job.companyId;
    const taskId = job.taskId || job.payload?.taskId;
    if (!companyId || !taskId) return null;

    const task = await getTask(companyId, taskId);
    if (!task || task.executionStatus === "completed") return null;

    const failedAt = new Date().toISOString();
    const summary = String(errorMessage || "Execution failed after retries").slice(0, 500);
    await updateTask(companyId, taskId, {
        executionStatus: "failed",
        executionError: summary,
        executionCompletedAt: failedAt,
        executionJobId: job.id || task.executionJobId || null,
    });
    await appendTaskActivity(companyId, taskId, {
        type: "execution_failed",
        message: `Queue exhausted retries: ${summary}`,
        at: failedAt,
        jobId: job.id || null,
    });
    return getTask(companyId, taskId);
}
