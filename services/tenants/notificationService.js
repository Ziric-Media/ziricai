/**
 * Notification service — tenant alerts and activity.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { pushNotification, listNotifications } from "../messaging/messagingService.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";

class NotificationService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.NOTIFICATIONS);
    }

    async listUnread(companyId, max = 50) {
        return this.list(companyId, {
            max,
            filters: { read: false },
            orderByField: "createdAt",
        });
    }
}

const notificationService = new NotificationService();

function uid(prefix = "n") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createNotification(companyId, notification) {
    const entry = {
        id: notification.id || uid("n"),
        read: false,
        createdAt: new Date().toISOString(),
        ...notification,
    };

    await pushNotification(companyId, entry);
    return notificationService.create(companyId, entry, entry.id);
}

export async function listTenantNotifications(companyId) {
    const legacy = await listNotifications(companyId);
    if (legacy.length) return legacy;
    return notificationService.list(companyId, { orderByField: "createdAt" });
}

export async function markNotificationRead(companyId, notificationId) {
    return notificationService.update(companyId, notificationId, { read: true });
}

export async function pushActivity(companyId, activity) {
    const adapter = await getStorageAdapter();
    if (adapter.pushPortalActivity) {
        return adapter.pushPortalActivity(companyId, activity);
    }
    return activity;
}

export async function listUnreadNotifications(companyId) {
    const legacy = await listNotifications(companyId);
    const unread = legacy.filter((n) => !n.read);
    if (unread.length) return unread;
    return notificationService.listUnread(companyId);
}

export async function markAllNotificationsRead(companyId) {
    const items = await listTenantNotifications(companyId);
    let marked = 0;
    for (const n of items) {
        if (!n.read && n.id) {
            await markNotificationRead(companyId, n.id);
            marked += 1;
        }
    }
    return marked;
}

/**
 * Multi-channel notification dispatch — in-app always; email/SMS/WhatsApp/push stubs.
 * @param {string} companyId
 * @param {{ title: string, message: string, channels?: string[], priority?: string, meta?: object }} opts
 */
export async function sendNotification(companyId, opts) {
    const channels = opts.channels || ["in_app"];
    const entry = {
        type: opts.type || "alert",
        icon: opts.icon || "fa-bell",
        color: opts.priority === "high" ? "red" : opts.color || "blue",
        title: opts.title,
        message: opts.message,
        channels,
        meta: opts.meta || {},
        time: "Just now",
    };

    const results = { in_app: null, email: null, sms: null, whatsapp: null, push: null };

    if (channels.includes("in_app") || channels.includes("in-app")) {
        results.in_app = await createNotification(companyId, entry);
    }

    for (const ch of ["email", "sms", "whatsapp", "push"]) {
        if (channels.includes(ch)) {
            results[ch] = { stub: true, message: `${ch} delivery requires connector setup in Integrations` };
        }
    }

    return { notification: results.in_app, delivery: results };
}
