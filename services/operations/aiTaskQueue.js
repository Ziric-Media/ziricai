/**
 * Enqueue AI Operations task execution on the shared ZiricAI job queue.
 */
import { enqueue, JOB_TYPES } from "../queue/jobQueue.js";
import { appendTaskActivity } from "../tenants/taskActivity.js";

export function aiTaskExecutionExternalId(companyId, taskId) {
    return `ai-task-exec:${companyId}:${taskId}`;
}

/**
 * @param {{ companyId: string, taskId: string, createdByUid?: string|null }} params
 */
export async function enqueueAiTaskExecution({ companyId, taskId, createdByUid = null }) {
    const externalMessageId = aiTaskExecutionExternalId(companyId, taskId);
    const job = await enqueue({
        type: JOB_TYPES.EXECUTE_AI_TASK,
        companyId,
        taskId,
        createdByUid,
        externalMessageId,
        channel: "operations",
    });

    await appendTaskActivity(companyId, taskId, {
        type: "execution_queued",
        message: "Added to AI execution queue.",
        jobId: job?.id || null,
    });

    return job;
}
