/**
 * Canonical inbound/outbound message schema for the unified inbox pipeline.
 */

export const CHANNELS = {
    WHATSAPP: "whatsapp",
    FACEBOOK: "facebook",
    INSTAGRAM: "instagram",
    TELEGRAM: "telegram",
    WEBCHAT: "webchat",
    EMAIL: "email",
    SMS: "sms",
};

export const CONNECTORS = {
    GOOGLE_CALENDAR: "google_calendar",
    MICROSOFT_365: "microsoft_365",
    STRIPE: "stripe",
    PAYSTACK: "paystack",
    FIREBASE: "firebase",
};

/**
 * @typedef {Object} UnifiedMessage
 * @property {string} companyId
 * @property {string} channel
 * @property {string} externalId - Provider message id
 * @property {string} from - Sender identifier (phone, user id, email)
 * @property {string} to - Recipient identifier
 * @property {string} text
 * @property {Array<{type: string, url?: string, id?: string, mimeType?: string}>} media
 * @property {string} timestamp - ISO8601
 * @property {Record<string, unknown>} metadata
 */

/**
 * Build a normalized UnifiedMessage from adapter output.
 * @param {Partial<UnifiedMessage> & { channel: string, from: string }} fields
 * @returns {UnifiedMessage}
 */
export function createUnifiedMessage(fields) {
    return {
        companyId: fields.companyId || process.env.DEFAULT_COMPANY_ID || null,
        channel: fields.channel,
        externalId: fields.externalId || `${fields.channel}-${Date.now()}`,
        from: String(fields.from || ""),
        to: String(fields.to || ""),
        text: String(fields.text || ""),
        media: Array.isArray(fields.media) ? fields.media : [],
        timestamp: fields.timestamp || new Date().toISOString(),
        metadata: fields.metadata || {},
    };
}

/**
 * @param {unknown} msg
 * @returns {msg is UnifiedMessage}
 */
export function isValidUnifiedMessage(msg) {
    return (
        msg &&
        typeof msg === "object" &&
        typeof msg.channel === "string" &&
        typeof msg.from === "string" &&
        msg.from.length > 0
    );
}
