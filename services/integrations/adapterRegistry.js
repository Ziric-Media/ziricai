/**
 * Registry of all channel adapters and connectors.
 */
import { whatsappAdapter } from "./adapters/whatsappAdapter.js";
import { facebookAdapter } from "./adapters/facebookAdapter.js";
import { instagramAdapter } from "./adapters/instagramAdapter.js";
import { telegramAdapter } from "./adapters/telegramAdapter.js";
import { webchatAdapter } from "./adapters/webchatAdapter.js";
import { emailAdapter } from "./adapters/emailAdapter.js";
import { smsAdapter } from "./adapters/smsAdapter.js";
import { googleCalendarAdapter } from "./connectors/googleCalendarAdapter.js";
import { microsoft365Adapter } from "./connectors/microsoft365Adapter.js";
import { stripeAdapter } from "./connectors/stripeAdapter.js";
import { paystackAdapter } from "./connectors/paystackAdapter.js";
import { firebaseAdapter } from "./connectors/firebaseAdapter.js";
import { CHANNELS, CONNECTORS } from "./types/unifiedMessage.js";
import { INTEGRATION_CATALOG } from "./types/integrationConfig.js";

const adapters = new Map();

function register(adapter) {
    adapters.set(adapter.getChannelType(), adapter);
}

export function initAdapterRegistry() {
    if (adapters.size > 0) return adapters;

    [
        whatsappAdapter,
        facebookAdapter,
        instagramAdapter,
        telegramAdapter,
        webchatAdapter,
        emailAdapter,
        smsAdapter,
        googleCalendarAdapter,
        microsoft365Adapter,
        stripeAdapter,
        paystackAdapter,
        firebaseAdapter,
    ].forEach(register);

    return adapters;
}

/**
 * @param {string} channel
 * @returns {import('./adapters/baseAdapter.js').BaseAdapter|null}
 */
export function getAdapter(channel) {
    initAdapterRegistry();
    return adapters.get(normalizeChannel(channel)) || null;
}

export function listAdapters() {
    initAdapterRegistry();
    return [...adapters.values()];
}

export function listMessagingChannels() {
    return Object.values(CHANNELS);
}

export function listConnectors() {
    return Object.values(CONNECTORS);
}

/**
 * Normalize URL slug to channel key (e.g. google-calendar → google_calendar).
 * @param {string} slug
 */
export function normalizeChannel(slug) {
    if (!slug) return slug;
    const lower = slug.toLowerCase().replace(/-/g, "_");
    const aliases = {
        googlecalendar: CONNECTORS.GOOGLE_CALENDAR,
        google_calendar: CONNECTORS.GOOGLE_CALENDAR,
        microsoft365: CONNECTORS.MICROSOFT_365,
        microsoft_365: CONNECTORS.MICROSOFT_365,
        m365: CONNECTORS.MICROSOFT_365,
    };
    return aliases[lower] || lower;
}

/**
 * Channel health snapshot for a tenant.
 * @param {string|null} companyId
 */
export function getChannelStatus(companyId = null) {
    initAdapterRegistry();
    const ctx = { companyId };

    return listAdapters().map((adapter) => {
        const channel = adapter.getChannelType();
        const catalog = INTEGRATION_CATALOG[channel] || {};
        return {
            channel,
            label: catalog.label || channel,
            type: catalog.type || "unknown",
            configured: adapter.isConfigured(ctx),
            description: catalog.description || "",
        };
    });
}
