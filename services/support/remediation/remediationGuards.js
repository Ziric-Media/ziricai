/**
 * PI-4F-3 — Shared precondition helpers.
 */
import { ESCALATION_ISSUE_CLASSES } from "../escalationPolicy.js";
import { getRemediationLimits } from "./remediationConfig.js";

const CREDENTIAL_PATTERNS = [
    /\b401\b/,
    /\b403\b/,
    /unauthorized/i,
    /invalid.?token/i,
    /expired/i,
    /oauth/i,
    /credential/i,
];

export function looksLikeCredentialProblem(textOrError) {
    const s = String(textOrError || "");
    if (!s) return false;
    return CREDENTIAL_PATTERNS.some((p) => p.test(s));
}

export function isCredentialIssueClass(issueClass) {
    const ic = String(issueClass || "").toLowerCase();
    return (
        ic === ESCALATION_ISSUE_CLASSES.CREDENTIALS ||
        ic === "credentials_or_security" ||
        ic === ESCALATION_ISSUE_CLASSES.META_OWNERSHIP
    );
}

/**
 * Count recent remediation attempts on case for rate limiting.
 */
export function countRecentAttempts(supportCase, action, windowMs) {
    const since = Date.now() - windowMs;
    const actions = supportCase?.actionsAttempted || [];
    return actions.filter((a) => {
        if (a.tool !== action) return false;
        const at = a.at ? Date.parse(a.at) : 0;
        return at >= since;
    }).length;
}

export function rateLimitExceeded(supportCase, action) {
    const limits = getRemediationLimits()[action];
    if (!limits) return { exceeded: false };
    const count = countRecentAttempts(supportCase, action, limits.windowMs);
    if (count >= limits.maxAttemptsPerCase) {
        return {
            exceeded: true,
            reason: `Rate limit: ${action} already attempted ${count} time(s) in the current window.`,
        };
    }
    return { exceeded: false, count };
}

export function assertTenantScope(companyId, ctx) {
    if (!companyId) return { ok: false, reason: "Missing tenant scope" };
    if (ctx?.companyId && ctx.companyId !== companyId) {
        return { ok: false, reason: "Tenant scope mismatch" };
    }
    return { ok: true };
}
