/**
 * Platform operations aggregator — metrics, activity, leaderboards.
 * Phase 2B-1: merges read-only tenant CRM metrics for central-motors-rtb.
 */
import { listConversations } from "../conversationService.js";
import { listCustomers } from "../customerService.js";
import { getQueueStats } from "../queue/jobQueue.js";
import { getRecentEvents } from "../analytics/analyticsService.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import {
    listPlatformCompanies,
    getPlatformRegistryActivity,
    getPlatformRegistryMetrics,
} from "../platform/platformRegistry.js";
import {
    getPrimaryTenantMissionMetrics,
    getTenantMissionMetrics,
    PRIMARY_MISSION_TENANT_ID,
} from "./tenantMissionMetrics.js";

const DEMO_METRICS = {
    aiEmployeesOnline: 427,
    activeConversations: 143,
    avgResponseTimeSec: 1.3,
    customerSatisfaction: 97,
    messagesToday: 12864,
    openAiTokensUsed: 8200000,
    estimatedRevenue: 245600,
    humanTakeovers: 12,
    aiSuccessRate: 98.4,
    companiesOnline: 5,
};

const DEMO_TRENDS = {
    aiEmployeesOnline: 4.2,
    activeConversations: 11.8,
    avgResponseTimeSec: -8.5,
    customerSatisfaction: 2.1,
    messagesToday: 18.4,
    openAiTokensUsed: 6.7,
    estimatedRevenue: 22.3,
    humanTakeovers: -15.0,
    aiSuccessRate: 0.6,
    companiesOnline: 0,
};

const DEMO_ACTIVITY = [
    { id: "act-1", type: "ai_reply", icon: "fa-robot", color: "green", text: "<strong>Sarah</strong> replied to John Smith at Central Motors", detail: "Shared Hilux 2.4 GD-6 pricing from R549,900", time: "Just now", ago: "0s" },
];

const DEMO_TAKEOVERS = [];
const DEMO_TRENDING = [];
const DEMO_AGENT_LEADERBOARD = [];
const DEMO_COMPANY_LEADERBOARD = [];

function hourlyPatternUnavailable() {
    return Array.from({ length: 24 }, () => null);
}

function isProductionMissionTenant(companyId) {
    return companyId === PRIMARY_MISSION_TENANT_ID;
}

function unavailableMetricAvailability() {
    return {
        customers: "unavailable",
        leads: "unavailable",
        pipeline: "unavailable",
        conversations: "unavailable",
        activeConversations: "unavailable",
        messagesTotal: "unavailable",
        messagesToday: "unavailable",
        humanTakeovers: "unavailable",
        testDrivesBooked: "unavailable",
        testDriveRequests: "unavailable",
        financeEnquiries: "unavailable",
        vehicleInterests: "unavailable",
        sarahPerformance: "unavailable",
        estimatedRevenue: "unavailable",
        customerSatisfaction: "unavailable",
        avgResponseTimeSec: "unavailable",
        aiSuccessRate: "unavailable",
        hourlyConversations: "unavailable",
        trendingQuestions: "unavailable",
        platformTrends: "unavailable",
        aiEmployeesOnline: "unavailable",
        companiesOnline: "unavailable",
        openAiTokensUsed: "unavailable",
    };
}

function emptyProductionMetrics() {
    return {
        aiEmployeesOnline: null,
        activeConversations: null,
        avgResponseTimeSec: null,
        customerSatisfaction: null,
        messagesToday: null,
        messagesTotal: null,
        openAiTokensUsed: null,
        estimatedRevenue: null,
        humanTakeovers: null,
        aiSuccessRate: null,
        companiesOnline: null,
        crmLeads: null,
        crmCustomers: null,
        crmQualifiedLeads: null,
        crmNewLeads: null,
        crmTestDrivesBooked: null,
        crmFinanceEnquiries: null,
        crmDealsWon: null,
        crmVehicleInterests: null,
    };
}

/**
 * Production Mission Control must never receive fabricated demo KPIs for central-motors-rtb.
 */
function buildProductionUnavailableResponse(tenantCompanyId, { queue, storage, tenantMetrics = null }) {
    const availability = tenantMetrics?.metricAvailability || unavailableMetricAvailability();
    let metrics = emptyProductionMetrics();
    let leaderboards = { agents: [], companies: [] };

    if (tenantMetrics?.counts) {
        const merged = mergeMetricsFromTenant(tenantMetrics);
        metrics = merged.metrics;
        leaderboards = tenantMetrics.leaderboards || leaderboards;
    }

    return {
        metrics,
        trends: {},
        metricAvailability: availability,
        leaderboards,
        trendingQuestions: [],
        humanTakeovers: tenantMetrics
            ? takeoversFromConversations(
                  tenantMetrics.activity?.map((a) => ({
                      customerName: a.text,
                      status: a.type === "human_takeover" ? "human_takeover" : "open",
                      lastMessage: a.detail,
                  })) || [],
                  tenantMetrics.companyName
              )
            : [],
        hourlyConversations: hourlyPatternUnavailable(),
        queue,
        storage,
        isDemo: false,
        dataSource: "crm",
        primaryCompanyId: tenantCompanyId,
        tenantMetrics,
        dataSources: {
            primaryTenant: tenantCompanyId,
            crm: tenantMetrics ? "tenant_crm_apis" : "unavailable",
            demoCentralMotorsUsed: false,
        },
    };
}

function hasLiveData(conversations, customers) {
    return conversations.length > 0 || customers.length > 0;
}

function mergeMetricsFromTenant(tenantMetrics) {
    const c = tenantMetrics.counts;
    const availability = tenantMetrics.metricAvailability || {};
    const humanTakeovers = c.humanTakeovers ?? 0;
    const active = c.activeConversations ?? 0;
    const messages = c.messagesTotal ?? 0;

    const metrics = {
        aiEmployeesOnline: tenantMetrics.sarah?.assignedCustomers > 0 ? 1 : active > 0 ? 1 : 0,
        activeConversations: active,
        avgResponseTimeSec: null,
        customerSatisfaction: null,
        messagesToday: null,
        messagesTotal: messages,
        openAiTokensUsed: null,
        estimatedRevenue: null,
        humanTakeovers,
        aiSuccessRate:
            availability.aiSuccessRate === "derived" && active + humanTakeovers > 0
                ? Math.max(0, Math.round(100 - (humanTakeovers / Math.max(active + humanTakeovers, 1)) * 100))
                : null,
        companiesOnline: 1,
        crmLeads: c.leads,
        crmCustomers: c.customers,
        crmQualifiedLeads: c.qualifiedLeads,
        crmNewLeads: c.newLeads,
        crmTestDrivesBooked: c.testDrivesBooked,
        crmFinanceEnquiries: c.financeEnquiries,
        crmDealsWon: c.dealsWon,
        crmVehicleInterests: c.vehicleInterests,
    };

    return { metrics, availability };
}

function activityFromConversations(conversations, companyName) {
    return conversations.slice(0, 8).map((c, i) => ({
        id: `live-act-${c.id || i}`,
        type: c.status === "human_takeover" ? "human_takeover" : "new_conversation",
        icon: c.status === "human_takeover" ? "fa-user-shield" : "fa-comments",
        color: c.status === "human_takeover" ? "red" : "blue",
        text: `<strong>${c.customerName || c.name || "Customer"}</strong> — ${companyName || "Platform"}`,
        detail: c.lastMessage || c.preview || "Active conversation",
        time: c.time || "Recently",
        ago: c.time || "—",
        dataQuality: "real",
    }));
}

function takeoversFromConversations(conversations, companyName) {
    return conversations
        .filter((c) => c.status === "human_takeover" || c.mode === "human")
        .slice(0, 6)
        .map((c, i) => ({
            id: `live-ht-${c.id || i}`,
            customer: c.customerName || c.name || "Customer",
            company: companyName || c.companyName || "—",
            agent: c.assignedTo || "Human Agent",
            reason: c.lastMessage || "Human takeover",
            time: c.time || "Recently",
            dataQuality: "real",
        }));
}

/**
 * @param {{ companyId?: string }} [options]
 */
export async function getPlatformMetrics(options = {}) {
    const tenantCompanyId = options.companyId || PRIMARY_MISSION_TENANT_ID;

    const [conversations, customers, adapter, registryMetrics, platformCompanies, tenantMetrics] =
        await Promise.all([
            listConversations({ limit: 100, companyId: tenantCompanyId }),
            listCustomers({ limit: 100, companyId: tenantCompanyId }),
            getStorageAdapter(),
            Promise.resolve(getPlatformRegistryMetrics()),
            Promise.resolve(listPlatformCompanies()),
            getTenantMissionMetrics(tenantCompanyId).catch((err) => {
                console.warn("[platformOperations] tenant metrics failed:", err.message);
                return null;
            }),
        ]);

    const queue = await getQueueStats();
    const tenantHasData =
        tenantMetrics &&
        (tenantMetrics.counts.customers > 0 ||
            tenantMetrics.counts.leads > 0 ||
            tenantMetrics.counts.conversations > 0);

    if (tenantHasData) {
        const { metrics, availability } = mergeMetricsFromTenant(tenantMetrics);
        if (platformCompanies.length) {
            metrics.companiesOnline = platformCompanies.filter((c) => c.status === "active").length || 1;
            metrics.companiesTotal = registryMetrics.companiesTotal || platformCompanies.length;
        }

        const humanTakeovers = takeoversFromConversations(
            tenantMetrics.activity?.length
                ? tenantMetrics.activity.map((a) => ({
                      customerName: a.text,
                      status: a.type === "human_takeover" ? "human_takeover" : "open",
                      lastMessage: a.detail,
                  }))
                : conversations,
            tenantMetrics.companyName
        );

        return {
            metrics,
            trends: {},
            metricAvailability: availability,
            leaderboards: tenantMetrics.leaderboards,
            trendingQuestions: [],
            humanTakeovers,
            hourlyConversations: hourlyPatternUnavailable(),
            queue,
            storage: adapter.name,
            isDemo: false,
            dataSource: "crm",
            primaryCompanyId: tenantCompanyId,
            tenantMetrics,
            dataSources: {
                primaryTenant: tenantCompanyId,
                crm: "tenant_crm_apis",
                demoCentralMotorsUsed: false,
            },
        };
    }

    const live = hasLiveData(conversations, customers) || platformCompanies.length > 0;

    if (!live && isProductionMissionTenant(tenantCompanyId)) {
        return buildProductionUnavailableResponse(tenantCompanyId, {
            queue,
            storage: adapter.name,
            tenantMetrics,
        });
    }

    if (!live) {
        return {
            metrics: DEMO_METRICS,
            trends: DEMO_TRENDS,
            metricAvailability: Object.fromEntries(
                Object.keys(DEMO_METRICS).map((k) => [k, "demo"])
            ),
            leaderboards: {
                agents: DEMO_AGENT_LEADERBOARD,
                companies: DEMO_COMPANY_LEADERBOARD,
            },
            trendingQuestions: DEMO_TRENDING,
            humanTakeovers: DEMO_TAKEOVERS,
            hourlyConversations: hourlyPatternUnavailable(),
            queue,
            storage: adapter.name,
            isDemo: true,
            primaryCompanyId: tenantCompanyId,
            tenantMetrics: tenantMetrics || null,
            dataSources: {
                primaryTenant: tenantCompanyId,
                crm: "unavailable",
                demoCentralMotorsUsed: false,
            },
        };
    }

    const scaled = mergeMetricsFromTenant(
        tenantMetrics || {
            counts: {
                activeConversations: conversations.filter((c) => c.status !== "closed").length,
                messagesTotal: customers.reduce((s, c) => s + (c.totalMessages || 0), 0),
                humanTakeovers: conversations.filter(
                    (c) => c.status === "human_takeover" || c.mode === "human"
                ).length,
                leads: 0,
                customers: customers.length,
            },
            sarah: { assignedCustomers: 0 },
            metricAvailability: {},
            leaderboards: { agents: [], companies: [] },
        }
    );

    return {
        metrics: scaled.metrics,
        trends: {},
        metricAvailability: scaled.availability,
        leaderboards: tenantMetrics?.leaderboards || {
            agents: DEMO_AGENT_LEADERBOARD,
            companies: DEMO_COMPANY_LEADERBOARD,
        },
        trendingQuestions: [],
        humanTakeovers: takeoversFromConversations(conversations, tenantMetrics?.companyName),
        hourlyConversations: hourlyPatternUnavailable(),
        queue,
        storage: adapter.name,
        isDemo: false,
        dataSource: tenantMetrics ? "crm" : "partial",
        primaryCompanyId: tenantCompanyId,
        tenantMetrics,
        dataSources: {
            primaryTenant: tenantCompanyId,
            crm: tenantMetrics ? "tenant_crm_apis" : "partial",
            demoCentralMotorsUsed: false,
        },
    };
}

export async function getPlatformActivity(options = {}) {
    const tenantCompanyId = options.companyId || PRIMARY_MISSION_TENANT_ID;

    const [conversations, events, registryActivity, tenantMetrics] = await Promise.all([
        listConversations({ limit: 20, companyId: tenantCompanyId }),
        Promise.resolve(getRecentEvents(20)),
        Promise.resolve(getPlatformRegistryActivity(15)),
        getPrimaryTenantMissionMetrics().catch(() => null),
    ]);

    if (tenantMetrics?.activity?.length) {
        return {
            items: tenantMetrics.activity,
            isDemo: false,
            primaryCompanyId: tenantCompanyId,
            dataQuality: "real",
        };
    }

    const fromRegistry = registryActivity.map((a) => ({
        id: a.id,
        type: a.type,
        icon: a.icon,
        color: a.color,
        text: a.text,
        detail: a.detail,
        time: a.time,
        ago: a.ago,
        dataQuality: "real",
    }));

    const fromConversations = activityFromConversations(
        conversations,
        tenantMetrics?.companyName || "Central Motors"
    );
    const fromEvents = events.map((e, i) => ({
        id: `evt-${i}`,
        type: "system",
        icon: "fa-bolt",
        color: "grey",
        text: e.name.replace(/_/g, " "),
        detail: JSON.stringify(e.payload).slice(0, 80),
        time: new Date(e.recordedAt).toLocaleTimeString(),
        ago: "recent",
        dataQuality: "real",
    }));

    const items = [...fromRegistry, ...fromConversations, ...fromEvents];
    if (items.length >= 1) {
        return {
            items: items.slice(0, 20),
            isDemo: false,
            primaryCompanyId: tenantCompanyId,
        };
    }

    if (isProductionMissionTenant(tenantCompanyId)) {
        return {
            items: [],
            isDemo: false,
            primaryCompanyId: tenantCompanyId,
            dataQuality: "unavailable",
        };
    }

    return {
        items: DEMO_ACTIVITY,
        isDemo: true,
        primaryCompanyId: tenantCompanyId,
        dataQuality: "demo",
    };
}

/** Read-only tenant metrics endpoint helper. */
export { getTenantMissionMetrics, getPrimaryTenantMissionMetrics, PRIMARY_MISSION_TENANT_ID };
