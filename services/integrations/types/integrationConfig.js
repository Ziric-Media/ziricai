import { CHANNELS, CONNECTORS } from "./unifiedMessage.js";

/**
 * Default integration metadata per channel/connector.
 */
export const INTEGRATION_CATALOG = {
    [CHANNELS.WHATSAPP]: {
        type: "messaging",
        label: "WhatsApp Business",
        icon: "fa-brands fa-whatsapp",
        description: "Primary customer messaging channel",
    },
    [CHANNELS.FACEBOOK]: {
        type: "messaging",
        label: "Facebook Messenger",
        icon: "fa-brands fa-facebook",
        description: "Connect your Facebook Page inbox",
    },
    [CHANNELS.INSTAGRAM]: {
        type: "messaging",
        label: "Instagram DMs",
        icon: "fa-brands fa-instagram",
        description: "Reply to Instagram direct messages",
    },
    [CHANNELS.TELEGRAM]: {
        type: "messaging",
        label: "Telegram",
        icon: "fa-brands fa-telegram",
        description: "Telegram bot messaging",
    },
    [CHANNELS.WEBCHAT]: {
        type: "messaging",
        label: "Website Live Chat",
        icon: "fa-comments",
        description: "Embedded live chat widget",
    },
    [CHANNELS.EMAIL]: {
        type: "messaging",
        label: "Email",
        icon: "fa-envelope",
        description: "Send and receive support emails",
    },
    [CHANNELS.SMS]: {
        type: "messaging",
        label: "SMS",
        icon: "fa-mobile-screen",
        description: "SMS via Twilio or similar",
    },
    [CONNECTORS.GOOGLE_CALENDAR]: {
        type: "connector",
        label: "Google Calendar",
        icon: "fa-calendar",
        description: "Sync appointments and events",
    },
    [CONNECTORS.MICROSOFT_365]: {
        type: "connector",
        label: "Microsoft 365",
        icon: "fa-microsoft",
        description: "Outlook, Teams, and calendar sync",
    },
    [CONNECTORS.STRIPE]: {
        type: "connector",
        label: "Stripe",
        icon: "fa-credit-card",
        description: "Payments and billing webhooks",
    },
    [CONNECTORS.PAYSTACK]: {
        type: "connector",
        label: "Paystack",
        icon: "fa-money-bill",
        description: "African payments integration",
    },
    [CONNECTORS.FIREBASE]: {
        type: "connector",
        label: "Firebase",
        icon: "fa-fire",
        description: "Push notifications and auth",
    },
};

/**
 * @param {string} channel
 * @returns {object}
 */
export function getDefaultIntegrationConfig(channel) {
    return INTEGRATION_CATALOG[channel] || { type: "unknown", label: channel, description: "" };
}

/**
 * In-memory phone_number_id → companyId mapping (demo / single-tenant).
 * Production: load from Firestore integrations collection.
 */
const phoneNumberIdMap = new Map();

export function registerPhoneNumberMapping(phoneNumberId, companyId) {
    if (phoneNumberId && companyId) {
        phoneNumberIdMap.set(String(phoneNumberId), companyId);
    }
}

export function resolveCompanyFromPhoneNumberId(phoneNumberId) {
    if (!phoneNumberId) return process.env.DEFAULT_COMPANY_ID || null;
    return phoneNumberIdMap.get(String(phoneNumberId)) || process.env.DEFAULT_COMPANY_ID || null;
}

/** Bootstrap default mapping from env */
export function bootstrapIntegrationConfig() {
    const phoneId = process.env.PHONE_NUMBER_ID;
    const companyId = process.env.DEFAULT_COMPANY_ID;
    if (phoneId && companyId) {
        registerPhoneNumberMapping(phoneId, companyId);
    }
}
