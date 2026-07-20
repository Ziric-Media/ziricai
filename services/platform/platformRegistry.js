/**
 * Platform registry — super-admin visibility for onboarded tenants (memory-backed for demo).
 */
import { getCompany } from "../tenants/companyService.js";
import { getTenantBilling } from "../payments/billingService.js";
import { getDefaultAiEmployee } from "../tenants/aiEmployeeService.js";
import { updateCompany } from "../tenants/companyService.js";

/** @type {Map<string, object>} */
const companies = new Map();

/** @type {object[]} */
const activityFeed = [];

const platformMetrics = {
    companiesTotal: 0,
    companiesTrialing: 0,
    companiesActive: 0,
    onboardedToday: 0,
};

function now() {
    return new Date().toISOString();
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

let lastMetricsDay = todayKey();

function resetDailyMetricsIfNeeded() {
    const today = todayKey();
    if (lastMetricsDay !== today) {
        platformMetrics.onboardedToday = 0;
        lastMetricsDay = today;
    }
}

function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

/**
 * Upsert tenant in platform registry for super-admin lists and ops feeds.
 * @param {string} companyId
 * @param {object} [meta]
 */
export async function registerPlatformCompany(companyId, meta = {}) {
    if (!companyId) throw new Error("companyId is required");

    resetDailyMetricsIfNeeded();

    const [company, billing, defaultAgent] = await Promise.all([
        getCompany(companyId),
        getTenantBilling(companyId),
        getDefaultAiEmployee(companyId).catch(() => null),
    ]);

    const isNew = !companies.has(companyId);
    const record = {
        id: companyId,
        name: meta.name || company?.name || companyId,
        industry: meta.industry || company?.industry || "",
        industryId: meta.industryId || company?.industryId || null,
        plan: meta.plan || billing?.planId || company?.plan || "trial",
        status: meta.status || company?.status || "active",
        owner: meta.owner || company?.owner || "",
        ownerEmail: meta.ownerEmail || company?.ownerEmail || company?.email || "",
        email: meta.email || company?.email || meta.ownerEmail || "",
        whatsappConnected: Boolean(meta.whatsappConnected ?? company?.whatsappConnected),
        whatsappNumber: meta.whatsappNumber || company?.whatsappNumber || "",
        agentId: defaultAgent?.id || meta.agentId || null,
        agentName: defaultAgent?.name || meta.agentName || "",
        knowledgeBaseId: meta.knowledgeBaseId || `kb-${companyId}`,
        marketplaceEnabled: Boolean(meta.marketplaceEnabled ?? companies.get(companyId)?.marketplaceEnabled),
        provisionedAt: meta.provisionedAt || company?.provisionedAt || now(),
        onboardingCompletedAt: meta.onboardingCompletedAt || company?.onboardingCompletedAt || null,
        createdAt: companies.get(companyId)?.createdAt || meta.createdAt || company?.createdAt || now(),
        updatedAt: now(),
        billing: billing
            ? {
                  planId: billing.planId,
                  status: billing.status,
                  trialEndsAt: billing.trialEndsAt || null,
                  renewalDate: billing.renewalDate || null,
              }
            : null,
    };

    companies.set(companyId, record);

    if (isNew) {
        platformMetrics.companiesTotal += 1;
        platformMetrics.onboardedToday += 1;
        if (record.plan === "trial" || billing?.status === "trialing") {
            platformMetrics.companiesTrialing += 1;
        } else {
            platformMetrics.companiesActive += 1;
        }
    }

    return record;
}

export function listPlatformCompanies() {
    return [...companies.values()].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
}

export function getPlatformCompany(companyId) {
    return companies.get(companyId) || null;
}

export function getPlatformRegistryMetrics() {
    resetDailyMetricsIfNeeded();
    return { ...platformMetrics, companiesRegistered: companies.size };
}

/**
 * @param {object} entry
 */
export function pushPlatformActivity(entry) {
    const item = {
        id: entry.id || `plat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: entry.type || "system",
        icon: entry.icon || "fa-building",
        color: entry.color || "blue",
        text: entry.text || "",
        detail: entry.detail || "",
        time: entry.time || "Just now",
        ago: entry.ago || "now",
        companyId: entry.companyId || null,
        timestamp: entry.timestamp || now(),
    };
    activityFeed.unshift(item);
    if (activityFeed.length > 200) activityFeed.length = 200;
    return item;
}

export function getPlatformRegistryActivity(limit = 20) {
    return activityFeed.slice(0, limit);
}

export async function enableMarketplaceForTenant(companyId) {
    const existing = companies.get(companyId);
    if (existing) {
        existing.marketplaceEnabled = true;
        existing.updatedAt = now();
        companies.set(companyId, existing);
    }

    await updateCompany(companyId, {
        settings: {
            marketplace: {
                enabled: true,
                catalogAccess: true,
                enabledAt: now(),
            },
        },
    }).catch(() => {});

    return { companyId, marketplaceEnabled: true };
}

export function recordCompanyOnboardedActivity(companyId, companyName, ownerName) {
    return pushPlatformActivity({
        type: "company_onboarded",
        icon: "fa-rocket",
        color: "green",
        text: `<strong>${companyName}</strong> went live`,
        detail: ownerName ? `Owner: ${ownerName} — workspace fully provisioned` : "New tenant workspace provisioned",
        companyId,
    });
}

export function recordCompanyCreatedActivity(companyId, companyName) {
    return pushPlatformActivity({
        type: "company_created",
        icon: "fa-building",
        color: "blue",
        text: `New company <strong>${companyName}</strong>`,
        detail: "Trial subscription started — provisioning workspace",
        companyId,
    });
}

export { hashSeed };
