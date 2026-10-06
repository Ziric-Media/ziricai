/**
 * PI-4F-3 — Configurable remediation rate limits (env overrides).
 */

function intEnv(name, fallback) {
    const n = parseInt(process.env[name] || "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const REMEDIATION_ACTIONS = {
    RETRY_FAILED_WEBHOOK: "retryFailedWebhook",
    RESTART_STUCK_AGENT: "restartStuckAgent",
    REFRESH_INTEGRATION_STATE: "refreshIntegrationState",
};

export function getRemediationLimits() {
    return {
        [REMEDIATION_ACTIONS.RETRY_FAILED_WEBHOOK]: {
            maxAttemptsPerCase: intEnv("REMEDIATION_WEBHOOK_MAX_PER_CASE", 3),
            windowMs: intEnv("REMEDIATION_WEBHOOK_WINDOW_MS", 60 * 60 * 1000),
        },
        [REMEDIATION_ACTIONS.RESTART_STUCK_AGENT]: {
            maxAttemptsPerCase: intEnv("REMEDIATION_AGENT_MAX_PER_CASE", 2),
            windowMs: intEnv("REMEDIATION_AGENT_COOLDOWN_MS", 15 * 60 * 1000),
            cooldownPerAgentMs: intEnv("REMEDIATION_AGENT_COOLDOWN_MS", 15 * 60 * 1000),
        },
        [REMEDIATION_ACTIONS.REFRESH_INTEGRATION_STATE]: {
            maxAttemptsPerCase: intEnv("REMEDIATION_INTEGRATION_MAX_PER_CASE", 2),
            windowMs: intEnv("REMEDIATION_INTEGRATION_COOLDOWN_MS", 30 * 60 * 1000),
        },
    };
}
