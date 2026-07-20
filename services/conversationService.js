/**
 * ZiricAI Conversation Service — legacy storageAdapter pipeline.
 * @deprecated Use services/tenants/conversationService.js for tenant-scoped conversations.
 *
 * Flow: server.js → conversationService → storageAdapter → (Firestore | memory)
 * The webhook and admin API read/write conversations through this layer only.
 */
import { getStorageAdapter } from "./storage/storageAdapter.js";

async function adapter() {
    return getStorageAdapter();
}

export async function saveInboundMessage(phone, text, options = {}) {
    const store = await adapter();
    return store.saveMessage(phone, "user", text, options);
}

export async function saveOutboundMessage(phone, text, options = {}) {
    const store = await adapter();
    return store.saveMessage(phone, "assistant", text, options);
}

/** @deprecated use saveInboundMessage / saveOutboundMessage */
export async function saveMessage(phone, role, message, options = {}) {
    const store = await adapter();
    return store.saveMessage(phone, role, message, options);
}

export async function getConversation(phone, max = 20) {
    const store = await adapter();
    return store.getConversation(phone, max);
}

export async function listConversations(options = {}) {
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
