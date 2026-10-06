/**
 * PI-4F-1 — Platform-wide support read model (Mission Control, Sarah read-only).
 */
import { listAllCompaniesFromStorage } from "../tenants/companyService.js";
import { listSupportCasesPage } from "../tenants/supportCaseService.js";
import {
    normalizeLifecycleStatus,
    severityFromPriority,
    toPlatformSupportCaseView,
    SUPPORT_SEVERITY,
} from "./supportCaseModel.js";

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
    return results;
}

function countBySeverity(cases) {
    const counts = {
        [SUPPORT_SEVERITY.CRITICAL]: 0,
        [SUPPORT_SEVERITY.HIGH]: 0,
        [SUPPORT_SEVERITY.MEDIUM]: 0,
        [SUPPORT_SEVERITY.LOW]: 0,
    };
    for (const c of cases) {
        const sev = c.severity || severityFromPriority(c.priority);
        if (counts[sev] != null) counts[sev] += 1;
    }
    return counts;
}

function lifecycleCounts(cases) {
    const counts = { open: 0, investigating: 0, escalated: 0, human_action: 0, resolved: 0 };
    for (const c of cases) {
        const lc = normalizeLifecycleStatus(c.status);
        if (counts[lc] != null) counts[lc] += 1;
    }
    return counts;
}

/**
 * Aggregate tenant support cases for platform operators.
 * @param {{ limitPerTenant?: number, maxTenants?: number, attentionOnly?: boolean }} options
 */
export async function getPlatformSupportReadModel(options = {}) {
    const limitPerTenant = Math.min(Number(options.limitPerTenant) || 20, 50);
    const maxTenants = Math.min(Number(options.maxTenants) || 100, 500);
    const attentionOnly = Boolean(options.attentionOnly);
    const summaryOnly = Boolean(options.summaryOnly);

    let companies = [];
    try {
        companies = await listAllCompaniesFromStorage();
    } catch {
        companies = [];
    }

    const sample = companies.slice(0, maxTenants);
    const nameById = new Map(sample.map((c) => [c.id, c.name || c.id]));

    const allViews = [];
    await mapPool(sample, 6, async (company) => {
        try {
            const page = await listSupportCasesPage(company.id, { limit: limitPerTenant });
            for (const item of page.items) {
                const view = toPlatformSupportCaseView(company.id, item, nameById.get(company.id));
                if (attentionOnly && !view.requiresOperatorAttention && view.lifecycle !== "open") {
                    if (view.lifecycle === "investigating" && view.severity !== "critical") continue;
                }
                if (attentionOnly && view.lifecycle === "resolved") continue;
                allViews.push(view);
            }
        } catch {
            /* skip tenant */
        }
    });

    allViews.sort((a, b) => {
        const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const sa = sevOrder[a.severity] ?? 9;
        const sb = sevOrder[b.severity] ?? 9;
        if (sa !== sb) return sa - sb;
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });

    const openAttention = allViews.filter(
        (c) => c.requiresOperatorAttention || (c.lifecycle === "open" && c.severity === "critical")
    );

    const lifecycle = lifecycleCounts(allViews);
    const bySeverity = countBySeverity(allViews);

    const base = {
        generatedAt: new Date().toISOString(),
        meta: {
            dataSource: "tenant_support_cases",
            readOnly: true,
            unavailable: false,
            network: "support",
            tenantsSampled: sample.length,
            tenantsTotal: companies.length,
            partial: companies.length > maxTenants,
            partialNote:
                companies.length > maxTenants
                    ? `Sampled first ${maxTenants} tenants for platform support aggregation.`
                    : null,
        },
        counts: {
            total: allViews.length,
            open: lifecycle.open,
            investigating: lifecycle.investigating,
            escalated: lifecycle.escalated,
            human_action: lifecycle.human_action,
            resolved: lifecycle.resolved,
            /** @deprecated MC-U-4C alias */
            assigned: lifecycle.investigating,
            waiting: lifecycle.investigating,
            attentionQueue: openAttention.length,
            critical: bySeverity.critical,
            high: bySeverity.high,
            medium: bySeverity.medium,
            low: bySeverity.low,
        },
        bySeverity,
        attentionQueue: openAttention.slice(0, 50),
    };

    if (summaryOnly) {
        return base;
    }

    return {
        ...base,
        cases: allViews,
    };
}
