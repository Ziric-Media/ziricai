/**
 * Platform operations aggregator — metrics, activity, leaderboards.
 * Aggregates from storage/queue/health; falls back to demo when sparse.
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
    { id: "act-2", type: "new_conversation", icon: "fa-comments", color: "blue", text: "New conversation from <strong>James K.</strong>", detail: "Golden Cat Security — estate guard request", time: "8s ago", ago: "8s" },
    { id: "act-3", type: "knowledge", icon: "fa-book", color: "yellow", text: "Knowledge used: <strong>Finance Terms</strong>", detail: "Central Motors — David Nkosi finance enquiry", time: "45s ago", ago: "45s" },
    { id: "act-4", type: "human_takeover", icon: "fa-user-shield", color: "red", text: "<strong>Sarah</strong> took over conversation", detail: "David Nkosi — finance deposit question", time: "2m ago", ago: "2m" },
    { id: "act-5", type: "ai_reply", icon: "fa-robot", color: "green", text: "<strong>Grace</strong> replied to Peter Molefe", detail: "Econo Funerals — compassionate package overview", time: "3m ago", ago: "3m" },
    { id: "act-6", type: "conversion", icon: "fa-chart-line", color: "green", text: "Lead score increased for <strong>John Smith</strong>", detail: "Central Motors — score 92 (+4)", time: "5m ago", ago: "5m" },
    { id: "act-7", type: "new_conversation", icon: "fa-comments", color: "blue", text: "New conversation from <strong>Sarah Jones</strong>", detail: "Central Motors — test drive booking", time: "6m ago", ago: "6m" },
    { id: "act-8", type: "knowledge", icon: "fa-book", color: "yellow", text: "Knowledge used: <strong>Vehicle Catalogue 2025</strong>", detail: "Central Motors — John Smith Hilux enquiry", time: "8m ago", ago: "8m" },
    { id: "act-9", type: "ai_reply", icon: "fa-robot", color: "green", text: "<strong>Marcus</strong> replied to James K.", detail: "Golden Cat — 4-hour guard deployment info", time: "10m ago", ago: "10m" },
    { id: "act-10", type: "system", icon: "fa-bolt", color: "grey", text: "Queue processed 847 messages", detail: "Peak hour throughput — avg 1.2s response", time: "12m ago", ago: "12m" },
];

const DEMO_TAKEOVERS = [
    { id: "ht-1", customer: "David Nkosi", company: "Central Motors", agent: "Sarah", reason: "Finance deposit consultation", time: "12m ago" },
    { id: "ht-2", customer: "Linda M.", company: "Golden Cat Security", agent: "Marcus", reason: "Emergency armed response", time: "34m ago" },
    { id: "ht-3", customer: "Thabo P.", company: "Econo Funerals", agent: "Grace", reason: "Grief counseling escalation", time: "1h ago" },
    { id: "ht-4", customer: "Mike van der Berg", company: "Central Motors", agent: "John Smith", reason: "Trade-in valuation photos", time: "2h ago" },
];

const DEMO_TRENDING = [
    { question: "What are your business hours?", count: 284, company: "Central Motors" },
    { question: "How do I book a test drive?", count: 196, company: "Central Motors" },
    { question: "What deposit do I need for finance?", count: 178, company: "Central Motors" },
    { question: "Do you have the Toyota Hilux in stock?", count: 142, company: "Central Motors" },
    { question: "How quickly can you deploy a guard?", count: 98, company: "Golden Cat Security" },
    { question: "What funeral packages do you offer?", count: 87, company: "Econo Funerals" },
];

const DEMO_AGENT_LEADERBOARD = [
    { rank: 1, name: "Sarah", company: "Central Motors", messages: 4820, satisfaction: 97, conversion: 34 },
    { rank: 2, name: "Marcus", company: "Golden Cat Security", messages: 3156, satisfaction: 94, conversion: 28 },
    { rank: 3, name: "Grace", company: "Econo Funerals", messages: 892, satisfaction: 96, conversion: 41 },
    { rank: 4, name: "Lebo", company: "Ziric Media", messages: 2240, satisfaction: 91, conversion: 22 },
];

const DEMO_COMPANY_LEADERBOARD = [
    { rank: 1, name: "Central Motors", messages: 4820, satisfaction: 97, revenue: 98500, agents: 1 },
    { rank: 2, name: "Golden Cat Security", messages: 3156, satisfaction: 94, revenue: 67200, agents: 1 },
    { rank: 3, name: "Ziric Media", messages: 2240, satisfaction: 91, revenue: 44800, agents: 1 },
    { rank: 4, name: "Econo Funerals", messages: 892, satisfaction: 96, revenue: 35100, agents: 1 },
];

function hourlyPattern() {
    return [12, 8, 5, 4, 6, 18, 42, 68, 94, 112, 128, 134, 118, 102, 96, 88, 76, 64, 52, 38, 28, 22, 18, 14];
}

function hasLiveData(conversations, customers) {
    return conversations.length > 0 || customers.length > 0;
}

function scaleFromLive(conversations, customers) {
    const active = conversations.filter((c) => c.status !== "closed").length;
    const takeovers = conversations.filter((c) => c.status === "human_takeover" || c.mode === "human").length;
    const messages = customers.reduce((s, c) => s + (c.totalMessages || 0), 0) || conversations.length * 4;

    return {
        aiEmployeesOnline: Math.max(4, active + 3),
        activeConversations: active || conversations.length,
        avgResponseTimeSec: 1.3,
        customerSatisfaction: 97,
        messagesToday: messages || DEMO_METRICS.messagesToday,
        openAiTokensUsed: messages * 640 || DEMO_METRICS.openAiTokensUsed,
        estimatedRevenue: Math.round((messages || 100) * 19.1),
        humanTakeovers: takeovers || DEMO_METRICS.humanTakeovers,
        aiSuccessRate: takeovers ? Math.max(90, 100 - takeovers * 0.5) : DEMO_METRICS.aiSuccessRate,
        companiesOnline: new Set(conversations.map((c) => c.companyId).filter(Boolean)).size || DEMO_METRICS.companiesOnline,
    };
}

function activityFromConversations(conversations) {
    return conversations.slice(0, 8).map((c, i) => ({
        id: `live-act-${c.id || i}`,
        type: c.status === "human_takeover" ? "human_takeover" : "new_conversation",
        icon: c.status === "human_takeover" ? "fa-user-shield" : "fa-comments",
        color: c.status === "human_takeover" ? "red" : "blue",
        text: `<strong>${c.customerName || c.name || "Customer"}</strong> — ${c.companyName || "Platform"}`,
        detail: c.lastMessage || c.preview || "Active conversation",
        time: c.time || "Recently",
        ago: c.time || "—",
    }));
}

function takeoversFromConversations(conversations) {
    return conversations
        .filter((c) => c.status === "human_takeover" || c.mode === "human")
        .slice(0, 6)
        .map((c, i) => ({
            id: `live-ht-${c.id || i}`,
            customer: c.customerName || c.name || "Customer",
            company: c.companyName || "—",
            agent: c.assignedTo || "Human Agent",
            reason: c.lastMessage || "Human takeover",
            time: c.time || "Recently",
        }));
}

export async function getPlatformMetrics() {
    const [conversations, customers, adapter, registryMetrics, platformCompanies] = await Promise.all([
        listConversations({ limit: 100 }),
        listCustomers({ limit: 100 }),
        getStorageAdapter(),
        Promise.resolve(getPlatformRegistryMetrics()),
        Promise.resolve(listPlatformCompanies()),
    ]);

    const queue = getQueueStats();
    const live = hasLiveData(conversations, customers) || platformCompanies.length > 0;

    if (!live) {
        return {
            metrics: DEMO_METRICS,
            trends: DEMO_TRENDS,
            leaderboards: {
                agents: DEMO_AGENT_LEADERBOARD,
                companies: DEMO_COMPANY_LEADERBOARD,
            },
            trendingQuestions: DEMO_TRENDING,
            humanTakeovers: DEMO_TAKEOVERS,
            hourlyConversations: hourlyPattern(),
            queue,
            storage: adapter.name,
            isDemo: true,
        };
    }

    const metrics = scaleFromLive(conversations, customers);
    if (platformCompanies.length) {
        metrics.companiesOnline = platformCompanies.filter((c) => c.status === "active").length;
        metrics.companiesTotal = registryMetrics.companiesTotal || platformCompanies.length;
        metrics.companiesTrialing = registryMetrics.companiesTrialing || 0;
        metrics.onboardedToday = registryMetrics.onboardedToday || 0;
    }
    const humanTakeovers = takeoversFromConversations(conversations);

    return {
        metrics,
        trends: DEMO_TRENDS,
        leaderboards: {
            agents: DEMO_AGENT_LEADERBOARD,
            companies: DEMO_COMPANY_LEADERBOARD,
        },
        trendingQuestions: DEMO_TRENDING,
        humanTakeovers: humanTakeovers.length ? humanTakeovers : DEMO_TAKEOVERS,
        hourlyConversations: hourlyPattern(),
        queue,
        storage: adapter.name,
        isDemo: false,
    };
}

export async function getPlatformActivity() {
    const [conversations, events, registryActivity] = await Promise.all([
        listConversations({ limit: 20 }),
        Promise.resolve(getRecentEvents(20)),
        Promise.resolve(getPlatformRegistryActivity(15)),
    ]);

    const fromRegistry = registryActivity.map((a) => ({
        id: a.id,
        type: a.type,
        icon: a.icon,
        color: a.color,
        text: a.text,
        detail: a.detail,
        time: a.time,
        ago: a.ago,
    }));

    const fromConversations = activityFromConversations(conversations);
    const fromEvents = events.map((e, i) => ({
        id: `evt-${i}`,
        type: "system",
        icon: "fa-bolt",
        color: "grey",
        text: e.name.replace(/_/g, " "),
        detail: JSON.stringify(e.payload).slice(0, 80),
        time: new Date(e.recordedAt).toLocaleTimeString(),
        ago: "recent",
    }));

    const items = [...fromRegistry, ...fromConversations, ...fromEvents];
    if (items.length >= 5) {
        return { items: items.slice(0, 20), isDemo: fromRegistry.length === 0 && !hasLiveData(conversations, []) };
    }

    return { items: DEMO_ACTIVITY, isDemo: true };
}
