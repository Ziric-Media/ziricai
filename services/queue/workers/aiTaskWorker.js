import { registerJobHandler, JOB_TYPES } from "../jobQueue.js";
import { executeAiAssignedTask } from "../../operations/aiTaskExecutor.js";

async function processAiTaskJob(job) {
    const companyId = job.companyId;
    const taskId = job.taskId || job.payload?.taskId;
    if (!companyId || !taskId) {
        throw new Error("EXECUTE_AI_TASK job missing companyId or taskId");
    }
    await executeAiAssignedTask({
        companyId,
        taskId,
        jobId: job.id,
        attempt: job.attempt || 1,
    });
}

export function startAiTaskWorker() {
    registerJobHandler(JOB_TYPES.EXECUTE_AI_TASK, processAiTaskJob);
    console.log("[operations] AI task worker registered for", JOB_TYPES.EXECUTE_AI_TASK);
}
