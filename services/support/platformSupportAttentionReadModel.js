/**
 * PI-4F-5 — Mission Control Attention Centre (🔴 / 🟡 / 🟢 read model).
 */
import { listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { listSupportCasesPage } from "../tenants/supportCaseService.js";
import {
    ATTENTION_QUEUES,
    classifyCaseAttention,
    buildAttentionEvidence,
} from "./attentionQueueClassification.js";
import { toPlatformSupportCaseView } from "./supportCaseModel.js";
import {
    PERIOD_GRAINS,
    periodKeyForGrain,
    utcDateKey,
} from "../platformIntelligence/periodKeys.js";
import { buildPlatformAttentionPatterns } from "./proactive/platformAttentionPatterns.js";

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
    return results.flat();
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

function toAttentionItem(caseView, classification) {
    return {
        id: `${caseView.companyId}:${caseView.id}`,
        supportCaseId: caseView.id,
        companyId: caseView.companyId,
        companyName: caseView.companyName,
        issue: caseView.issue,
        severity: caseView.severity,
        affectedService: caseView.affectedService,
        lifecycle: caseView.lifecycle,
        queue: classification.queue,
        attentionReason: classification.reason,
        attentionCategory: classification.category,
        sarahSummary: `${caseView.companyName} — ${caseView.issue}. ${classification.reason}`,
        evidence: buildAttentionEvidence(caseView),
        updatedAt: caseView.updatedAt,
    };
}

function computeRecurring(cases) {
    const keyCount = new Map();
    for (const c of cases) {
        const key = `${c.companyId}::${c.affectedService || "general"}::${c.diagnosis?.issueClass || c.category || "other"}`;
        keyCount.set(key, (keyCount.get(key) || 0) + 1);
    }
    const recurring = [];
    for (const [key, count] of keyCount.entries()) {
        if (count < 2) continue;
        const [companyId, service, problem] = key.split("::");
        const sample = cases.find(
            (c) => c.companyId === companyId && (c.affectedService || "general") === service
        );
        recurring.push({
            key,
            count,
            companyId,
            companyName: sample?.companyName,
            affectedService: service,
            problemKey: problem,
            severity: sample?.severity,
        });
    }
    recurring.sort((a, b) => b.count - a.count);
    return recurring.slice(0, 25);
}

/**
 * @param {{ period?: string, date?: string, queue?: string, periodActivityOnly?: boolean }} query
 */
export async function getPlatformSupportAttentionReadModel(query = {}) {
    const resolved = resolvePeriodQuery(query);
    if (resolved.error) {
        return { generatedAt: new Date().toISOString(), ...resolved };
    }
    const { period, periodKey } = resolved;
    const queueFilter = query.queue ? String(query.queue) : null;
    const maxTenants = Math.min(Number(query.maxTenants) || 100, 500);

    let companies = [];
    try {
        companies = await listAllCompaniesFromStorage();
    } catch {
        companies = [];
    }
    const sample = companies.slice(0, maxTenants);
    const nameById = new Map(sample.map((c) => [c.id, c.name || c.id]));
    const companyById = new Map(sample.map((c) => [c.id, c]));

    const allCases = await mapPool(sample, 6, async (company) => {
        try {
            const page = await listSupportCasesPage(company.id, { limit: 40 });
            return page.items.map((r) =>
                toPlatformSupportCaseView(company.id, r, nameById.get(company.id))
            );
        } catch {
            return [];
        }
    });

    const periodCases = allCases.filter((c) => {
        const ts = c.resolvedAt || c.updatedAt || c.createdAt;
        return timestampInPeriod(ts, period, periodKey);
    });

    const items = [];
    for (const caseView of allCases) {
        const classification = classifyCaseAttention(caseView);
        const item = toAttentionItem(caseView, classification);
        if (queueFilter && item.queue !== queueFilter) continue;
        items.push(item);
    }

    const requiresAttention = items.filter((i) => i.queue === ATTENTION_QUEUES.REQUIRES_ATTENTION);
    const sarahMonitoring = items.filter((i) => i.queue === ATTENTION_QUEUES.SARAH_MONITORING);
    const resolvedQueue = items.filter((i) => i.queue === ATTENTION_QUEUES.RESOLVED);

    requiresAttention.sort((a, b) => {
        const sev = { critical: 0, high: 1, medium: 2, low: 3 };
        return (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9);
    });

    const handledToday = periodCases.filter((c) => {
        const ts = c.updatedAt || c.createdAt;
        return timestampInPeriod(ts, period, periodKey);
    });

    const byCategory = {
        credentials: requiresAttention.filter((i) => i.attentionCategory === "credentials").length,
        repeated_failure: requiresAttention.filter((i) => i.attentionCategory === "repeated_failure")
            .length,
        billing: requiresAttention.filter((i) => i.attentionCategory === "billing").length,
        high_severity: requiresAttention.filter((i) => i.attentionCategory === "high_severity").length,
        platform_wide: requiresAttention.filter((i) => i.attentionCategory === "platform_wide").length,
        other: requiresAttention.filter((i) => i.attentionCategory === "other").length,
    };

    const platformPatterns = buildPlatformAttentionPatterns(allCases, companyById);

    return {
        period,
        periodKey,
        generatedAt: new Date().toISOString(),
        meta: {
            dataSource: "support_attention_read_model",
            readOnly: true,
            network: "support",
            tenantsSampled: sample.length,
        },
        counts: {
            requiresAttention: requiresAttention.length,
            sarahMonitoring: sarahMonitoring.length,
            resolved: resolvedQueue.length,
            handledInPeriod: handledToday.length,
            criticalOrHigh: requiresAttention.filter(
                (i) => i.severity === "critical" || i.severity === "high"
            ).length,
        },
        requiresAttentionCategories: byCategory,
        queues: {
            [ATTENTION_QUEUES.REQUIRES_ATTENTION]: requiresAttention.slice(0, 50),
            [ATTENTION_QUEUES.SARAH_MONITORING]: sarahMonitoring.slice(0, 50),
            [ATTENTION_QUEUES.RESOLVED]: resolvedQueue.slice(0, 50),
        },
        recurring: computeRecurring(allCases),
        platformPatterns,
        handledInPeriod: handledToday.slice(0, 30).map((c) => {
            const cl = classifyCaseAttention(c);
            return toAttentionItem(c, cl);
        }),
    };
}
