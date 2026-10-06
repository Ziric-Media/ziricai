/**
 * PI-4F-3 — Map diagnosis issue class to first safe auto-remediation (if any).
 */
import { ESCALATION_ISSUE_CLASSES } from "../escalationPolicy.js";
import { REMEDIATION_ACTIONS } from "./remediationConfig.js";

/**
 * @returns {string|null} action id
 */
export function pickAutoRemediationAction(assessment, bundle) {
    const ic = assessment?.issueClass;
    if (ic === ESCALATION_ISSUE_CLASSES.TRANSIENT_RETRYABLE && bundle?.errors?.processingFailuresDetected) {
        return REMEDIATION_ACTIONS.RETRY_FAILED_WEBHOOK;
    }
    if (ic === ESCALATION_ISSUE_CLASSES.WEBHOOK_STALE && bundle?.errors?.processingFailuresDetected) {
        return REMEDIATION_ACTIONS.RETRY_FAILED_WEBHOOK;
    }
    if (ic === ESCALATION_ISSUE_CLASSES.INTEGRATION_STATE && bundle?.whatsapp?.runtimeReady) {
        return REMEDIATION_ACTIONS.REFRESH_INTEGRATION_STATE;
    }
    if (ic === ESCALATION_ISSUE_CLASSES.STUCK_AGENT) {
        return REMEDIATION_ACTIONS.RESTART_STUCK_AGENT;
    }
    return null;
}
