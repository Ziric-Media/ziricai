/**
 * Tenant-scoped storage abstraction — companies/{companyId}/<collection>.
 * Works with TenantRepository (memory or Firestore). Legacy global phone keys
 * remain in memoryAdapter for backward compatibility when companyId is absent.
 */
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { normalizePhone } from "../customerService.js";
import { isLikelyCompanyName } from "../customerIdentity.js";
import { getDurableCustomer, upsertDurableCustomer } from "../database/customerRepository.js";

const customersRepo = new TenantRepository(TENANT_COLLECTIONS.CUSTOMERS);
const conversationsRepo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);
const messagesRepo = new TenantRepository(TENANT_COLLECTIONS.MESSAGES);
const memoriesRepo = new TenantRepository(TENANT_COLLECTIONS.MEMORIES);
const integrationsRepo = new TenantRepository(TENANT_COLLECTIONS.INTEGRATIONS);
const aiEmployeesRepo = new TenantRepository(TENANT_COLLECTIONS.AI_EMPLOYEES);

function now() {
    return new Date().toISOString();
}

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function customerDocId(phone) {
    return normalizePhone(phone);
}

export function conversationDocId(customerId, channel = "whatsapp") {
    return `${channel}::${customerId}`;
}

function memoryDocId(customerId, agentId) {
    return `${customerId}::${agentId || "default"}`;
}

function assertCompanyId(companyId) {
    if (!companyId) throw new Error("companyId is required for tenant-scoped storage");
}

/* ── Customers ── */

function mergeDurableIdentity(tenantRecord, durableRecord) {
    if (!durableRecord) return tenantRecord;
    if (!tenantRecord) return durableRecord;
    const salesContext = tenantRecord.salesContext || durableRecord.metadata?.salesContext || null;
    return {
        ...tenantRecord,
        displayName: durableRecord.displayName || tenantRecord.displayName || null,
        explicitName: durableRecord.explicitName || tenantRecord.explicitName || null,
        whatsappContactName: durableRecord.whatsappContactName || tenantRecord.whatsappContactName || null,
        name: durableRecord.displayName || durableRecord.name || tenantRecord.displayName || tenantRecord.name || null,
        salesContext: salesContext || undefined,
        metadata: { ...(tenantRecord.metadata || {}), ...(durableRecord.metadata || {}) },
    };
}

export async function getTenantCustomer(companyId, phone) {
    assertCompanyId(companyId);
    const id = customerDocId(phone);
    const [tenantRecord, durableRecord] = await Promise.all([
        customersRepo.get(companyId, id),
        getDurableCustomer(companyId, id).catch(() => null),
    ]);
    return mergeDurableIdentity(tenantRecord, durableRecord);
}

export async function upsertTenantCustomer(companyId, phone, patch = {}) {
    assertCompanyId(companyId);
    const id = customerDocId(phone);
    const existing = (await customersRepo.get(companyId, id)) || {};
    const record = {
        ...existing,
        ...patch,
        id,
        customerId: id,
        phone: id,
        companyId,
        updatedAt: now(),
        createdAt: existing.createdAt || patch.createdAt || now(),
    };

    const identityPatch = {};
    if (patch.displayName != null) identityPatch.displayName = patch.displayName;
    if (patch.explicitName != null) identityPatch.explicitName = patch.explicitName;
    if (patch.name != null) identityPatch.name = patch.name;
    if (patch.whatsappContactName != null) identityPatch.whatsappContactName = patch.whatsappContactName;
    if (Object.keys(identityPatch).length) {
        await upsertDurableCustomer(companyId, id, identityPatch).catch((err) => {
            console.warn("[tenantStorage] durable customer upsert failed:", err.message);
        });
    }

    return customersRepo.set(companyId, id, record);
}

export async function listTenantCustomers(companyId, { limit = 100 } = {}) {
    assertCompanyId(companyId);
    return customersRepo.list(companyId, { max: limit, orderByField: "updatedAt" });
}

export async function updateTenantCustomer(companyId, phone, patch) {
    return upsertTenantCustomer(companyId, phone, patch);
}

/* ── Conversations ── */

export async function getOrCreateConversation(companyId, phone, channel = "whatsapp", meta = {}) {
    assertCompanyId(companyId);
    const customerId = customerDocId(phone);
    const conversationId = conversationDocId(customerId, channel);
    const existing = await conversationsRepo.get(companyId, conversationId);
    if (existing) {
        if (Object.keys(meta).length) {
            return conversationsRepo.update(companyId, conversationId, meta);
        }
        return existing;
    }
    return conversationsRepo.create(
        companyId,
        {
            conversationId,
            customerId,
            channel,
            status: "in_progress",
            mode: "ai",
            lastMessage: meta.lastMessage || "",
            preview: meta.preview || meta.lastMessage || "",
            customerName: meta.customerName || customerId,
            ...meta,
        },
        conversationId
    );
}

export async function getTenantConversation(companyId, phone, channel = "whatsapp") {
    assertCompanyId(companyId);
    const conversationId = conversationDocId(customerDocId(phone), channel);
    return conversationsRepo.get(companyId, conversationId);
}

export async function listTenantConversations(companyId, { limit = 50, channel = null } = {}) {
    assertCompanyId(companyId);
    const filters = channel ? { channel } : {};
    return conversationsRepo.list(companyId, { max: limit, orderByField: "updatedAt", filters });
}

/* ── Messages (scoped through conversation) ── */

export async function saveTenantMessage(companyId, phone, role, content, options = {}) {
    assertCompanyId(companyId);
    const customerId = customerDocId(phone);
    const channel = options.channel || "whatsapp";
    const conversationId = conversationDocId(customerId, channel);

    await getOrCreateConversation(companyId, phone, channel, {
        lastMessage: String(content).slice(0, 120),
        preview: String(content).slice(0, 120),
        customerName: options.contactName || options.customerName,
        status: "in_progress",
    });

    const messageId = options.externalId || uid("msg");
    const entry = {
        conversationId,
        customerId,
        channel,
        role,
        message: content,
        content,
        externalId: options.externalId || null,
        mediaUrl: options.mediaUrl || null,
        createdAt: now(),
    };

    await messagesRepo.set(companyId, messageId, entry);

    const existingCustomer = (await getTenantCustomer(companyId, phone)) || {};
    const customerPatch = {
        lastMessage: String(content).slice(0, 120),
        lastSeen: now(),
        status: "in_progress",
        channel,
        totalMessages: (existingCustomer.totalMessages || 0) + 1,
    };

    if (options.explicitDisplayName) {
        customerPatch.displayName = options.explicitDisplayName;
        customerPatch.name = options.explicitDisplayName;
    } else if (options.contactName) {
        customerPatch.whatsappContactName = options.contactName;
        if (
            !existingCustomer.displayName &&
            !isLikelyCompanyName(options.contactName, { companyName: options.companyName })
        ) {
            customerPatch.name = options.contactName;
        }
    } else if (options.name && !existingCustomer.displayName) {
        customerPatch.name = options.name;
    }

    await upsertTenantCustomer(companyId, phone, customerPatch);

    return { conversationId, messageId, role, customerId };
}

export async function getTenantConversationHistory(companyId, phone, channel = "whatsapp", max = 20) {
    assertCompanyId(companyId);
    const customerId = customerDocId(phone);
    const conversationId = conversationDocId(customerId, channel);
    const all = await messagesRepo.list(companyId, { max: 500, orderByField: "createdAt" });
    const filtered = all
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return filtered.slice(-max).map((m) => ({
        role: m.role === "assistant" ? "assistant" : m.role,
        content: m.content || m.message,
    }));
}

/* ── Memories ── */

export async function saveTenantMemory(companyId, phone, agentId, fact) {
    assertCompanyId(companyId);
    const customerId = customerDocId(phone);
    const docId = memoryDocId(customerId, agentId);
    const existing = (await memoriesRepo.get(companyId, docId)) || {
        customerId,
        agentId: agentId || "default",
        facts: [],
    };
    const prior = existing.facts || [];
    if (prior.some((entry) => entry.fact === fact)) {
        return existing;
    }
    const facts = [...prior, { fact, createdAt: now() }];
    return memoriesRepo.set(companyId, docId, {
        customerId,
        agentId: agentId || "default",
        facts,
    });
}

export async function getTenantMemories(companyId, phone, agentId) {
    assertCompanyId(companyId);
    const customerId = customerDocId(phone);
    const docId = memoryDocId(customerId, agentId);
    const record = await memoriesRepo.get(companyId, docId);
    return record?.facts || [];
}

export async function formatTenantMemoriesForPrompt(companyId, phone, agentId) {
    const facts = await getTenantMemories(companyId, phone, agentId);
    if (!facts.length) return "";
    const ranked = [...facts].sort((a, b) => {
        const aBudget = /budget:/i.test(a.fact || "") ? 0 : 1;
        const bBudget = /budget:/i.test(b.fact || "") ? 0 : 1;
        if (aBudget !== bBudget) return aBudget - bBudget;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    const recent = ranked.slice(0, 20);
    return `Customer memories:\n${recent.map((m) => `- ${m.fact}`).join("\n")}`;
}

/* ── Registry passthrough (same interface as integrationService) ── */

export async function listTenantIntegrations(companyId) {
    return integrationsRepo.list(companyId);
}

export async function upsertTenantIntegration(companyId, docId, data) {
    return integrationsRepo.set(companyId, docId, { ...data, companyId });
}

export async function listTenantAiEmployees(companyId) {
    return aiEmployeesRepo.list(companyId);
}

export {
    customersRepo,
    conversationsRepo,
    messagesRepo,
    memoriesRepo,
    integrationsRepo,
    aiEmployeesRepo,
};
