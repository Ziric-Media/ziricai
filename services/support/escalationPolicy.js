/**
 * PI-4F-1 — Explicit escalation rules (no LLM decisions).
 */

export const ESCALATION_ISSUE_CLASSES = {
    CREDENTIALS: "credentials",
    META_OWNERSHIP: "meta_ownership",
    BILLING_DISPUTE: "billing_dispute",
    SECURITY: "security",
    PRIVACY: "privacy",
    REPEATED_REMEDIATION_FAILURE: "repeated_remediation_failure",
    DESTRUCTIVE_ACTION: "destructive_action",
    POLICY_OUT_OF_SCOPE: "policy_out_of_scope",
    TRANSIENT_RETRYABLE: "transient_retryable",
    STUCK_AGENT: "stuck_agent",
    INDEX_REPAIR: "index_repair",
    WEBHOOK_STALE: "webhook_stale",
    INTEGRATION_STATE: "integration_state",
};

/** Issue classes Sarah may attempt auto-remediation (PI-4F-3 tools). */
export const AUTO_REMEDIATION_ALLOWED = new Set([
    ESCALATION_ISSUE_CLASSES.TRANSIENT_RETRYABLE,
    ESCALATION_ISSUE_CLASSES.STUCK_AGENT,
    ESCALATION_ISSUE_CLASSES.INDEX_REPAIR,
    ESCALATION_ISSUE_CLASSES.WEBHOOK_STALE,
    ESCALATION_ISSUE_CLASSES.INTEGRATION_STATE,
]);

/**
 * @param {object} input
 * @param {string} [input.issueClass]
 * @param {string} [input.category]
 * @param {string} [input.severity]
 * @param {number} [input.failedRemediationCount]
 * @param {boolean} [input.requiresDestructiveAction]
 */
export function evaluateEscalationPolicy(input = {}) {
    const issueClass = String(input.issueClass || "").toLowerCase();
    const category = String(input.category || "").toLowerCase();
    const failed = Number(input.failedRemediationCount || 0);
    const destructive = Boolean(input.requiresDestructiveAction);

    const reasons = [];
    let mustEscalate = false;
    let mayAutoRemediate = false;
    let matchedRule = null;

    const escalate = (ruleId, reason) => {
        mustEscalate = true;
        matchedRule = ruleId;
        reasons.push(reason);
    };

    if (destructive) escalate("destructive_action", "Destructive action requested");
    if (failed >= 2) escalate("repeated_remediation_failure", "Repeated remediation failure");
    if (issueClass === ESCALATION_ISSUE_CLASSES.CREDENTIALS || category === "security") {
        escalate("credentials_or_security", "Credentials or security issue");
    }
    if (issueClass === ESCALATION_ISSUE_CLASSES.META_OWNERSHIP) {
        escalate("meta_ownership", "Meta account ownership issue");
    }
    if (issueClass === ESCALATION_ISSUE_CLASSES.BILLING_DISPUTE || category === "billing") {
        if (input.severity === "critical" || input.billingDispute) {
            escalate("billing_dispute", "Billing or payment dispute");
        }
    }
    if (issueClass === ESCALATION_ISSUE_CLASSES.PRIVACY || category === "privacy") {
        escalate("privacy", "Legal/privacy issue");
    }
    if (issueClass === ESCALATION_ISSUE_CLASSES.POLICY_OUT_OF_SCOPE) {
        escalate("policy_out_of_scope", "Outside approved remediation policy");
    }

    if (!mustEscalate && AUTO_REMEDIATION_ALLOWED.has(issueClass)) {
        mayAutoRemediate = true;
        matchedRule = matchedRule || `auto_remediation_${issueClass}`;
    }

    return {
        mustEscalate,
        mayAutoRemediate,
        matchedRule,
        reasons,
        issueClass: issueClass || null,
    };
}
