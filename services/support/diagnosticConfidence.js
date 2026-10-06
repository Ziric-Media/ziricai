/**
 * PI-4F-2 — Explicit diagnostic confidence from evidence (no LLM).
 */
import { ESCALATION_ISSUE_CLASSES } from "./escalationPolicy.js";

export const CONFIDENCE_LEVELS = {
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
};

/**
 * @param {object} input
 * @param {string} input.affectedService
 * @param {object} [input.bundle] gatherServiceDiagnosticBundle
 */
export function assessDiagnosticFromEvidence(input = {}) {
    const service = String(input.affectedService || "platform").toLowerCase();
    const bundle = input.bundle || {};
    const evidence = [];
    let issueClass = null;
    let summary = "Issue requires further investigation.";
    let confidence = CONFIDENCE_LEVELS.LOW;
    let severity = "medium";
    let demonstrablyResolved = false;

    const wa = bundle.whatsapp;
    const webhook = bundle.webhook;
    const errors = bundle.errors;
    const messages = bundle.messages;

    if (service === "whatsapp" || service === "platform") {
        if (!wa?.present) {
            issueClass = ESCALATION_ISSUE_CLASSES.INTEGRATION_STATE;
            summary = "WhatsApp is not configured for this workspace.";
            confidence = CONFIDENCE_LEVELS.HIGH;
            severity = "high";
            evidence.push("No WhatsApp integration document found.");
        } else if (!wa.runtimeReady) {
            issueClass = ESCALATION_ISSUE_CLASSES.INTEGRATION_STATE;
            summary = "WhatsApp integration exists but is not runtime-ready.";
            confidence = CONFIDENCE_LEVELS.HIGH;
            severity = "high";
            evidence.push(`Missing or incomplete: ${(wa.missing || []).join(", ") || "configuration"}.`);
        } else if (errors?.processingFailuresDetected) {
            issueClass = ESCALATION_ISSUE_CLASSES.TRANSIENT_RETRYABLE;
            summary = "WhatsApp is connected but recent message-processing failures were detected.";
            confidence = CONFIDENCE_LEVELS.HIGH;
            severity = "high";
            evidence.push("Connection configured and runtime-ready.");
            if (messages?.recentActivityDetected) {
                evidence.push("Recent inbound message activity detected in inbox sample.");
            }
            evidence.push("Processing failures detected in queue or integration errors.");
        } else if (wa.lastError) {
            issueClass = ESCALATION_ISSUE_CLASSES.WEBHOOK_STALE;
            summary = "WhatsApp connection is present but integration reports an error state.";
            confidence = CONFIDENCE_LEVELS.MEDIUM;
            severity = "high";
            evidence.push(`Integration lastError: ${String(wa.lastError).slice(0, 120)}`);
        } else if (webhook?.assessment === "likely_active" && messages?.recentActivityDetected) {
            summary = "WhatsApp appears connected with recent message activity; no failures detected in this check.";
            confidence = CONFIDENCE_LEVELS.MEDIUM;
            severity = "low";
            evidence.push("Runtime-ready WhatsApp integration.");
            evidence.push("Recent WhatsApp conversation activity in sample.");
            demonstrablyResolved = true;
        } else if (webhook?.assessment === "likely_active") {
            summary = "WhatsApp connection looks configured; no recent failures detected (limited message sample).";
            confidence = CONFIDENCE_LEVELS.MEDIUM;
            severity = "medium";
            evidence.push("Runtime-ready WhatsApp integration.");
        }
    }

    if (service === "ai_employee" && bundle.aiEmployees) {
        const ae = bundle.aiEmployees;
        if (ae.count === 0) {
            summary = "No AI employees configured in this workspace.";
            confidence = CONFIDENCE_LEVELS.HIGH;
            severity = "medium";
            evidence.push("AI employee count is zero.");
        } else if (!ae.whatsappWorkspaceReady && ae.count > 0) {
            summary = "AI employees exist but WhatsApp is not ready to receive conversations.";
            confidence = CONFIDENCE_LEVELS.MEDIUM;
            severity = "medium";
            evidence.push(`${ae.count} AI employee(s) configured.`);
            evidence.push("WhatsApp workspace channel not runtime-ready.");
        }
    }

    if (service === "knowledge" && bundle.knowledge && !bundle.knowledge.hasDocuments) {
        summary = "Knowledge base has no documents indexed.";
        confidence = CONFIDENCE_LEVELS.HIGH;
        severity = "medium";
        evidence.push("Knowledge document count is zero.");
    }

    if (!evidence.length) {
        evidence.push("Insufficient direct evidence — continuing investigation.");
    }

    return {
        summary,
        issueClass,
        confidence,
        severity,
        evidence,
        demonstrablyResolved,
        checksPerformed: [
            "diagnoseWhatsAppIntegration",
            "viewWebhookStatus",
            "viewRecentErrors",
            "viewRecentMessages",
            "viewAiEmployeeStatus",
            "viewKnowledgeBaseStatus",
            "viewSupportHistory",
        ],
    };
}
