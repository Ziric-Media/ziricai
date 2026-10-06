/**
 * PI-4F-3 — Safe queue requeue for failed message/webhook processing jobs.
 */
import { getQueueBackend } from "../../queue/jobQueue.js";
import { JOB_STATES } from "../../queue/jobStates.js";

export async function listTenantQueueJobs(companyId, { limit = 100 } = {}) {
    const backend = await getQueueBackend();
    if (typeof backend.listJobs !== "function") return [];
    return backend.listJobs().filter((j) => j.companyId === companyId).slice(0, limit);
}

export function tenantHasActiveProcessingJob(jobs, companyId) {
    return jobs.some(
        (j) =>
            j.companyId === companyId &&
            (j.status === JOB_STATES.PROCESSING || j.status === JOB_STATES.QUEUED)
    );
}

/**
 * Requeue failed jobs for tenant (webhook/message pipeline recovery).
 * @returns {{ requeued: object[], previousState: object }}
 */
export async function requeueFailedJobsForTenant(companyId, { limit = 5 } = {}) {
    const backend = await getQueueBackend();
    if (typeof backend.requeueFailedForCompany === "function") {
        return backend.requeueFailedForCompany(companyId, { limit });
    }
    return { requeued: [], previousState: { failedCount: 0 }, unsupported: true };
}
