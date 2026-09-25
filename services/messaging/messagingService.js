/**
 * WhatsApp and notification messaging abstraction.
 */
import { sendWhatsAppMessage } from "../whatsapp.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";

export async function sendWhatsApp(to, text, options = {}) {
    return sendWhatsAppMessage(to, text, options);
}

export async function pushNotification(companyId, notification) {
    const adapter = await getStorageAdapter();
    if (adapter.pushPortalNotification) {
        return adapter.pushPortalNotification(companyId, notification);
    }
    return notification;
}

export async function listNotifications(companyId) {
    const adapter = await getStorageAdapter();
    if (adapter.getPortalNotifications) {
        return adapter.getPortalNotifications(companyId);
    }
    return [];
}

/** Shared-token multi-phone: token is required; phone id is resolved per tenant at send time. */
export function isWhatsAppConfigured() {
    return Boolean(process.env.WHATSAPP_TOKEN);
}
