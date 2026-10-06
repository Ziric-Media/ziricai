/**
 * PI-4F-5 — Three-queue attention classification (deterministic).
 */
import { normalizeLifecycleStatus } from "./supportCaseModel.js";
import { ESCALATION_ISSUE_CLASSES } from "./escalationPolicy.js";

export const ATTENTION_QUEUES = {
    REQUIRES_ATTENTION: "requires_attention",
    SARAH_MONITORING: "sarah_monitoring",
    RESOLVED: "resolved",
};

const CREDENTIAL_CLASSES = new Set([
    ESCALATION_ISSUE_CLASSES.CREDENTIALS,
    "credentials_or_security",
    ESCALATION_ISSUE_CLASSES.META_OWNERSHIP,
    ESCALATION_ISSUE_CLASSES.SECURITY,
]);

function failedRemediationCount(caseView) {
    return (caseView.actionsAttempted || []).filter((a) => a.outcome === "failed").length;
}

function lastRemediationOutcome(caseView) {
    const actions = caseView.actionsAttempted || [];
    if (!actions.length) return null;
    return actions[actions.length - 1];
}

function isCredentialIssue(caseView) {
    const ruleId = caseView.diagnosis?.proactiveDetection?.ruleId;
    if (ruleId === "whatsapp_setup_incomplete") return false;
    const ic = String(caseView.diagnosis?.issueClass || "").toLowerCase();
    return CREDENTIAL_CLASSES.has(ic) || caseView.category === "security";
}

function isBillingCritical(caseView) {
    return caseView.category === "billing" && caseView.severity === "critical";
}

/**
 * @returns {{ queue: string, reason: string, category: string }}
 */
export function classifyCaseAttention(caseView) {
    const lifecycle = normalizeLifecycleStatus(caseView.status);
    const sev = caseView.severity || "medium";
    const failed = failedRemediationCount(caseView);
    const lastAction = lastRemediationOutcome(caseView);

    if (lifecycle === "resolved") {
        if (caseView.resolution?.superseded === true) {
            return {
                queue: ATTENTION_QUEUES.RESOLVED,
                reason: "Superseded by detection-rule correction (not operator verified)",
                category: "resolved",
            };
        }
        const conf = String(caseView.sarahConfidence || caseView.diagnosis?.confidence || "").toLowerCase();
        const auto = caseView.resolution?.autoResolved === true;
        if (auto && (conf === "medium" || conf === "low")) {
            return {
                queue: ATTENTION_QUEUES.SARAH_MONITORING,
                reason: "Auto-resolved with medium/low confidence — monitoring for recurrence",
                category: "monitoring",
            };
        }
        if (auto && lastAction?.outcome === "success" && lastAction?.verified) {
            return {
                queue: ATTENTION_QUEUES.RESOLVED,
                reason: "Verified remediation and resolution",
                category: "resolved",
            };
        }
        return {
            queue: ATTENTION_QUEUES.RESOLVED,
            reason: caseView.resolution?.summary || "Case resolved",
            category: "resolved",
        };
    }

    if (lifecycle === "escalated" || lifecycle === "human_action") {
        return {
            queue: ATTENTION_QUEUES.REQUIRES_ATTENTION,
            reason: caseView.escalation?.reason || "Escalated for platform operator",
            category: escalationCategory(caseView),
        };
    }

    if (isCredentialIssue(caseView) || isBillingCritical(caseView)) {
        return {
            queue: ATTENTION_QUEUES.REQUIRES_ATTENTION,
            reason: isCredentialIssue(caseView)
                ? "Credentials or Meta ownership requires operator"
                : "Critical billing issue",
            category: isCredentialIssue(caseView) ? "credentials" : "billing",
        };
    }

    if (failed >= 2 || (lastAction?.outcome === "failed" && lifecycle !== "resolved")) {
        return {
            queue: ATTENTION_QUEUES.REQUIRES_ATTENTION,
            reason: "Repeated or failed remediation — operator review required",
            category: "repeated_failure",
        };
    }

    if ((sev === "critical" || sev === "high") && ["open", "investigating"].includes(lifecycle)) {
        if (failed >= 1 || caseView.escalation) {
            return {
                queue: ATTENTION_QUEUES.REQUIRES_ATTENTION,
                reason: `High severity case with failed remediation or escalation signal`,
                category: "high_severity",
            };
        }
    }

    if (lifecycle === "investigating") {
        if (lastAction?.outcome === "success" && lastAction?.verified) {
            return {
                queue: ATTENTION_QUEUES.SARAH_MONITORING,
                reason: "Remediation succeeded — awaiting stability confirmation",
                category: "monitoring",
            };
        }
        const conf = String(caseView.sarahConfidence || caseView.diagnosis?.confidence || "").toLowerCase();
        if (conf === "medium" || conf === "low") {
            return {
                queue: ATTENTION_QUEUES.SARAH_MONITORING,
                reason: "Investigation in progress with medium/low diagnostic confidence",
                category: "monitoring",
            };
        }
    }

    if (lifecycle === "open" && sev === "critical") {
        return {
            queue: ATTENTION_QUEUES.REQUIRES_ATTENTION,
            reason: "Critical open case",
            category: "high_severity",
        };
    }

    if (lifecycle === "investigating") {
        return {
            queue: ATTENTION_QUEUES.SARAH_MONITORING,
            reason: "Sarah investigating",
            category: "monitoring",
        };
    }

    return {
        queue: ATTENTION_QUEUES.SARAH_MONITORING,
        reason: "Active support case under Sarah workflow",
        category: "monitoring",
    };
}

function escalationCategory(caseView) {
    if (isCredentialIssue(caseView)) return "credentials";
    if (isBillingCritical(caseView)) return "billing";
    if (failedRemediationCount(caseView) >= 2) return "repeated_failure";
    if (caseView.severity === "critical") return "platform_wide";
    return "other";
}

export function buildAttentionEvidence(caseView) {
    return {
        caseId: caseView.id,
        companyId: caseView.companyId,
        companyName: caseView.companyName,
        issue: caseView.issue,
        severity: caseView.severity,
        affectedService: caseView.affectedService,
        source: caseView.source,
        diagnosis: caseView.diagnosis,
        proactiveDetection: caseView.diagnosis?.proactiveDetection || null,
        actionsAttempted: caseView.actionsAttempted || [],
        sarahConfidence: caseView.sarahConfidence,
        escalation: caseView.escalation,
        resolution: caseView.resolution,
        lastActivitySummary: caseView.lastActivitySummary,
    };
}
