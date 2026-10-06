/**
 * PI-4F-6 — Proactive detection thresholds and cooldowns (no separate alert store).
 */

export const PROACTIVE_DETECTION_RULES = {
    WHATSAPP_CREDENTIALS: "whatsapp_credentials",
    WHATSAPP_SETUP_INCOMPLETE: "whatsapp_setup_incomplete",
    WHATSAPP_NOT_CONFIGURED: "whatsapp_not_configured",
    WHATSAPP_RUNTIME_MONITOR: "whatsapp_runtime_monitor",
    WEBHOOK_DEGRADED: "webhook_degraded",
    QUEUE_FAILURE_SPIKE: "queue_failure_spike",
    AI_EMPLOYEE_UNHEALTHY: "ai_employee_unhealthy",
    REPEATED_ESCALATIONS: "repeated_escalations",
    ERROR_SURGE: "error_surge",
    INTEGRATION_ERROR_BOARD: "integration_error_board",
};

/** Cooldown after a closed/suppressed cycle before re-opening the same signature (ms). */
const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export const RULE_COOLDOWN_MS = {
    [PROACTIVE_DETECTION_RULES.WHATSAPP_CREDENTIALS]: 24 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.WHATSAPP_SETUP_INCOMPLETE]: 12 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.WHATSAPP_NOT_CONFIGURED]: 24 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.WHATSAPP_RUNTIME_MONITOR]: 6 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.WEBHOOK_DEGRADED]: 6 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.QUEUE_FAILURE_SPIKE]: 2 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.AI_EMPLOYEE_UNHEALTHY]: 12 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.REPEATED_ESCALATIONS]: 24 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.ERROR_SURGE]: 4 * 60 * 60 * 1000,
    [PROACTIVE_DETECTION_RULES.INTEGRATION_ERROR_BOARD]: 12 * 60 * 60 * 1000,
};

export function getRuleCooldownMs(ruleId) {
    return RULE_COOLDOWN_MS[ruleId] ?? DEFAULT_COOLDOWN_MS;
}

export function getProactiveScanLimits() {
    const maxTenants = Math.min(Number(process.env.PROACTIVE_DETECTION_MAX_TENANTS) || 100, 500);
    const autoInvestigate =
        String(process.env.PROACTIVE_DETECTION_AUTO_INVESTIGATE || "true").toLowerCase() !== "false";
    return { maxTenants, autoInvestigate };
}

export const PROACTIVE_THRESHOLDS = {
    queueFailedJobs: 2,
    errorSurgeCount: 4,
    repeatedEscalations: 2,
};
