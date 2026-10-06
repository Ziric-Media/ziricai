/**
 * PI-4F-2 — Portal Sarah diagnostic workflow (read evidence → case record → user narrative).
 */
import {
    gatherServiceDiagnosticBundle,
    inferAffectedServiceFromText,
    normalizeAffectedService,
} from "./diagnostics/gatherTenantDiagnostics.js";
import { assessDiagnosticFromEvidence, CONFIDENCE_LEVELS } from "./diagnosticConfidence.js";
import { upsertCorrelatedSupportCase } from "./supportCaseCorrelation.js";
import {
    recordSupportDiagnosis,
    escalateSupportCase,
    resolveSupportCaseWithVerification,
} from "../tenants/supportCaseService.js";
import { evaluateEscalationPolicy } from "./escalationPolicy.js";
import { pickAutoRemediationAction } from "./remediation/pickAutoRemediation.js";
import { REMEDIATION_ACTIONS } from "./remediation/remediationConfig.js";
import { runRetryFailedWebhookRemediation } from "./remediation/actions/retryFailedWebhook.js";
import { runRestartStuckAgentRemediation } from "./remediation/actions/restartStuckAgent.js";
import { runRefreshIntegrationStateRemediation } from "./remediation/actions/refreshIntegrationState.js";

function buildIssueTitle(message, affectedService) {
    const trimmed = String(message || "").trim();
    if (trimmed.length > 10 && trimmed.length <= 200) return trimmed;
    const labels = {
        whatsapp: "WhatsApp service issue",
        ai_employee: "AI employee issue",
        knowledge: "Knowledge base issue",
        billing: "Billing issue",
    };
    return labels[affectedService] || "Platform support issue";
}

function formatUserReply({ affectedService, assessment, supportCase, correlated, configurationChanged }) {
    const svc = affectedService === "whatsapp" ? "WhatsApp" : affectedService.replace(/_/g, " ");
    const caseRef = supportCase?.id ? ` (case ${supportCase.id})` : "";
    const correlateNote = correlated ? "I've updated your existing support case" : "I've opened a support case";
    const evidenceLines = (assessment.evidence || []).slice(0, 4).map((e) => `- ${e}`).join("\n");
    const noChange =
        configurationChanged === false
            ? "\n\nNo configuration has been changed."
            : "\n\nNo infrastructure or configuration was modified during this investigation.";

    if (assessment.demonstrablyResolved) {
        return (
            `I've investigated ${svc}. Based on current read-only checks, the connection looks healthy and I see recent activity — ` +
            `the issue you reported may already be resolved${caseRef}. ${evidenceLines ? `\n\nEvidence:\n${evidenceLines}` : ""}${noChange}`
        );
    }

    return (
        `I've investigated the ${svc} connection${caseRef}. ${correlateNote}${caseRef}.\n\n` +
        `**Diagnosis:** ${assessment.summary}\n` +
        `**Severity:** ${String(assessment.severity || "medium")}\n` +
        `**Confidence:** ${assessment.confidence}\n` +
        (evidenceLines ? `\n**Evidence:**\n${evidenceLines}\n` : "") +
        `\nI'm continuing to investigate. I have not applied any fixes yet.${noChange}`
    );
}

function appendRemediationNote(baseMessage, remediationResult) {
    if (!remediationResult) return baseMessage;
    if (remediationResult.verified) {
        return `${baseMessage}\n\nI ran an approved remediation and **verified** recovery. The case is resolved.`;
    }
    if (remediationResult.skipped) {
        return baseMessage;
    }
    return `${baseMessage}\n\nI attempted an approved remediation but verification did not confirm recovery. The case is escalated.`;
}

/**
 * @param {object} ctx Sarah context
 * @param {{ message?: string, affectedService?: string, sessionCaseId?: string }} input
 */
export async function runPortalSupportDiagnosisWorkflow(ctx, input = {}) {
    const companyId = ctx.companyId;
    if (!companyId) {
        return {
            success: false,
            code: "MISSING_COMPANY",
            message: "Support diagnostics require a company workspace context.",
            completionType: "guidance",
        };
    }

    const message = String(input.message || ctx.message || "").trim();
    const affectedService = normalizeAffectedService(
        input.affectedService || inferAffectedServiceFromText(message)
    );

    const bundle = await gatherServiceDiagnosticBundle(companyId, affectedService, ctx);
    const assessment = assessDiagnosticFromEvidence({ affectedService, bundle });

    const { supportCase, correlated } = await upsertCorrelatedSupportCase(
        companyId,
        {
            subject: buildIssueTitle(message, affectedService),
            issue: buildIssueTitle(message, affectedService),
            affectedService,
            severity: assessment.severity,
            category: affectedService === "billing" ? "billing" : "integrations",
            source: "sarah",
            sessionCaseId: input.sessionCaseId || ctx.sessionContext?.activeSupportCaseId,
            conversationId: ctx.conversationId || null,
        },
        { uid: ctx.uid || "sarah", isSuperAdmin: ctx.isSuperAdmin }
    );

    const prevPd = supportCase.diagnosis?.proactiveDetection || null;
    const scanCtx = input.investigationContext || null;
    let updatedCase = await recordSupportDiagnosis(
        companyId,
        supportCase.id,
        {
            summary: assessment.summary,
            issueClass: assessment.issueClass,
            affectedService,
            checksPerformed: [
                ...(assessment.checksPerformed || []),
                ...(scanCtx ? [`proactive_scan:${scanCtx.trigger}`] : []),
            ],
            evidence: assessment.evidence,
            confidence: assessment.confidence,
            sarahConfidence: assessment.confidence,
            proactiveDetection: prevPd
                ? {
                      ...prevPd,
                      lastInvestigation: scanCtx
                          ? { ...scanCtx, at: new Date().toISOString() }
                          : prevPd.lastInvestigation,
                  }
                : undefined,
        },
        { uid: ctx.uid || "sarah" }
    );

    const policy = evaluateEscalationPolicy({
        issueClass: assessment.issueClass,
        category: updatedCase.category,
        severity: assessment.severity,
        failedRemediationCount: 0,
    });

    if (policy.mustEscalate && updatedCase.status !== "resolved") {
        updatedCase = await escalateSupportCase(
            companyId,
            supportCase.id,
            {
                reason: policy.reasons.join("; ") || "Escalation policy matched after diagnosis",
                ruleId: policy.matchedRule,
                sarahConfidence: assessment.confidence,
                recommendedOperatorAction:
                    assessment.issueClass === "credentials" ||
                    assessment.issueClass === "credentials_or_security"
                        ? "Verify Meta credentials and WhatsApp Business ownership in operator console."
                        : null,
            },
            { uid: ctx.uid || "sarah" }
        );
    } else if (assessment.demonstrablyResolved && assessment.confidence !== CONFIDENCE_LEVELS.LOW) {
        updatedCase = await resolveSupportCaseWithVerification(
            companyId,
            supportCase.id,
            {
                summary: "Diagnostics indicate service healthy at time of check; user report may be resolved.",
                autoResolved: true,
            },
            { uid: ctx.uid || "sarah" }
        );
    }

    let remediationResult = null;
    const autoAction = pickAutoRemediationAction(assessment, bundle);
    if (
        autoAction &&
        policy.mayAutoRemediate &&
        !policy.mustEscalate &&
        updatedCase.status !== "resolved"
    ) {
        const remCtx = { uid: ctx.uid || "sarah", companyId };
        if (autoAction === REMEDIATION_ACTIONS.RETRY_FAILED_WEBHOOK) {
            remediationResult = await runRetryFailedWebhookRemediation(
                companyId,
                updatedCase.id,
                remCtx
            );
        } else if (autoAction === REMEDIATION_ACTIONS.RESTART_STUCK_AGENT) {
            remediationResult = await runRestartStuckAgentRemediation(companyId, updatedCase.id, remCtx);
        } else if (autoAction === REMEDIATION_ACTIONS.REFRESH_INTEGRATION_STATE) {
            remediationResult = await runRefreshIntegrationStateRemediation(
                companyId,
                updatedCase.id,
                remCtx
            );
        }
        if (remediationResult?.supportCase) {
            updatedCase = remediationResult.supportCase;
        }
    }

    let userMessage = formatUserReply({
        affectedService,
        assessment,
        supportCase: updatedCase,
        correlated,
        configurationChanged: false,
    });
    userMessage = appendRemediationNote(userMessage, remediationResult);

    return {
        success: true,
        message: userMessage,
        completionType: "support_diagnosis",
        userFacingTruth: assessment.demonstrablyResolved
            ? "Diagnostics did not confirm an active fault; no fix was applied."
            : "Support case updated from read-only diagnostics; no remediation was applied.",
        data: {
            supportCase: updatedCase,
            correlated,
            affectedService,
            assessment,
            evidenceBundle: bundle,
            escalationPolicy: policy,
            remediation: remediationResult,
        },
        sessionContextPatch: {
            activeSupportCaseId: updatedCase.id,
            lastAffectedService: affectedService,
        },
    };
}
