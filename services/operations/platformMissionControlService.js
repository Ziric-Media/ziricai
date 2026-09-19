/**
 * Mission Control platform read models (executive overview, billing, integrations).
 * Read-only — authoritative tenant data; no second CRM store.
 */
import { classifyTenant, summarizeByClassification } from "../../js/shared/tenantClassification.js";
import { listAllCompaniesFromStorage, enrichCompanyIntegrationStatus } from "../tenants/companyService.js";
import { getTenantBilling, getPlan } from "../payments/billingService.js";
import { getChannelStatus } from "../integrations/integrationHub.js";
import { listAiEmployees } from "../tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../tenants/knowledgeService.js";

const ACTIVE_BILLING = new Set(["active", "paid", "trialing"]);
const PAST_DUE = new Set(["past_due", "overdue", "attention"]);

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

const ACTIVE_INTEGRATION = new Set(["active", "connected"]);

function whatsappBucket(integration) {
    const status = String(integration?.status || integration?.integrationStatus || "").toLowerCase();
    if (ACTIVE_INTEGRATION.has(status)) return "connected";
    if (status === "pending" || status === "configured") return "pending";
    if (status === "error" || status === "failed") return "error";
    return "not_connected";
}

function planMrrCents(record) {
    if (!record?.planId) return 0;
    const plan = getPlan(record.planId);
    const monthly = plan?.priceMonthly ?? plan?.price ?? 0;
    return Number(monthly) || 0;
}

/**
 * Executive dashboard KPIs for Mission Control home.
 */
export async function getPlatformExecutiveOverview() {
    const companies = await listAllCompaniesFromStorage();
    const census = summarizeByClassification(companies);
    const enriched = await mapPool(companies, 8, (c) => enrichCompanyIntegrationStatus(c));

    let trialAccounts = 0;
    let activePaid = 0;
    let pastDueAccounts = 0;
    let mrr = 0;
    let billingResolved = 0;

    await mapPool(companies.slice(0, 40), 6, async (c) => {
        const billing = await getTenantBilling(c.id).catch(() => null);
        if (!billing) return;
        billingResolved += 1;
        const status = String(billing.status || "").toLowerCase();
        if (status === "trialing" || billing.planId === "trial") trialAccounts += 1;
        else if (PAST_DUE.has(status) || PAST_DUE.has(String(billing.paymentStatus || "").toLowerCase())) {
            pastDueAccounts += 1;
        } else if (ACTIVE_BILLING.has(status)) activePaid += 1;
        mrr += planMrrCents(billing);
    });

    const whatsapp = { connected: 0, pending: 0, error: 0, not_connected: 0 };
    for (const c of enriched) {
        const bucket = whatsappBucket(c.whatsappIntegration);
        whatsapp[bucket] += 1;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = companies.filter((c) => {
        const d = new Date(c.createdAt || 0);
        return d >= monthStart;
    }).length;

    return {
        generatedAt: now.toISOString(),
        tenantCensus: {
            total: census.total,
            productionCustomer: census["PRODUCTION CUSTOMER"],
            pilot: census.PILOT,
            acceptance: census.ACCEPTANCE,
            demoShowcase: census["DEMO/SHOWCASE"],
            test: census.TEST,
            unknown: census.UNKNOWN,
        },
        tenants: {
            total: companies.length,
            activeOperational: companies.filter((c) => String(c.status || "active").toLowerCase() === "active")
                .length,
            trial: trialAccounts,
            paying: activePaid,
            pastDue: pastDueAccounts,
            newThisMonth,
        },
        integrations: { whatsapp },
        billing: {
            mrr,
            mrrCurrency: "ZAR",
            billingRecordsSampled: billingResolved,
            partial: companies.length > 40,
            partialNote:
                companies.length > 40
                    ? "Billing totals sampled first 40 tenants; full rollups deferred."
                    : null,
        },
        usage: {
            messagesProcessed: null,
            aiConversations: null,
            appointmentsProcessed: null,
            availability: "unavailable",
            note: "Platform-wide message and appointment totals require a dedicated rollup job (not duplicated here).",
        },
        revenue: {
            mrr,
            arr: mrr * 12,
            availability: billingResolved ? "partial" : "unavailable",
        },
        growth: {
            newTenantsThisMonth: newThisMonth,
            availability: "partial",
        },
        meta: { dataSource: "platform_read_facade", readOnly: true },
    };
}

/**
 * Platform billing console rows.
 */
export async function getPlatformBillingConsole() {
    const companies = await listAllCompaniesFromStorage();
    const rows = await mapPool(companies, 10, async (company) => {
        const billing = await getTenantBilling(company.id).catch(() => null);
        const meta = classifyTenant(company);
        const planId = billing?.planId || company.plan || "starter";
        const plan = getPlan(planId);
        const status = billing?.status || company.status || "unknown";
        const paymentStatus = billing?.paymentStatus || billing?.status || "—";
        let trialDays = null;
        if (billing?.trialEndsAt) {
            const end = new Date(billing.trialEndsAt);
            trialDays = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
        }
        return {
            companyId: company.id,
            companyName: company.name || company.id,
            classification: meta.classification,
            package: plan?.name || planId,
            planId,
            status,
            trialDaysRemaining: trialDays,
            billingLabel:
                status === "trialing" || planId === "trial"
                    ? "Trial"
                    : PAST_DUE.has(String(paymentStatus).toLowerCase())
                      ? "Attention"
                      : "Active",
            mrr: planMrrCents(billing),
            paymentStatus,
        };
    });

    const totals = {
        totalAccounts: rows.length,
        trialAccounts: rows.filter((r) => r.billingLabel === "Trial").length,
        activePaid: rows.filter((r) => r.billingLabel === "Active").length,
        pastDue: rows.filter((r) => r.billingLabel === "Attention").length,
        mrr: rows.reduce((s, r) => s + (r.mrr || 0), 0),
        arr: 0,
        byPackage: {},
    };
    totals.arr = totals.mrr * 12;
    for (const row of rows) {
        totals.byPackage[row.package] = (totals.byPackage[row.package] || 0) + 1;
    }

    return {
        generatedAt: new Date().toISOString(),
        rows,
        totals,
        meta: { dataSource: "tenant_billing_records", readOnly: true },
    };
}

/**
 * Integrations matrix + WhatsApp tenant list.
 */
export async function getPlatformIntegrationsBoard() {
    const companies = await listAllCompaniesFromStorage();
    const enriched = await mapPool(companies, 8, (c) => enrichCompanyIntegrationStatus(c));

    const whatsappTenants = { connected: [], pending: [], error: [], not_connected: [] };
    for (const c of enriched) {
        const bucket = whatsappBucket(c.whatsappIntegration);
        whatsappTenants[bucket].push({
            companyId: c.id,
            name: c.name || c.id,
            status: c.whatsappIntegration?.status || "not_configured",
        });
    }

    const hubHealth = {
        channels: getChannelStatus(process.env.DEFAULT_COMPANY_ID || null),
        timestamp: new Date().toISOString(),
    };

    const platforms = [
        {
            id: "whatsapp",
            label: "WhatsApp",
            connectedTenants: whatsappTenants.connected.length,
            pendingTenants: whatsappTenants.pending.length,
            errorTenants: whatsappTenants.error.length,
            notConnectedTenants: whatsappTenants.not_connected.length,
            status: whatsappTenants.error.length ? "degraded" : "healthy",
        },
        {
            id: "openai",
            label: "OpenAI",
            connectedTenants: process.env.OPENAI_API_KEY ? companies.length : 0,
            status: process.env.OPENAI_API_KEY ? "healthy" : "check_config",
            note: "Platform credential",
        },
        {
            id: "stripe",
            label: "Stripe",
            connectedTenants: null,
            status: "unavailable",
            note: "Tenant billing connector not aggregated yet",
        },
    ];

    return {
        generatedAt: new Date().toISOString(),
        platforms,
        whatsappTenants,
        hubHealth,
        meta: { dataSource: "tenant_integrations", readOnly: true },
    };
}

/**
 * ZiricAI platform analytics (operator / CEO view).
 */
export async function getPlatformAnalyticsOverview() {
    const overview = await getPlatformExecutiveOverview();
    const companies = await listAllCompaniesFromStorage();

    let aiEmployees = 0;
    let knowledgeBases = 0;
    await mapPool(companies.slice(0, 25), 5, async (c) => {
        const [agents, docs] = await Promise.all([
            listAiEmployees(c.id).catch(() => []),
            listKnowledgeDocuments(c.id).catch(() => []),
        ]);
        aiEmployees += agents.length;
        if (docs.length) knowledgeBases += 1;
    });

    return {
        generatedAt: new Date().toISOString(),
        overview: overview.tenantCensus,
        tenants: overview.tenants,
        integrations: overview.integrations,
        billing: overview.billing,
        deployed: {
            aiEmployees,
            knowledgeBaseTenants: knowledgeBases,
            sampledTenants: Math.min(25, companies.length),
            partial: companies.length > 25,
        },
        charts: {
            tenantGrowth: { availability: "planned", note: "Wire to daily tenant census snapshots." },
            revenueGrowth: { availability: "planned", note: "Requires billing time-series store." },
            platformUsage: { availability: "planned" },
        },
        meta: { dataSource: "platform_analytics_read_facade", readOnly: true },
    };
}

/**
 * Support cases — placeholder until portal support tickets API is authoritative.
 */
export async function getPlatformSupportCases() {
    return {
        generatedAt: new Date().toISOString(),
        cases: [],
        counts: { open: 0, assigned: 0, waiting: 0, resolved: 0 },
        meta: {
            dataSource: "support_pipeline",
            readOnly: true,
            unavailable: true,
            note: "Client Portal → Support will feed Mission Control Inbox when the shared support ticket store is connected. No synthetic tickets are created here.",
        },
    };
}
