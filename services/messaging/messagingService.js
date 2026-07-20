/**
 * WhatsApp and notification messaging abstraction.
 */
import { sendWhatsAppMessage } from "../whatsapp.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";

export async function sendWhatsApp(to, text) {
    return sendWhatsAppMessage(to, text);
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

export function isWhatsAppConfigured() {
    return Boolean(process.env.PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN);
}
