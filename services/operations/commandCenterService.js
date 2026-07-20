/**
 * AI Command Center — Super Admin wow dashboard demo data.
 * Combines platform operations metrics with strategic KPIs and geo visualization.
 */
import { getPlatformMetrics, getPlatformActivity } from "./platformOperations.js";

const DEMO_WORKFORCE = {
    totalEmployees: 347,
    activeNow: 143,
    humanTakeovers: 12,
    accuracyPct: 98.7,
    conversationsToday: 2847,
    messagesToday: 12864,
};

const DEMO_BUSINESS = {
    revenueToday: 245600,
    revenueCurrency: "ZAR",
    leadsToday: 186,
    customersWaiting: 23,
    highPriorityComplaints: 4,
};

const DEMO_HEALTH = {
    whatsapp: { status: "operational", label: "WhatsApp", uptime: 99.98 },
    openai: { status: "operational", label: "OpenAI", uptime: 99.95 },
    platform: { status: "operational", label: "Platform Health", uptime: 99.99 },
};

/** Animated pulse dots on world map (percent coords on equirectangular 1000×500). */
const DEMO_MAP_DOTS = [
    { id: "d1", x: 57.8, y: 64.4, label: "Johannesburg", intensity: 0.9, type: "active" },
    { id: "d2", x: 57.8, y: 62, label: "Pretoria", intensity: 0.6, type: "waiting" },
    { id: "d3", x: 55, y: 68.8, label: "Cape Town", intensity: 0.85, type: "active" },
    { id: "d4", x: 50, y: 21.6, label: "London", intensity: 0.5, type: "active" },
    { id: "d5", x: 50.8, y: 46.6, label: "Lagos", intensity: 0.7, type: "waiting" },
    { id: "d6", x: 65.3, y: 36.2, label: "Dubai", intensity: 0.55, type: "active" },
    { id: "d7", x: 78.9, y: 49.4, label: "Singapore", intensity: 0.45, type: "active" },
    { id: "d8", x: 29.4, y: 27.8, label: "New York", intensity: 0.65, type: "escalation" },
    { id: "d9", x: 37.2, y: 63.4, label: "São Paulo", intensity: 0.4, type: "waiting" },
    { id: "d10", x: 52.2, y: 22.2, label: "Frankfurt", intensity: 0.35, type: "active" },
];

export async function getCommandCenterDashboard() {
    let opsMetrics = null;
    let activity = null;

    try {
        [opsMetrics, activity] = await Promise.all([getPlatformMetrics(), getPlatformActivity()]);
    } catch {
        /* use demo fallbacks */
    }

    const metrics = opsMetrics?.metrics || {};
    const isDemo = opsMetrics?.isDemo !== false;

    const workforce = {
        totalEmployees: metrics.aiEmployeesOnline || DEMO_WORKFORCE.totalEmployees,
        activeConversations: metrics.activeConversations || DEMO_WORKFORCE.activeNow,
        humanTakeovers: metrics.humanTakeovers || DEMO_WORKFORCE.humanTakeovers,
        accuracyPct: metrics.aiSuccessRate || DEMO_WORKFORCE.accuracyPct,
        messagesToday: metrics.messagesToday || DEMO_WORKFORCE.messagesToday,
    };

    const whatsappConfigured = Boolean(process.env.PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN);
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

    const health = {
        whatsapp: {
            ...DEMO_HEALTH.whatsapp,
            configured: whatsappConfigured,
            status: whatsappConfigured ? "operational" : "simulated",
        },
        openai: {
            ...DEMO_HEALTH.openai,
            configured: openaiConfigured,
            status: openaiConfigured ? "operational" : "degraded",
        },
        platform: DEMO_HEALTH.platform,
    };

    return {
        isDemo,
        workforce,
        business: {
            ...DEMO_BUSINESS,
            revenueToday: metrics.estimatedRevenue || DEMO_BUSINESS.revenueToday,
        },
        health,
        mapDots: DEMO_MAP_DOTS,
        activity: activity?.items?.slice(0, 12) || [],
        trends: opsMetrics?.trends || {},
        timestamp: new Date().toISOString(),
    };
}
