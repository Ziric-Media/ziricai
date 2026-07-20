/**
 * Canonical event types for ZiricAI analytics + automation.
 * @enum {string}
 */
export const EventTypes = {
    CONVERSATION_STARTED: "ConversationStarted",
    CONVERSATION_ENDED: "ConversationEnded",
    LEAD_CAPTURED: "LeadCaptured",
    APPOINTMENT_BOOKED: "AppointmentBooked",
    KNOWLEDGE_UPLOADED: "KnowledgeUploaded",
    PAYMENT_RECEIVED: "PaymentReceived",
    AUTOMATION_EXECUTED: "AutomationExecuted",
    MESSAGE_SENT: "MessageSent",
    MESSAGE_RECEIVED: "MessageReceived",
    LEAD_INACTIVE: "LeadInactive",
    SUPPORT_TICKET_CREATED: "SupportTicketCreated",
    QUOTATION_SENT: "QuotationSent",
    PAYMENT_FAILED: "PaymentFailed",
    CONVERSION_COMPLETED: "ConversionCompleted",
    KNOWLEDGE_QUERY: "KnowledgeQuery",
    MISSED_OPPORTUNITY: "MissedOpportunity",
    COMPANY_CREATED: "CompanyCreated",
    COMPANY_PROVISIONED: "CompanyProvisioned",
    SUBSCRIPTION_STARTED: "SubscriptionStarted",
};

/** All event type values as array */
export const ALL_EVENT_TYPES = Object.values(EventTypes);

/**
 * @typedef {object} ZiricEvent
 * @property {string} id
 * @property {string} companyId
 * @property {string} type - One of EventTypes
 * @property {string} timestamp - ISO8601
 * @property {string} [actorId]
 * @property {object} payload
 * @property {object} [metadata]
 */

/**
 * Create a normalized event document.
 * @param {string} companyId
 * @param {string} type
 * @param {object} [payload]
 * @param {object} [options]
 * @returns {ZiricEvent}
 */
export function createEvent(companyId, type, payload = {}, options = {}) {
    if (!companyId) throw new Error("companyId is required for events");
    if (!ALL_EVENT_TYPES.includes(type)) {
        throw new Error(`Unknown event type: ${type}`);
    }
    return {
        id: options.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        type,
        timestamp: options.timestamp || new Date().toISOString(),
        actorId: options.actorId || null,
        payload: payload || {},
        metadata: options.metadata || {},
    };
}
