/**
 * PI-4F-6 — Cross-organisation patterns for Attention Centre (taxonomy-aware).
 */
import { segmentFromCompanyRecord } from "../../../js/shared/organisationTaxonomy.js";
import { ORGANISATION_TYPE_LABELS } from "../../../js/shared/organisationTaxonomy.js";
import { classifyCaseAttention, ATTENTION_QUEUES } from "../attentionQueueClassification.js";
import { normalizeLifecycleStatus } from "../supportCaseModel.js";

function remediationStats(cases) {
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let escalated = 0;
    for (const c of cases) {
        const actions = c.actionsAttempted || [];
        attempted += actions.length;
        for (const a of actions) {
            if (a.outcome === "success" && a.verified) succeeded += 1;
            if (a.outcome === "failed") failed += 1;
        }
        if (["escalated", "human_action"].includes(normalizeLifecycleStatus(c.status))) {
            escalated += 1;
        }
    }
    return { attempted, succeeded, failed, escalated };
}

function commonSignal(cases) {
    const classes = new Map();
    for (const c of cases) {
        const ic = c.diagnosis?.issueClass || c.category || "other";
        classes.set(ic, (classes.get(ic) || 0) + 1);
    }
    let top = "other";
    let topN = 0;
    for (const [k, n] of classes.entries()) {
        if (n > topN) {
            top = k;
            topN = n;
        }
    }
    const labels = {
        credentials: "expired/invalid credentials",
        webhook_stale: "webhook delivery degradation",
        transient_retryable: "processing / webhook retries",
        stuck_agent: "AI employee health",
        integration_state: "integration state drift",
        repeated_remediation_failure: "repeated remediation failure",
    };
    return labels[top] || top.replace(/_/g, " ");
}

/**
 * @param {object[]} allCaseViews — platform support case views
 * @param {Map<string, object>} companyById
 */
export function buildPlatformAttentionPatterns(allCaseViews, companyById) {
    const attentionCases = allCaseViews.filter((c) => {
        const cl = classifyCaseAttention(c);
        return (
            cl.queue === ATTENTION_QUEUES.REQUIRES_ATTENTION ||
            cl.queue === ATTENTION_QUEUES.SARAH_MONITORING
        );
    });

    const groups = new Map();
    for (const c of attentionCases) {
        const service = c.affectedService || "platform";
        const problem = c.diagnosis?.issueClass || c.category || "other";
        const key = `${service}::${problem}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }

    const patterns = [];
    for (const [key, cases] of groups.entries()) {
        if (cases.length < 2) continue;
        const [affectedService, problemKey] = key.split("::");
        const orgTypes = new Map();
        const sectors = new Map();
        const orgIds = new Set();

        for (const c of cases) {
            orgIds.add(c.companyId);
            const company = companyById.get(c.companyId) || { id: c.companyId, name: c.companyName };
            const seg = segmentFromCompanyRecord(company);
            orgTypes.set(seg.organisationType, (orgTypes.get(seg.organisationType) || 0) + 1);
            sectors.set(seg.sectorId, (sectors.get(seg.sectorId) || 0) + 1);
        }

        const stats = remediationStats(cases);
        const requiresOperator = cases.filter(
            (c) => classifyCaseAttention(c).queue === ATTENTION_QUEUES.REQUIRES_ATTENTION
        ).length;

        patterns.push({
            key,
            affectedService,
            problemKey,
            organisationCount: orgIds.size,
            caseCount: cases.length,
            requiresAttentionCount: requiresOperator,
            organisationTypeBreakdown: Object.fromEntries(orgTypes),
            sectorBreakdown: Object.fromEntries(sectors),
            commonSignal: commonSignal(cases),
            remediation: stats,
            sampleOrganisations: cases.slice(0, 8).map((c) => ({
                companyId: c.companyId,
                companyName: c.companyName,
                issue: c.issue,
                severity: c.severity,
            })),
        });
    }

    patterns.sort((a, b) => b.organisationCount - a.organisationCount || b.caseCount - a.caseCount);

    const operatorNarratives = patterns.slice(0, 5).map(formatPatternNarrative);

    return {
        patterns: patterns.slice(0, 25),
        operatorNarratives,
        meta: { readOnly: true, dataSource: "support_cases_aggregated" },
    };
}

export function formatPatternNarrative(pattern) {
    const n = pattern.organisationCount;
    const typeParts = Object.entries(pattern.organisationTypeBreakdown || {})
        .map(([t, c]) => `${c} ${ORGANISATION_TYPE_LABELS[t] || t}`)
        .join(", ");
    const sectorParts = Object.entries(pattern.sectorBreakdown || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s, c]) => `${c} in ${s.replace(/_/g, " ")}`)
        .join("; ");
    const rem = pattern.remediation || {};
    let remLine = "";
    if (rem.attempted > 0) {
        remLine = ` Sarah attempted approved remediation on ${rem.succeeded + rem.failed} organisation(s); ${rem.escalated} remain escalated where operator action is required.`;
    }
    return (
        `🔴 Pattern: ${n} organisation(s) show ${pattern.affectedService} / ${pattern.problemKey} signals.` +
        (typeParts ? ` Breakdown: ${typeParts}.` : "") +
        (sectorParts ? ` Sectors: ${sectorParts}.` : "") +
        ` Common signal: ${pattern.commonSignal}.${remLine}`
    );
}
