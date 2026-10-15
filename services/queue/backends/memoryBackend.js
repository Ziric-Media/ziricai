import { randomUUID } from "crypto";
import { JOB_STATES, isTerminalJobState } from "../jobStates.js";
import { queueMaxAttempts, queueBaseDelayMs, queueProcessingLeaseMs } from "../queueConfig.js";

/**
 * In-process queue backend — dev/test fallback; jobs lost on restart.
 */
export function createMemoryBackend() {
    /** @type {Map<string, object>} */
    const jobs = new Map();
    /** @type {string[]} */
    const ready = [];
    const workerId = `mem-worker-${randomUUID().slice(0, 8)}`;

    function normalizeJob(record) {
        return {
            ...record.payload,
            id: record.id,
            type: record.type,
            status: record.status,
            enqueuedAt: record.enqueuedAt,
            startedAt: record.startedAt,
            completedAt: record.completedAt,
            attempt: record.attempt,
            maxAttempts: record.maxAttempts,
            nextRunAt: record.nextRunAt,
            lastError: record.lastError,
            companyId: record.companyId,
            customerId: record.customerId,
            conversationId: record.conversationId,
            channel: record.channel,
            externalMessageId: record.externalMessageId,
            outboundSent: record.outboundSent,
            outboundMetaMessageId: record.outboundMetaMessageId,
            outboundPlanSent: record.outboundPlanSent,
            outboundMetaMessageIds: record.outboundMetaMessageIds,
            lockedBy: record.lockedBy || null,
            lockedAt: record.lockedAt || null,
            claimToken: record.claimToken || null,
        };
    }

    function claimMatches(record, opts = {}) {
        if (opts.forceStaleRecovery) return true;
        if (!opts.claimToken) return true;
        return record.claimToken === opts.claimToken;
    }

    function findActiveByExternalMessageId(externalMessageId) {
        if (!externalMessageId) return null;
        for (const job of jobs.values()) {
            if (
                job.externalMessageId === externalMessageId &&
                !isTerminalJobState(job.status)
            ) {
                return normalizeJob(job);
            }
        }
        return null;
    }

    function enqueue(payload) {
        const externalMessageId = payload.externalMessageId || payload.externalId || null;
        if (externalMessageId) {
            const active = findActiveByExternalMessageId(externalMessageId);
            if (active) {
                return { job: active, duplicate: true };
            }
        }

        const id = randomUUID();
        const now = Date.now();
        const record = {
            id,
            type: payload.type,
            status: JOB_STATES.QUEUED,
            payload: { ...payload },
            companyId: payload.companyId || null,
            customerId: payload.customerId || null,
            conversationId: payload.conversationId || null,
            channel: payload.channel || null,
            externalMessageId,
            attempt: 0,
            maxAttempts: queueMaxAttempts(),
            enqueuedAt: now,
            startedAt: null,
            completedAt: null,
            nextRunAt: now,
            lastError: null,
            outboundSent: false,
            outboundMetaMessageId: null,
            outboundPlanSent: false,
            outboundMetaMessageIds: null,
            lockedBy: null,
            lockedAt: null,
            claimToken: null,
        };
        jobs.set(id, record);
        ready.push(id);
        return { job: normalizeJob(record), duplicate: false };
    }

    function claimNext() {
        const now = Date.now();
        for (let i = 0; i < ready.length; i++) {
            const id = ready[i];
            const record = jobs.get(id);
            if (!record) {
                ready.splice(i, 1);
                i--;
                continue;
            }
            if (record.nextRunAt > now) continue;
            if (![JOB_STATES.QUEUED, JOB_STATES.RETRYING].includes(record.status)) {
                ready.splice(i, 1);
                i--;
                continue;
            }
            ready.splice(i, 1);
            record.status = JOB_STATES.PROCESSING;
            record.startedAt = now;
            record.attempt += 1;
            record.lockedBy = workerId;
            record.lockedAt = now;
            record.claimToken = randomUUID();
            return normalizeJob(record);
        }
        return null;
    }

    function completeJob(id, patch = {}, opts = {}) {
        const record = jobs.get(id);
        if (!record) return null;
        if (!claimMatches(record, opts)) return null;
        record.status = JOB_STATES.COMPLETED;
        record.completedAt = Date.now();
        if (patch.outboundSent !== undefined) record.outboundSent = patch.outboundSent;
        if (patch.outboundMetaMessageId !== undefined) {
            record.outboundMetaMessageId = patch.outboundMetaMessageId;
        }
        if (patch.outboundPlanSent !== undefined) record.outboundPlanSent = patch.outboundPlanSent;
        if (patch.outboundMetaMessageIds !== undefined) {
            record.outboundMetaMessageIds = patch.outboundMetaMessageIds;
        }
        record.lockedBy = null;
        record.lockedAt = null;
        record.claimToken = null;
        return normalizeJob(record);
    }

    function scheduleRetry(id, errorMessage, opts = {}) {
        const record = jobs.get(id);
        if (!record) return null;
        if (!claimMatches(record, opts)) return null;
        record.lastError = errorMessage;
        record.lockedBy = null;
        record.lockedAt = null;
        record.claimToken = null;
        if (record.attempt >= record.maxAttempts) {
            record.status = JOB_STATES.FAILED;
            record.completedAt = Date.now();
            return normalizeJob(record);
        }
        const delay = queueBaseDelayMs() * Math.pow(2, record.attempt - 1);
        record.status = JOB_STATES.RETRYING;
        record.nextRunAt = Date.now() + delay;
        ready.push(id);
        return normalizeJob(record);
    }

    function recoverStaleLeases(leaseMs = queueProcessingLeaseMs()) {
        const now = Date.now();
        const recovered = [];
        for (const record of jobs.values()) {
            if (record.status !== JOB_STATES.PROCESSING) continue;
            if (!record.lockedAt || now - record.lockedAt <= leaseMs) continue;
            const updated = scheduleRetry(record.id, "Worker lease expired (stale processing recovered)", {
                forceStaleRecovery: true,
            });
            if (updated) recovered.push(updated);
        }
        return { recovered };
    }

    function markOutboundSent(id, metaMessageId, extra = {}) {
        const record = jobs.get(id);
        if (!record) return null;
        record.outboundSent = true;
        record.outboundMetaMessageId = metaMessageId;
        if (extra.outboundPlanSent) record.outboundPlanSent = true;
        if (extra.outboundMetaMessageIds) record.outboundMetaMessageIds = extra.outboundMetaMessageIds;
        return normalizeJob(record);
    }

    function getStats() {
        let pending = 0;
        let active = 0;
        let retrying = 0;
        for (const job of jobs.values()) {
            if (job.status === JOB_STATES.PROCESSING) active++;
            else if (job.status === JOB_STATES.RETRYING) retrying++;
            else if (job.status === JOB_STATES.QUEUED) pending++;
        }
        return Promise.resolve({
            pending,
            active,
            retrying,
            total: jobs.size,
            backend: "memory",
        });
    }

    function listJobs() {
        return [...jobs.values()].map(normalizeJob);
    }

    function restoreJobs(records) {
        jobs.clear();
        ready.length = 0;
        for (const record of records) {
            jobs.set(record.id, { ...record });
            if ([JOB_STATES.QUEUED, JOB_STATES.RETRYING].includes(record.status)) {
                ready.push(record.id);
            }
        }
    }

    /** @internal test / verifier helper */
    function markJobFailed(id, errorMessage = "failed") {
        const record = jobs.get(id);
        if (!record) return null;
        record.status = JOB_STATES.FAILED;
        record.lastError = errorMessage;
        record.completedAt = Date.now();
        record.attempt = record.maxAttempts;
        return normalizeJob(record);
    }

    function requeueFailedForCompany(companyId, { limit = 5 } = {}) {
        const failed = [];
        for (const record of jobs.values()) {
            if (record.companyId !== companyId) continue;
            if (record.status !== JOB_STATES.FAILED) continue;
            failed.push(record);
        }
        const requeued = [];
        for (const record of failed.slice(0, limit)) {
            record.status = JOB_STATES.QUEUED;
            record.nextRunAt = Date.now();
            record.lastError = null;
            record.attempt = Math.max(0, record.attempt - 1);
            record.completedAt = null;
            ready.push(record.id);
            requeued.push(normalizeJob(record));
        }
        return {
            requeued,
            previousState: { failedCount: failed.length, failedJobIds: failed.map((r) => r.id) },
        };
    }

    return {
        name: "memory",
        async init() {},
        enqueue,
        claimNext,
        completeJob,
        scheduleRetry,
        markOutboundSent,
        findActiveByExternalMessageId,
        getStats,
        listJobs,
        restoreJobs,
        requeueFailedForCompany,
        markJobFailed,
        recoverStaleLeases,
        async shutdown() {},
    };
}
