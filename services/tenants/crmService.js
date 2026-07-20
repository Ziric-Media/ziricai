/**
 * CRM service — contacts, leads, customers within tenant scope.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    listCustomers as legacyListCustomers,
    getCustomerProfile,
    updateCustomer,
    upsertCustomerFromWhatsApp,
    normalizePhone,
    addNote,
    addTask,
    getTimeline,
} from "../customerService.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { publish, EventTypes } from "../events/index.js";

class ContactService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.CONTACTS);
    }
}

class LeadService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.LEADS);
    }
}

class CustomerService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.CUSTOMERS);
    }
}

const contactService = new ContactService();
const leadService = new LeadService();
const customerService = new CustomerService();

export {
    normalizePhone,
    getCustomerProfile,
    updateCustomer,
    upsertCustomerFromWhatsApp,
    addNote,
    addTask,
    getTimeline,
};

export async function listCustomers(options = {}) {
    return legacyListCustomers(options);
}

export async function ensureCrmWorkspace(companyId, label) {
    const adapter = await getStorageAdapter();
    const workspace = {
        companyId,
        label: label || `${companyId} CRM`,
        autoCreateCustomers: true,
        autoScore: true,
        autoSentiment: true,
        createdAt: new Date().toISOString(),
    };
    if (adapter.saveCrmWorkspace) {
        await adapter.saveCrmWorkspace(companyId, workspace);
    }
    return workspace;
}

export async function createContact(companyId, data) {
    return contactService.create(companyId, data);
}

export async function listContacts(companyId, options = {}) {
    return contactService.list(companyId, options);
}

export async function createLead(companyId, data) {
    return leadService.create(companyId, {
        stage: "new",
        leadScore: 50,
        source: "manual",
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
    });
}

export async function listLeads(companyId, options = {}) {
    const tenantLeads = await leadService.list(companyId, { ...options, orderByField: "leadScore" });
    if (tenantLeads.length) return tenantLeads;

    const customers = await legacyListCustomers({ companyId, limit: 100 });
    return customers
        .filter((c) => (c.leadScore ?? 0) >= 40)
        .map((c) => ({
            id: c.id || c.phone,
            name: c.name,
            phone: c.phone,
            leadScore: c.leadScore,
            stage: c.status === "won" ? "won" : c.leadScore >= 80 ? "qualified" : "new",
            source: "conversation",
            companyId,
        }));
}

export async function captureLeadFromMessage(companyId, { phone, contactName, leadScore, topic, channel }) {
    const id = normalizePhone(phone);
    const existing = await leadService.get(companyId, id);
    if (existing) {
        return leadService.update(companyId, id, {
            leadScore: Math.max(existing.leadScore || 0, leadScore || 0),
            lastActivityAt: new Date().toISOString(),
            topic: topic || existing.topic,
        });
    }
    const lead = await leadService.create(
        companyId,
        {
            id,
            phone: id,
            name: contactName || id,
            leadScore: leadScore || 60,
            stage: leadScore >= 80 ? "qualified" : "new",
            source: channel || "whatsapp",
            topic: topic || null,
        },
        id
    );

    await publish(companyId, EventTypes.LEAD_CAPTURED, {
        leadId: lead.id,
        phone: id,
        contactName,
        leadScore,
        topic,
        channel,
    });
    return lead;
}

export async function syncCustomerToTenant(companyId, phone, customerData) {
    const id = normalizePhone(phone);
    return customerService.upsert(companyId, id, customerData);
}

export async function listTenantCustomers(companyId, options = {}) {
    const legacy = await legacyListCustomers({ companyId, ...options });
    if (legacy.length) return legacy;
    return customerService.list(companyId, options);
}
