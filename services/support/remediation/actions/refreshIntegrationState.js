/**
 * PI-4F-3 — refreshIntegrationState (reconcile only — no re-auth).
 */
import { getWhatsAppIntegration } from "../../../tenants/integrationService.js";
import { ServiceBase, TENANT_COLLECTIONS } from "../../../core/serviceBase.js";
import { assessRuntimeReadiness } from "../../../tenants/platformWhatsAppIntegrationService.js";

const integrationRepo = new ServiceBase(TENANT_COLLECTIONS.INTEGRATIONS);
import { gatherWebhookStatus } from "../../diagnostics/gatherTenantDiagnostics.js";
import { REMEDIATION_ACTIONS } from "../remediationConfig.js";
import { executeApprovedRemediation } from "../executeApprovedRemediation.js";
import {
    assertTenantScope,
    isCredentialIssueClass,
    looksLikeCredentialProblem,
    rateLimitExceeded,
} from "../remediationGuards.js";

async function checkPreconditions(ctx) {
    const { companyId, supportCase, ctx: sarahCtx } = ctx;
    const tenant = assertTenantScope(companyId, sarahCtx);
    if (!tenant.ok) return { ok: false, reason: tenant.reason };

    if (isCredentialIssueClass(supportCase.diagnosis?.issueClass)) {
        return { ok: false, reason: "Credential issue — refresh cannot replace re-authentication." };
    }

    const rate = rateLimitExceeded(supportCase, REMEDIATION_ACTIONS.REFRESH_INTEGRATION_STATE);
    if (rate.exceeded) return { ok: false, reason: rate.reason };

    const raw = await getWhatsAppIntegration(companyId);
    if (!raw) return { ok: false, reason: "Integration not known for this tenant." };

    const readiness = assessRuntimeReadiness(raw);
    if (!readiness.runtimeReady) {
        return { ok: false, reason: "Integration missing required fields — not eligible for state refresh." };
    }
    if (raw.lastError && looksLikeCredentialProblem(raw.lastError)) {
        return { ok: false, reason: "Meta credentials appear expired or invalid — escalate instead." };
    }

    const stale =
        Boolean(raw.lastError) ||
        supportCase.diagnosis?.issueClass === "integration_state" ||
        supportCase.diagnosis?.issueClass === "webhook_stale";
    if (!stale) {
        return { ok: false, reason: "Integration state does not appear stale or inconsistent." };
    }

    return {
        ok: true,
        previousState: {
            status: raw.status,
            lastError: raw.lastError || null,
            stateRefreshedAt: raw.stateRefreshedAt || null,
            runtimeReady: readiness.runtimeReady,
        },
        integration: raw,
    };
}

async function runAction(ctx) {
    const pre = await checkPreconditions(ctx);
    const raw = pre.integration || (await getWhatsAppIntegration(ctx.companyId));
    const now = new Date().toISOString();
    const readiness = assessRuntimeReadiness(raw);
    const patch = {
        stateRefreshedAt: now,
        stateReconciledAt: now,
        lastError: readiness.runtimeReady && !looksLikeCredentialProblem(raw.lastError) ? null : raw.lastError,
        status: raw.status === "disconnected" ? raw.status : "active",
    };
    const docId = raw.id || "whatsapp";
    const updated = await integrationRepo.update(ctx.companyId, docId, patch);
    return {
        actionResult: { refreshedAt: now, clearedError: patch.lastError === null },
        newState: {
            status: updated?.status || patch.status,
            stateRefreshedAt: now,
            lastError: patch.lastError,
        },
    };
}

async function verifyOutcome(ctx) {
    const webhook = await gatherWebhookStatus(ctx.companyId);
    const raw = await getWhatsAppIntegration(ctx.companyId);
    const verified =
        webhook.runtimeReady &&
        (webhook.assessment === "likely_active" || webhook.assessment === "degraded") &&
        !(raw?.lastError && looksLikeCredentialProblem(raw.lastError));
    return {
        verified,
        postVerification: {
            webhookAssessment: webhook.assessment,
            runtimeReady: webhook.runtimeReady,
            lastError: raw?.lastError || null,
        },
        reasons: verified ? [] : ["Integration state still inconsistent after refresh."],
        recommendedOperatorAction: verified
            ? null
            : "Review WhatsApp integration in operator console if refresh did not reconcile state.",
    };
}

export async function runRefreshIntegrationStateRemediation(companyId, supportCaseId, ctx = {}, actionArgs = {}) {
    return executeApprovedRemediation({
        action: REMEDIATION_ACTIONS.REFRESH_INTEGRATION_STATE,
        companyId,
        supportCaseId,
        ctx,
        actionArgs,
        checkPreconditions,
        runAction,
        verifyOutcome,
    });
}
