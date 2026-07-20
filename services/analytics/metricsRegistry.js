/**
 * Metrics registry — defines trackable KPIs and event mappings.
 */

export const METRICS = {
    CONVERSATIONS: "conversations",
    LEADS: "leads",
    APPOINTMENTS: "appointments",
    REVENUE: "revenue",
    SALES: "sales",
    RESPONSE_TIMES: "responseTimes",
    AI_ACCURACY: "aiAccuracy",
    KNOWLEDGE_USAGE: "knowledgeUsage",
    POPULAR_QUESTIONS: "popularQuestions",
    CUSTOMER_SATISFACTION: "customerSatisfaction",
    MISSED_OPPORTUNITIES: "missedOpportunities",
    CONVERSIONS: "conversions",
    AUTOMATION_SUCCESS: "automationSuccess",
};

/** Event type → metric deltas */
export const EVENT_METRIC_MAP = {
    ConversationStarted: { conversations: 1 },
    ConversationEnded: {},
    LeadCaptured: { leads: 1 },
    AppointmentBooked: { appointments: 1 },
    PaymentReceived: { revenue: "payload.amount", sales: 1 },
    PaymentFailed: {},
    MessageSent: { messagesSent: 1 },
    MessageReceived: { messagesReceived: 1 },
    KnowledgeUploaded: { knowledgeUploads: 1 },
    KnowledgeQuery: { knowledgeUsage: 1 },
    ConversionCompleted: { conversions: 1 },
    MissedOpportunity: { missedOpportunities: 1 },
    AutomationExecuted: { automationRuns: 1, automationSuccess: "payload.success ? 1 : 0" },
    QuotationSent: { quotations: 1 },
    SupportTicketCreated: { supportTickets: 1 },
    CompanyCreated: { companies: 1 },
    CompanyProvisioned: { tenantsProvisioned: 1 },
    SubscriptionStarted: { subscriptions: 1 },
};

/**
 * Resolve nested payload value by dot path.
 * @param {object} payload
 * @param {string} path
 */
export function resolvePayloadValue(payload, path) {
    if (!path || typeof path !== "string") return null;
    if (path.includes("?")) {
        const [expr, fallback] = path.split(" ? ");
        const [cond, thenVal] = expr.split(" ? ");
        return cond ? Number(thenVal?.split(" : ")[0] || 0) : Number(fallback || 0);
    }
    return path.split(".").reduce((obj, key) => (obj == null ? undefined : obj[key]), payload);
}

/**
 * Extract numeric deltas from an event for aggregation.
 * @param {import('../events/eventTypes.js').ZiricEvent} event
 */
export function extractMetricDeltas(event) {
    const mapping = EVENT_METRIC_MAP[event.type] || {};
    const deltas = {};

    for (const [metric, spec] of Object.entries(mapping)) {
        if (typeof spec === "number") {
            deltas[metric] = spec;
        } else if (typeof spec === "string") {
            if (spec.startsWith("payload.")) {
                const val = resolvePayloadValue(event.payload, spec.replace("payload.", ""));
                deltas[metric] = Number(val) || 0;
            } else if (spec.includes("payload.success")) {
                deltas[metric] = event.payload?.success !== false ? 1 : 0;
            } else {
                deltas[metric] = Number(resolvePayloadValue(event, spec)) || 0;
            }
        }
    }

    if (event.payload?.responseTimeMs != null) {
        deltas.responseTimeMs = Number(event.payload.responseTimeMs);
        deltas.responseTimeCount = 1;
    }
    if (event.payload?.aiAccuracy != null) {
        deltas.aiAccuracySum = Number(event.payload.aiAccuracy);
        deltas.aiAccuracyCount = 1;
    }
    if (event.payload?.satisfaction != null) {
        deltas.satisfactionSum = Number(event.payload.satisfaction);
        deltas.satisfactionCount = 1;
    }
    if (event.payload?.question) {
        deltas.question = String(event.payload.question).slice(0, 200);
    }

    return deltas;
}

export const ALL_METRIC_KEYS = Object.values(METRICS);
