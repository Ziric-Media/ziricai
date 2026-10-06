/**
 * PI-4F-4 — Platform Support Operations read model (Sarah activity + remediation audit).
 */
import { listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { listSupportCasesPage } from "../tenants/supportCaseService.js";
import { listRemediationAuditsPage } from "./remediation/remediationAuditService.js";
import { buildSupportDimensions } from "./supportDimensionalSnapshot.js";
import { normalizeLifecycleStatus } from "./supportCaseModel.js";
import {
    PERIOD_GRAINS,
    periodKeyForGrain,
    utcDateKey,
} from "../platformIntelligence/periodKeys.js";

async function mapPool(items, limit, fn) {
    const results = [];
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            results[idx] = await fn(items[idx], idx);
        }
    }
    const workers = Array.from({ length: Math.min(limit, items.length || 1) }, () => worker());
    await Promise.all(workers);
    return results.flat().filter(Boolean);
}

function resolvePeriodQuery(query = {}) {
    const period = String(query.period || "day").toLowerCase();
    if (!PERIOD_GRAINS.includes(period)) {
        return { error: `Unsupported period "${period}"`, supportedPeriods: PERIOD_GRAINS };
    }
    const anchor = query.date || query.periodKey || utcDateKey(new Date());
    const periodKey =
        period === "day"
            ? String(anchor).slice(0, 10)
            : periodKeyForGrain(period, `${String(anchor).slice(0, 10)}T12:00:00.000Z`);
    return { period, periodKey };
}

function timestampInPeriod(iso, period, periodKey) {
    if (!iso) return false;
    const t = String(iso);
    if (period === "day") return t.slice(0, 10) === periodKey;
    if (period === "month") return t.slice(0, 7) === periodKey;
    if (period === "week") return periodKeyForGrain("week", t) === periodKey;
    return false;
}

function msBetween(start, end) {
    const a = Date.parse(start);
    const b = Date.parse(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, b - a);
}

function actionLabel(action) {
    const map = {
        retryFailedWebhook: "Retry webhook",
        restartStuckAgent: "Restart AI employee",
        refreshIntegrationState: "Refresh integration",
    };
    return map[action] || action;
}

function toActionRow(audit, companyName) {
    const dims = audit.dimensions || {};
    const preOk = audit.preconditions?.ok === true;
    const verified = audit.success === true;
    let resultLabel = "Failed";
    if (audit.outcome === "skipped") resultLabel = "Skipped";
    else if (verified) resultLabel = "Resolved";
    else if (audit.escalated) resultLabel = "Escalated";

    return {
        id: `${audit.companyId || dims.companyId}:${audit.id}`,
        auditId: audit.id,
        companyId: dims.companyId || audit.companyId,
        companyName: dims.companyName || companyName || dims.companyId,
        organisationType: dims.organisationType,
        sectorId: dims.sectorId,
        sectorLabel: dims.sectorLabel,
        country: dims.country,
        region: dims.region,
        supportCaseId: audit.supportCaseId,
        issue: dims.issue || audit.diagnosis?.summary || "Support issue",
        affectedService: dims.affectedService,
        severity: dims.severity,
        timestamp: audit.timestamp,
        action: audit.action,
        actionLabel: actionLabel(audit.action),
        diagnosis: audit.diagnosis || null,
        preconditions: audit.preconditions,
        preconditionsPassed: preOk,
        remediation: audit.result,
        postVerification: audit.postVerification,
        verified,
        outcome: audit.outcome,
        resultLabel,
        escalated: audit.escalated === true,
        sarahConfidence: audit.sarahConfidence,
        phases: audit.phases || null,
        failureReason: audit.failureReason,
        drillDown: {
            problemDetected: dims.issue || audit.diagnosis?.summary,
            diagnosis: audit.diagnosis,
            preconditions: audit.preconditions,
            action: { name: audit.action, result: audit.result },
            postVerification: audit.postVerification,
            outcome: audit.outcome,
            escalation: audit.escalated ? audit.failureReason : null,
        },
    };
}

function aggregateByKey(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
        const k = keyFn(row) || "unknown";
        map.set(k, (map.get(k) || 0) + 1);
    }
    return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

/**
 * @param {{ period?: string, date?: string, periodKey?: string, maxTenants?: number, actionsLimit?: number }} query
 */
export async function getPlatformSupportOperationsReadModel(query = {}) {
    const resolved = resolvePeriodQuery(query);
    if (resolved.error) {
        return { generatedAt: new Date().toISOString(), ...resolved };
    }
    const { period, periodKey } = resolved;
    const maxTenants = Math.min(Number(query.maxTenants) || 100, 500);
    const actionsLimit = Math.min(Number(query.actionsLimit) || 100, 200);

    let companies = [];
    try {
        companies = await listAllCompaniesFromStorage();
    } catch {
        companies = [];
    }
    const sample = companies.slice(0, maxTenants);
    const companyById = new Map(sample.map((c) => [c.id, c]));

    const allAudits = await mapPool(sample, 6, async (company) => {
        try {
            const page = await listRemediationAuditsPage(company.id, { limit: 50 });
            return page.items.map((a) => ({ ...a, companyId: company.id }));
        } catch {
            return [];
        }
    });

    const periodAudits = allAudits.filter((a) => timestampInPeriod(a.timestamp, period, periodKey));
    const actionRows = periodAudits
        .map((a) => toActionRow(a, companyById.get(a.companyId)?.name))
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, actionsLimit);

    const allCases = await mapPool(sample, 6, async (company) => {
        try {
            const page = await listSupportCasesPage(company.id, { limit: 40 });
            return page.items.map((c) => {
                const dims = buildSupportDimensions(company, c);
                return { ...c, companyId: company.id, dimensions: dims };
            });
        } catch {
            return [];
        }
    });

    const casesInPeriod = allCases.filter((c) => {
        const ts =
            c.diagnosis?.recordedAt ||
            c.resolvedAt ||
            c.updatedAt ||
            c.createdAt;
        return timestampInPeriod(ts, period, periodKey);
    });

    const investigated = casesInPeriod.filter((c) => c.diagnosis?.summary || c.diagnosis?.recordedAt);
    const resolvedSarah = casesInPeriod.filter(
        (c) =>
            normalizeLifecycleStatus(c.status) === "resolved" &&
            (c.resolution?.autoResolved === true || c.source === "sarah")
    );
    const escalated = casesInPeriod.filter((c) =>
        ["escalated", "human_action"].includes(normalizeLifecycleStatus(c.status))
    );

    const remediationAttempts = periodAudits.filter((a) => a.outcome !== "skipped");
    const successfulRemediations = periodAudits.filter((a) => a.success === true);
    const failedRemediations = periodAudits.filter(
        (a) => a.outcome !== "skipped" && a.success !== true && a.preconditions?.ok === true
    );

    const resolutionTimes = resolvedSarah
        .map((c) => msBetween(c.createdAt, c.resolvedAt || c.resolution?.verifiedAt))
        .filter((n) => n != null);
    const avgResolutionMs = resolutionTimes.length
        ? Math.round(resolutionTimes.reduce((s, n) => s + n, 0) / resolutionTimes.length)
        : null;

    const orgsAttention = new Set(
        allCases
            .filter((c) => ["escalated", "human_action", "open", "investigating"].includes(normalizeLifecycleStatus(c.status)))
            .filter((c) => c.severity === "critical" || c.severity === "high" || c.escalation)
            .map((c) => c.companyId)
    );

    const byAction = aggregateByKey(successfulRemediations, (a) => a.action);
    const byIssue = aggregateByKey(investigated, (c) => c.category || c.affectedService || "general");
    const byOrgType = aggregateByKey(investigated, (c) => c.dimensions?.organisationType);
    const bySector = aggregateByKey(investigated, (c) => c.dimensions?.sectorLabel || c.dimensions?.sectorId);

    const attemptCount = remediationAttempts.length;
    const successRate =
        attemptCount > 0 ? Math.round((successfulRemediations.length / attemptCount) * 1000) / 10 : null;

    return {
        period,
        periodKey,
        generatedAt: new Date().toISOString(),
        meta: {
            dataSource: "support_operations_read_model",
            readOnly: true,
            network: "support",
            tenantsSampled: sample.length,
            tenantsTotal: companies.length,
            partial: companies.length > maxTenants,
        },
        activity: {
            casesInvestigated: investigated.length,
            casesResolvedBySarah: resolvedSarah.length,
            casesResolvedAfterRemediation: successfulRemediations.length,
            casesEscalated: escalated.length,
            remediationAttempts: attemptCount,
            successfulRemediations: successfulRemediations.length,
            failedRemediations: failedRemediations.length,
            remediationSuccessRatePercent: successRate,
            averageResolutionTimeMs: avgResolutionMs,
            averageResolutionTimeLabel: avgResolutionMs != null ? formatDuration(avgResolutionMs) : null,
            organisationsRequiringAttention: orgsAttention.size,
            automatedResolutionRatePercent:
                investigated.length > 0
                    ? Math.round((resolvedSarah.length / investigated.length) * 1000) / 10
                    : null,
        },
        dimensions: {
            byOrganisationType: byOrgType,
            bySector,
            topProblems: Object.entries(byIssue)
                .slice(0, 10)
                .map(([key, count]) => ({ key, count })),
            topRemediations: Object.entries(byAction)
                .slice(0, 10)
                .map(([action, count]) => ({ action, actionLabel: actionLabel(action), verifiedSuccessCount: count })),
        },
        remediationEffectiveness: Object.entries(
            aggregateByKey(periodAudits.filter((a) => a.preconditions?.ok), (a) => a.action)
        ).map(([action, attempts]) => {
            const wins = periodAudits.filter((a) => a.action === action && a.success).length;
            return {
                action,
                actionLabel: actionLabel(action),
                attempts,
                verifiedSuccesses: wins,
                successRatePercent: attempts ? Math.round((wins / attempts) * 1000) / 10 : 0,
            };
        }),
        actions: actionRows,
    };
}

function formatDuration(ms) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
}

export async function getPlatformSupportOperationDetail(companyId, auditId) {
    const page = await listRemediationAuditsPage(companyId, { limit: 100 });
    const audit = page.items.find((a) => a.id === auditId);
    if (!audit) return null;
    const companies = await listAllCompaniesFromStorage().catch(() => []);
    const company = companies.find((c) => c.id === companyId);
    return toActionRow({ ...audit, companyId }, company?.name);
}
