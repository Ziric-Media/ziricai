/**
 * PI-4F-3 — retryFailedWebhook (reference remediation).
 */
import { gatherWebhookStatus, gatherRecentErrors } from "../../diagnostics/gatherTenantDiagnostics.js";
import { gatherWhatsAppConnectionState } from "../../diagnostics/gatherTenantDiagnostics.js";
import { REMEDIATION_ACTIONS } from "../remediationConfig.js";
import { executeApprovedRemediation } from "../executeApprovedRemediation.js";
import {
    assertTenantScope,
    isCredentialIssueClass,
    looksLikeCredentialProblem,
    rateLimitExceeded,
} from "../remediationGuards.js";
import {
    listTenantQueueJobs,
    requeueFailedJobsForTenant,
    tenantHasActiveProcessingJob,
} from "../queueRemediation.js";
import { JOB_STATES } from "../../../queue/jobStates.js";

async function checkPreconditions(ctx) {
    const { companyId, supportCase, ctx: sarahCtx } = ctx;
    const tenant = assertTenantScope(companyId, sarahCtx);
    if (!tenant.ok) return { ok: false, reason: tenant.reason };

    if (isCredentialIssueClass(supportCase.diagnosis?.issueClass)) {
        return { ok: false, reason: "Credential problem — escalation required, not retry." };
    }

    const wa = await gatherWhatsAppConnectionState(companyId);
    const webhook = await gatherWebhookStatus(companyId);
    if (!wa.present) {
        return { ok: false, reason: "WhatsApp integration not configured." };
    }
    if (wa.lastError && looksLikeCredentialProblem(wa.lastError)) {
        return { ok: false, reason: "Integration error indicates credentials — cannot retry webhook safely." };
    }

    const errors = await gatherRecentErrors(companyId);
    const hasRetryableFailure =
        errors.processingFailuresDetected ||
        (errors.items || []).some((e) => e.source === "message_queue");
    if (!hasRetryableFailure) {
        return { ok: false, reason: "No retryable webhook/message processing failure detected." };
    }

    const rate = rateLimitExceeded(supportCase, REMEDIATION_ACTIONS.RETRY_FAILED_WEBHOOK);
    if (rate.exceeded) return { ok: false, reason: rate.reason };

    const jobs = await listTenantQueueJobs(companyId);
    const failed = jobs.filter((j) => j.status === JOB_STATES.FAILED);
    if (!failed.length) {
        return { ok: false, reason: "No failed queue jobs to retry." };
    }
    if (tenantHasActiveProcessingJob(jobs, companyId)) {
        return { ok: false, reason: "Conflicting message processing job is already active." };
    }

    return {
        ok: true,
        previousState: {
            webhookAssessment: webhook.assessment,
            failedJobCount: failed.length,
            integrationStatus: wa.status,
        },
    };
}

async function runAction(ctx) {
    const { companyId } = ctx;
    const { requeued, previousState } = await requeueFailedJobsForTenant(companyId, { limit: 5 });
    if (!requeued.length) {
        throw new Error("Requeue returned no jobs (queue backend may not support retry).");
    }
    return {
        actionResult: { requeuedJobIds: requeued.map((j) => j.id), count: requeued.length },
        newState: { requeuedCount: requeued.length, previousFailed: previousState?.failedCount ?? null },
    };
}

async function verifyOutcome(ctx, actionResult) {
    const { companyId } = ctx;
    const webhook = await gatherWebhookStatus(companyId);
    const jobs = await listTenantQueueJobs(companyId);
    const failedAfter = jobs.filter((j) => j.status === JOB_STATES.FAILED).length;
    const requeued = actionResult?.count || 0;

    const webhookOk =
        webhook.runtimeReady &&
        webhook.assessment !== "not_configured" &&
        !looksLikeCredentialProblem(webhook.lastError);

    const verified = webhookOk && requeued > 0 && failedAfter === 0;
    return {
        verified,
        postVerification: {
            webhookAssessment: webhook.assessment,
            failedJobsRemaining: failedAfter,
            requeuedCount: requeued,
        },
        reasons: verified
            ? []
            : [
                  failedAfter > 0 ? "Failed queue jobs still present after retry." : null,
                  !webhookOk ? "Webhook/integration state not healthy after retry." : null,
                  requeued === 0 ? "No jobs were requeued." : null,
              ].filter(Boolean),
    };
}

export async function runRetryFailedWebhookRemediation(companyId, supportCaseId, ctx = {}, actionArgs = {}) {
    return executeApprovedRemediation({
        action: REMEDIATION_ACTIONS.RETRY_FAILED_WEBHOOK,
        companyId,
        supportCaseId,
        ctx,
        actionArgs,
        checkPreconditions,
        runAction,
        verifyOutcome,
    });
}
