/**
 * PI-4F-6 — Audit payload for proactive scan apply / duplicate investigate paths.
 */

export function buildProactiveScanAudit({
    finding,
    dedupeResult,
    existingCaseId,
    investigationTriggered,
    investigation,
}) {
    const data = investigation?.data || {};
    const assessment = data.assessment || {};
    const policy = data.escalationPolicy || {};
    const rem = data.remediation || null;
    const supportCase = data.supportCase || {};

    return {
        findingRule: finding?.ruleId || null,
        findingSignature: finding?.signature || null,
        dedupeResult: dedupeResult || null,
        existingCaseId: existingCaseId || null,
        investigationTriggered: Boolean(investigationTriggered),
        investigationContext: investigation?.investigationContext || null,
        diagnosis: assessment.summary
            ? {
                  summary: assessment.summary,
                  issueClass: assessment.issueClass,
                  severity: assessment.severity,
                  confidence: assessment.confidence,
              }
            : null,
        escalationPolicy: {
            mustEscalate: policy.mustEscalate,
            mayAutoRemediate: policy.mayAutoRemediate,
            matchedRule: policy.matchedRule,
        },
        remediationSelected: rem?.action || rem?.tool || null,
        remediationExecuted: rem
            ? {
                  outcome: rem.outcome,
                  verified: rem.verified,
                  skipped: rem.skipped,
              }
            : null,
        verification: rem?.verified === true ? "verified" : rem ? "not_verified" : "none",
        finalLifecycle: supportCase.status || null,
        recordedAt: new Date().toISOString(),
        cleanupActor: "proactive-detection",
    };
}
