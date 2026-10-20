import { registerJobHandler, JOB_TYPES } from "../jobQueue.js";
import { runWorkforceSarahAutopilot } from "../../bos/workforceSarahAutopilot.js";

async function processWorkforceSarahJob(job) {
    const companyId = job.companyId;
    const targetModule = job.targetModule || job.payload?.targetModule;
    if (!companyId || !targetModule) {
        throw new Error("EXECUTE_SARAH_WORKFORCE job missing companyId or targetModule");
    }
    const result = await runWorkforceSarahAutopilot({
        companyId,
        targetModule,
        instructionId: job.instructionId || job.payload?.instructionId,
        instructionText: job.instructionText || job.payload?.instructionText,
    });
    console.log("[bos-autopilot]", companyId, targetModule, result?.reply?.slice(0, 120) || "(no reply)");
    return result;
}

export function startWorkforceSarahWorker() {
    registerJobHandler(JOB_TYPES.EXECUTE_SARAH_WORKFORCE, processWorkforceSarahJob);
    console.log("[bos] Workforce Sarah worker registered for", JOB_TYPES.EXECUTE_SARAH_WORKFORCE);
}
