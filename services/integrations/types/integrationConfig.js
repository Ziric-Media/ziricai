import { CHANNELS, CONNECTORS } from "./unifiedMessage.js";
import {
    findActiveWhatsAppIntegrationByPhoneNumberId,
    maskPhoneNumberId,
} from "../../tenants/integrationService.js";

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
 * @deprecated Dev-only in-memory phone_number_id → companyId mapping.
 * Firestore integrations collection takes precedence in production.
 */
const phoneNumberIdMap = new Map();

/** @deprecated Register dev-only phone mapping — prefer Firestore seed/integrationService. */
export function registerPhoneNumberMapping(phoneNumberId, companyId) {
    if (phoneNumberId && companyId) {
        phoneNumberIdMap.set(String(phoneNumberId), companyId);
    }
}

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function deprecatedDevDefaultCompanyId() {
    if (isProduction()) return null;
    const fallback = process.env.DEFAULT_COMPANY_ID || null;
    if (fallback) {
        console.warn(
            "[whatsapp] DEPRECATED: DEFAULT_COMPANY_ID fallback used — set Firestore integration instead"
        );
    }
    return fallback;
}

/**
 * Resolve tenant from Meta phone_number_id.
 * 1. Firestore active WhatsApp integration (primary)
 * 2. @deprecated in-memory DEMO_PHONE_NUMBER_MAPPINGS (dev)
 * 3. @deprecated DEFAULT_COMPANY_ID (dev only, never production)
 *
 * @param {string} phoneNumberId
 * @returns {Promise<string|null>}
 */
export async function resolveCompanyFromPhoneNumberId(phoneNumberId) {
    if (!phoneNumberId) {
        return deprecatedDevDefaultCompanyId();
    }

    const key = String(phoneNumberId);
    console.log("[whatsapp] Phone Number ID received", {
        phoneNumberId: maskPhoneNumberId(key),
    });

    const integration = await findActiveWhatsAppIntegrationByPhoneNumberId(key);
    if (integration?.companyId) {
        console.log("[whatsapp] Integration resolved", {
            integrationId: integration.id,
            phoneNumberId: maskPhoneNumberId(key),
            status: integration.status,
        });
        console.log("[whatsapp] Company resolved", { companyId: integration.companyId });
        return integration.companyId;
    }

    const mapped = phoneNumberIdMap.get(key);
    if (mapped) {
        console.warn("[whatsapp] DEPRECATED: in-memory phone mapping used", {
            phoneNumberId: maskPhoneNumberId(key),
            companyId: mapped,
        });
        console.log("[whatsapp] Company resolved", { companyId: mapped });
        return mapped;
    }

    console.warn("[whatsapp] No integration for phone_number_id — companyId=null", {
        phoneNumberId: maskPhoneNumberId(key),
    });
    return deprecatedDevDefaultCompanyId();
}

/**
 * @deprecated Known phone_number_id → companyId mappings (dev bootstrap only).
 * Production routing uses Firestore companies/{companyId}/integrations.
 */
const DEMO_PHONE_NUMBER_MAPPINGS = [
    ["1209265748933699", "demo-central-motors"],
];

/** @deprecated Bootstrap dev-only in-memory mappings from env + demo seeds. Never runs in production. */
export function bootstrapIntegrationConfig() {
    if (isProduction()) return;

    for (const [phoneId, companyId] of DEMO_PHONE_NUMBER_MAPPINGS) {
        registerPhoneNumberMapping(phoneId, companyId);
    }

    const phoneId = process.env.PHONE_NUMBER_ID;
    const companyId = process.env.DEFAULT_COMPANY_ID;
    if (phoneId && companyId) {
        registerPhoneNumberMapping(phoneId, companyId);
    }
}

export { maskPhoneNumberId };
