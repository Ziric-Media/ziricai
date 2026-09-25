/**
 * In-app portal notifications from tenant events (WhatsApp, appointments, automation).
 */
import { subscribe } from "./eventBus.js";
import { EventTypes } from "./eventTypes.js";
import { sendNotification } from "../tenants/notificationService.js";
import { listTenantNotifications } from "../tenants/notificationService.js";

const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function truncate(text, max = 96) {
    const t = String(text || "").trim();
    if (!t) return "(no message text)";
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function displayName(payload = {}) {
    if (payload.contactName) return String(payload.contactName).trim();
    const phone = payload.phone || payload.customerId;
    if (!phone) return "Customer";
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length >= 10) return `+${digits}`;
    return String(phone);
}

async function recentlyNotified(companyId, fingerprint) {
    const items = await listTenantNotifications(companyId);
    const cutoff = Date.now() - DEDUPE_WINDOW_MS;
    for (const n of items.slice(0, 15)) {
        if (n.meta?.fingerprint !== fingerprint) continue;
        const created = Date.parse(n.createdAt || "");
        if (Number.isFinite(created) && created >= cutoff) return true;
    }
    return false;
}

async function notifyInApp(companyId, entry) {
    if (entry.meta?.fingerprint && (await recentlyNotified(companyId, entry.meta.fingerprint))) {
        return null;
    }
    return sendNotification(companyId, { ...entry, channels: ["in_app"] });
}

async function onEvent(event) {
    if (!event?.companyId) return;
    const { companyId, type, payload = {} } = event;

    switch (type) {
        case EventTypes.MESSAGE_RECEIVED: {
            if ((payload.channel || "whatsapp") !== "whatsapp") break;
            const name = displayName(payload);
            const fingerprint = `wa-in:${payload.phone || name}:${truncate(payload.text, 40)}`;
            await notifyInApp(companyId, {
                type: "customer",
                icon: "fa-brands fa-whatsapp",
                color: "green",
                title: "New WhatsApp message",
                message: `${name}: ${truncate(payload.text)}`,
                meta: {
                    fingerprint,
                    phone: payload.phone || null,
                    channel: payload.channel || "whatsapp",
                    eventId: event.id,
                },
            });
            break;
        }
        case EventTypes.APPOINTMENT_BOOKED: {
            const fingerprint = `appt:${payload.appointmentId || payload.scheduledAt || event.id}`;
            await notifyInApp(companyId, {
                type: "appointment",
                icon: "fa-calendar-check",
                color: "blue",
                title: "Appointment booked",
                message: `${payload.customerName || "Customer"} — ${payload.service || "Test drive"}${payload.scheduledAt ? ` · ${String(payload.scheduledAt).slice(0, 16).replace("T", " ")}` : ""}`,
                meta: { fingerprint, appointmentId: payload.appointmentId || null },
            });
            break;
        }
        case EventTypes.LEAD_CAPTURED: {
            const fingerprint = `lead:${payload.phone || payload.customerId || event.id}`;
            await notifyInApp(companyId, {
                type: "customer",
                icon: "fa-user-plus",
                color: "blue",
                title: "New lead",
                message: payload.customerName || payload.phone || "A new lead was captured",
                meta: { fingerprint },
            });
            break;
        }
        case EventTypes.AUTOMATION_EXECUTED: {
            if (payload.success !== false) break;
            const fingerprint = `auto-fail:${payload.workflowId || payload.runId || event.id}`;
            await notifyInApp(companyId, {
                type: "workflow_failed",
                icon: "fa-diagram-project",
                color: "red",
                title: "Workflow failed",
                message: `Automation run failed${payload.workflowId ? ` (${payload.workflowId})` : ""}`,
                meta: { fingerprint, workflowId: payload.workflowId || null },
            });
            break;
        }
        default:
            break;
    }
}

export function registerPortalNotificationHandler() {
    subscribe("*", async (event) => {
        try {
            await onEvent(event);
        } catch (err) {
            console.warn("[portalNotifications]", event?.type, err.message);
        }
    });
}
