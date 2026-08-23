/**
 * ZiricAI Conversation Service — bridges legacy storageAdapter and tenant-scoped storage.
 * When companyId is provided, reads/writes go through tenantStorage (multi-tenant isolation).
 */
import { getStorageAdapter } from "./storage/storageAdapter.js";
import {
    saveTenantMessage,
    getTenantConversationHistory,
    listTenantConversations,
} from "./storage/tenantStorage.js";

async function adapter() {
    return getStorageAdapter();
}

export async function saveInboundMessage(phone, text, options = {}) {
    if (options.companyId) {
        return saveTenantMessage(options.companyId, phone, "user", text, options);
    }
    const store = await adapter();
    return store.saveMessage(phone, "user", text, options);
}

export async function saveOutboundMessage(phone, text, options = {}) {
    if (options.companyId) {
        return saveTenantMessage(options.companyId, phone, "assistant", text, options);
    }
    const store = await adapter();
    return store.saveMessage(phone, "assistant", text, options);
}

/** Idempotency — skip duplicate Meta webhook deliveries (wamid). */
export async function isInboundMessageProcessed(externalId) {
    if (!externalId) return false;
    const store = await adapter();
    if (typeof store.isMessageProcessed === "function") {
        return store.isMessageProcessed(externalId);
    }
    return false;
}

export async function markInboundMessageProcessed(externalId, meta = {}) {
    if (!externalId) return null;
    const store = await adapter();
    if (typeof store.markMessageProcessed === "function") {
        return store.markMessageProcessed(externalId, meta);
    }
    return null;
}

/** @deprecated use saveInboundMessage / saveOutboundMessage */
export async function saveMessage(phone, role, message, options = {}) {
    const store = await adapter();
    return store.saveMessage(phone, role, message, options);
}

export async function getConversation(phone, max = 20, options = {}) {
    const companyId = options.companyId || null;
    const channel = options.channel || "whatsapp";
    if (companyId) {
        return getTenantConversationHistory(companyId, phone, channel, max);
    }
    const store = await adapter();
    return store.getConversation(phone, max);
}

export async function listConversations(options = {}) {
    const { companyId, limit = 50, channel } = options;
    if (companyId) {
        const items = await listTenantConversations(companyId, { limit, channel });
        return items.map((c) => ({
            id: c.conversationId || c.id,
            phone: c.customerId,
            name: c.customerName || c.customerId,
            customerName: c.customerName || c.customerId,
            companyId,
            lastMessage: c.lastMessage || "",
            preview: c.preview || c.lastMessage || "",
            status: c.status || "in_progress",
            mode: c.mode || "ai",
            channel: c.channel || "whatsapp",
            time: c.updatedAt || null,
        }));
    }
    const store = await adapter();
    return store.listConversations(options);
}

export async function upsertCustomerFromWhatsApp(phone, { contactName, companyId, messagePreview } = {}) {
    const { upsertCustomerFromWhatsApp: upsert } = await import("./customerService.js");
    return upsert(phone, { contactName, companyId, messagePreview });
}

export async function appendAiSummary(phone, line) {
    const { appendAiSummary: append } = await import("./customerService.js");
    return append(phone, line);
}

export async function updateProfile(phone, name) {
    const store = await adapter();
    return store.updateCustomer(phone, { phone, name });
}

export async function saveConversationAnalysis(phone, analysis) {
    const store = await adapter();
    if (store.saveConversationAnalysis) {
        return store.saveConversationAnalysis(phone, analysis);
    }
    return store.updateCustomer(phone, { lastAnalysis: analysis });
}
