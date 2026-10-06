/**

 * PI-4F-6 — Deterministic proactive rules (evidence from existing read models only).

 */

import {

    gatherWhatsAppConnectionState,

    gatherWebhookStatus,

    gatherRecentErrors,

    gatherAiEmployeeStatus,

    gatherSupportHistory,

} from "../diagnostics/gatherTenantDiagnostics.js";

import { ESCALATION_ISSUE_CLASSES } from "../escalationPolicy.js";

import {

    PROACTIVE_DETECTION_RULES,

    PROACTIVE_THRESHOLDS,

} from "./proactiveDetectionConfig.js";

import {

    integrationBoardCredentialFailure,

    isActualCredentialFailure,

    isWhatsAppSetupIncomplete,

} from "./whatsappProactiveSignals.js";



function buildFinding(partial) {

    return {

        severity: partial.severity || "medium",

        confidence: partial.confidence || "medium",

        issueClass: partial.issueClass || null,

        affectedService: partial.affectedService || "platform",

        category: partial.category || "integrations",

        subject: partial.subject,

        issue: partial.issue || partial.subject,

        investigationMessage: partial.investigationMessage || partial.issue,

        evidence: partial.evidence || [],

        ruleId: partial.ruleId,

        signature: partial.signature,

    };

}



function evaluateWhatsAppFindings(wa, webhook, companyId, hints) {

    const findings = [];

    const cid = companyId;



    if (!wa.present) {
        // No proactive case — optional configuration signal belongs in PI / integrations census, not support cases at scale.
        return findings;
    }



    const credFailure =

        isActualCredentialFailure(wa.lastError) ||

        integrationBoardCredentialFailure(hints.integrationError, wa);



    if (credFailure) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.WHATSAPP_CREDENTIALS,

                signature: `${cid}:${PROACTIVE_DETECTION_RULES.WHATSAPP_CREDENTIALS}`,

                severity: "high",

                confidence: "high",

                issueClass: ESCALATION_ISSUE_CLASSES.CREDENTIALS,

                affectedService: "whatsapp",

                category: "security",

                subject: "Proactive: WhatsApp authentication or credential failure",

                issue: "WhatsApp integration reports an authentication or credential failure",

                investigationMessage:

                    "Proactive detection: explicit WhatsApp/Meta authentication or credential failure detected.",

                evidence: [

                    wa.lastError

                        ? { source: "whatsapp_integration", detail: String(wa.lastError).slice(0, 240) }

                        : { source: "platform_integrations_board", detail: "error bucket with auth evidence" },

                    { source: "whatsapp_integration", detail: `runtimeReady=${wa.runtimeReady}` },

                ].filter(Boolean),

            })

        );

        return findings;

    }



    if (isWhatsAppSetupIncomplete(wa)) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.WHATSAPP_SETUP_INCOMPLETE,

                signature: `${cid}:${PROACTIVE_DETECTION_RULES.WHATSAPP_SETUP_INCOMPLETE}`,

                severity: "low",

                confidence: "high",

                issueClass: ESCALATION_ISSUE_CLASSES.INTEGRATION_STATE,

                affectedService: "whatsapp",

                subject: "Proactive: WhatsApp setup incomplete",

                issue: "WhatsApp integration setup is incomplete (not a credential failure)",

                investigationMessage:

                    "Proactive detection: WhatsApp setup appears incomplete — configuration fields missing.",

                evidence: [

                    { source: "whatsapp_integration", detail: `runtimeReady=${wa.runtimeReady}` },

                    {

                        source: "whatsapp_integration",

                        detail: `missing=${(wa.missing || []).join(",") || "none"}`,

                    },

                ],

            })

        );

        return findings;

    }



    if (!wa.runtimeReady && !wa.lastError) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.WHATSAPP_RUNTIME_MONITOR,

                signature: `${cid}:${PROACTIVE_DETECTION_RULES.WHATSAPP_RUNTIME_MONITOR}`,

                severity: "medium",

                confidence: "medium",

                issueClass: ESCALATION_ISSUE_CLASSES.WEBHOOK_STALE,

                affectedService: "whatsapp",

                subject: "Proactive: WhatsApp runtime not ready (monitor)",

                issue: "WhatsApp integration is not runtime-ready — monitoring recommended",

                investigationMessage:

                    "Proactive detection: WhatsApp runtime readiness check failed without an explicit error.",

                evidence: [

                    { source: "whatsapp_integration", detail: "runtimeReady=false" },

                    { source: "webhook_status", detail: webhook.assessment || "unknown" },

                ],

            })

        );

        return findings;

    }



    if (webhook.assessment === "degraded" || webhook.assessment === "not_ready") {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.WEBHOOK_DEGRADED,

                signature: `${cid}:${PROACTIVE_DETECTION_RULES.WEBHOOK_DEGRADED}`,

                severity: "medium",

                confidence: "medium",

                issueClass: ESCALATION_ISSUE_CLASSES.WEBHOOK_STALE,

                affectedService: "whatsapp",

                subject: "Proactive: WhatsApp webhook degraded",

                issue: "WhatsApp webhook path is degraded or not ready",

                investigationMessage:

                    "Proactive detection: WhatsApp webhook delivery appears degraded — investigate integration readiness.",

                evidence: (webhook.notes || []).map((n) => ({ source: "webhook_status", detail: n })),

            })

        );

    }



    return findings;

}



/**

 * @param {object} company — tenant record

 * @param {{ integrationError?: boolean }} hints — from platform integrations board

 */

export async function evaluateProactiveFindingsForTenant(company, hints = {}) {

    const companyId = company.id;

    const findings = [];



    const [wa, webhook, errors, ai, supportHist] = await Promise.all([

        gatherWhatsAppConnectionState(companyId),

        gatherWebhookStatus(companyId),

        gatherRecentErrors(companyId),

        gatherAiEmployeeStatus(companyId),

        gatherSupportHistory(companyId, { limit: 25 }),

    ]);



    findings.push(...evaluateWhatsAppFindings(wa, webhook, companyId, hints));



    const failedJobs = (errors.items || []).filter((e) => e.source === "message_queue").length;



    if (failedJobs >= PROACTIVE_THRESHOLDS.queueFailedJobs) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.QUEUE_FAILURE_SPIKE,

                signature: `${companyId}:${PROACTIVE_DETECTION_RULES.QUEUE_FAILURE_SPIKE}`,

                severity: failedJobs >= 4 ? "high" : "medium",

                confidence: "high",

                issueClass: ESCALATION_ISSUE_CLASSES.TRANSIENT_RETRYABLE,

                affectedService: "whatsapp",

                subject: "Proactive: message processing failure spike",

                issue: `${failedJobs} failed message queue jobs detected`,

                investigationMessage:

                    "Proactive detection: multiple WhatsApp message processing failures detected in the queue.",

                evidence: (errors.items || [])

                    .filter((e) => e.source === "message_queue")

                    .slice(0, 5)

                    .map((e) => ({ source: "message_queue", detail: e.message })),

            })

        );

    }



    if (

        ai.count > 0 &&

        ai.whatsappWorkspaceReady &&

        ai.receivingWhatsAppCount === 0

    ) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.AI_EMPLOYEE_UNHEALTHY,

                signature: `${companyId}:${PROACTIVE_DETECTION_RULES.AI_EMPLOYEE_UNHEALTHY}`,

                severity: "medium",

                confidence: "medium",

                issueClass: ESCALATION_ISSUE_CLASSES.STUCK_AGENT,

                affectedService: "ai_employee",

                category: "ai_employee",

                subject: "Proactive: AI employees not receiving WhatsApp conversations",

                issue: "AI employees deployed but none are receiving WhatsApp traffic",

                investigationMessage:

                    "Proactive detection: AI employees appear unhealthy — workspace ready but no WhatsApp receiving agents.",

                evidence: [

                    { source: "ai_employee_status", detail: `agents=${ai.count}` },

                    { source: "ai_employee_status", detail: `receivingWhatsApp=${ai.receivingWhatsAppCount}` },

                ],

            })

        );

    }



    const escalatedRecent = (supportHist.cases || []).filter((c) =>

        ["escalated", "human_action"].includes(String(c.status || "").toLowerCase())

    );

    if (escalatedRecent.length >= PROACTIVE_THRESHOLDS.repeatedEscalations) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.REPEATED_ESCALATIONS,

                signature: `${companyId}:${PROACTIVE_DETECTION_RULES.REPEATED_ESCALATIONS}`,

                severity: "high",

                confidence: "high",

                issueClass: ESCALATION_ISSUE_CLASSES.REPEATED_REMEDIATION_FAILURE,

                affectedService: "platform",

                subject: "Proactive: repeated support escalations",

                issue: "Multiple support cases recently escalated for this organisation",

                investigationMessage:

                    "Proactive detection: this organisation has repeated escalated support cases.",

                evidence: escalatedRecent

                    .slice(0, 4)

                    .map((c) => ({ source: "support_history", detail: `${c.id}: ${c.issue}` })),

            })

        );

    }



    if (errors.count >= PROACTIVE_THRESHOLDS.errorSurgeCount) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.ERROR_SURGE,

                signature: `${companyId}:${PROACTIVE_DETECTION_RULES.ERROR_SURGE}`,

                severity: errors.count >= 8 ? "high" : "medium",

                confidence: "medium",

                issueClass: ESCALATION_ISSUE_CLASSES.TRANSIENT_RETRYABLE,

                affectedService: "platform",

                subject: "Proactive: unusual error activity",

                issue: `Elevated error signals (${errors.count}) across integration and processing`,

                investigationMessage:

                    "Proactive detection: unusual increase in integration and processing errors.",

                evidence: (errors.items || [])

                    .slice(0, 6)

                    .map((e) => ({ source: e.source, detail: e.message })),

            })

        );

    }



    if (hints.integrationError && wa.present && isActualCredentialFailure(wa.lastError)) {

        findings.push(

            buildFinding({

                ruleId: PROACTIVE_DETECTION_RULES.INTEGRATION_ERROR_BOARD,

                signature: `${companyId}:${PROACTIVE_DETECTION_RULES.INTEGRATION_ERROR_BOARD}`,

                severity: "high",

                confidence: "high",

                issueClass: ESCALATION_ISSUE_CLASSES.CREDENTIALS,

                affectedService: "whatsapp",

                category: "security",

                subject: "Proactive: integrations board credential error",

                issue: "Platform integrations board error state with authentication evidence",

                investigationMessage:

                    "Proactive detection: WhatsApp integration error bucket with credential/authentication evidence.",

                evidence: [

                    { source: "platform_integrations_board", detail: "whatsappTenants.error" },

                    { source: "whatsapp_integration", detail: String(wa.lastError).slice(0, 200) },

                ],

            })

        );

    }



    return findings;

}


