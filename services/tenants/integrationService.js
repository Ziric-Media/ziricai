/**
 * Integration service — tenant third-party connections + cross-tenant WhatsApp phone lookup.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { getAdminFirestore, isServerSide } from "../database/firestoreAdmin.js";
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { memoryFindAll } from "../database/tenantRepository.js";

const PROVIDER_WHATSAPP = "whatsapp";
const ACTIVE_WHATSAPP_STATUSES = new Set(["active", "connected"]);

/** @type {Map<string, { integration: object, companyId: string }>} */
const phoneResolutionCache = new Map();

class IntegrationService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.INTEGRATIONS);
    }

    async getByProvider(companyId, provider) {
        const items = await this.list(companyId, { filters: { provider } });
        return items[0] || null;
    }
}

const integrationService = new IntegrationService();

export function maskPhoneNumberId(phoneNumberId) {
    if (!phoneNumberId) return null;
    const value = String(phoneNumberId);
    if (value.length <= 4) return "****";
    return `***${value.slice(-4)}`;
}

function companyIdFromDocPath(path) {
    const parts = String(path || "").split("/");
    const idx = parts.indexOf("companies");
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
}

function normalizeWhatsAppIntegration(record, docPath = null) {
    if (!record) return null;
    const companyId = record.companyId || companyIdFromDocPath(docPath);
    return {
        ...record,
        companyId,
        channel: record.channel || PROVIDER_WHATSAPP,
        provider: record.provider || PROVIDER_WHATSAPP,
    };
}

function isActiveWhatsAppIntegration(integration) {
    return integration && ACTIVE_WHATSAPP_STATUSES.has(integration.status);
}

export function warmPhoneResolutionCache(phoneNumberId, integration) {
    if (!phoneNumberId || !integration?.companyId) return;
    phoneResolutionCache.set(String(phoneNumberId), {
        integration: normalizeWhatsAppIntegration(integration),
        companyId: integration.companyId,
    });
}

export function clearPhoneResolutionCache() {
    phoneResolutionCache.clear();
}

function sanitizeIntegrationRecord(integration) {
    if (!integration) return null;
    const {
        config,
        accessToken,
        whatsappToken,
        token,
        privateKey,
        credentials,
        ...safe
    } = integration;
    return {
        ...safe,
        phoneNumberId: maskPhoneNumberId(integration.phoneNumberId),
        channel: integration.channel || integration.provider || PROVIDER_WHATSAPP,
    };
}

async function queryFirestoreWhatsAppByPhoneNumberId(phoneNumberId) {
    const admin = isServerSide() ? getAdminFirestore() : null;
    if (!admin) return null;

    const snap = await admin
        .collectionGroup(TENANT_COLLECTIONS.INTEGRATIONS)
        .where("phoneNumberId", "==", String(phoneNumberId))
        .where("provider", "==", PROVIDER_WHATSAPP)
        .limit(10)
        .get();

    for (const doc of snap.docs) {
        const integration = normalizeWhatsAppIntegration({ id: doc.id, ...doc.data() }, doc.ref.path);
        if (isActiveWhatsAppIntegration(integration)) {
            return integration;
        }
    }
    return null;
}

async function queryMemoryWhatsAppByPhoneNumberId(phoneNumberId) {
    const matches = memoryFindAll(TENANT_COLLECTIONS.INTEGRATIONS, {
        phoneNumberId: String(phoneNumberId),
        provider: PROVIDER_WHATSAPP,
    });
    for (const record of matches) {
        const integration = normalizeWhatsAppIntegration(record);
        if (isActiveWhatsAppIntegration(integration)) {
            return integration;
        }
    }
    return null;
}

/**
 * Find active WhatsApp integration by Meta phone_number_id (Firestore collection group).
 * @param {string} phoneNumberId
 * @returns {Promise<object|null>}
 */
export async function findActiveWhatsAppIntegrationByPhoneNumberId(phoneNumberId) {
    if (!phoneNumberId) return null;
    const key = String(phoneNumberId);

    const cached = phoneResolutionCache.get(key);
    if (cached?.integration && isActiveWhatsAppIntegration(cached.integration)) {
        return cached.integration;
    }

    const adapter = await getStorageAdapter();
    let integration = null;

    if (adapter.name === "firestore" && isServerSide() && getAdminFirestore()) {
        try {
            integration = await queryFirestoreWhatsAppByPhoneNumberId(key);
        } catch (err) {
            console.warn("[whatsapp] Firestore integration lookup failed:", err.message);
        }
    }

    if (!integration) {
        integration = await queryMemoryWhatsAppByPhoneNumberId(key);
    }

    if (integration) {
        warmPhoneResolutionCache(key, integration);
    }

    return integration;
}

/**
 * Resolve companyId from Meta phone_number_id via Firestore (no DEFAULT_COMPANY_ID fallback).
 * @param {string} phoneNumberId
 * @returns {Promise<string|null>}
 */
export async function resolveCompanyFromPhoneNumberId(phoneNumberId) {
    const integration = await findActiveWhatsAppIntegrationByPhoneNumberId(phoneNumberId);
    return integration?.companyId || null;
}

export async function listIntegrations(companyId) {
    return integrationService.list(companyId);
}

export async function listChannelIntegrations(companyId, channel = PROVIDER_WHATSAPP) {
    const items = await integrationService.list(companyId, { filters: { provider: channel } });
    return items.map(sanitizeIntegrationRecord);
}

export async function upsertIntegration(companyId, provider, config) {
    const existing = await integrationService.getByProvider(companyId, provider);
    const payload = {
        provider,
        channel: config.channel || provider,
        ...config,
        companyId,
    };
    if (existing?.id) {
        return integrationService.update(companyId, existing.id, payload);
    }
    return integrationService.create(companyId, { ...payload, status: config.status || "connected" });
}

export async function upsertWhatsAppIntegration(companyId, config, docId = "whatsapp") {
    const payload = {
        channel: PROVIDER_WHATSAPP,
        provider: PROVIDER_WHATSAPP,
        status: "active",
        ...config,
        companyId,
    };
    return integrationService.upsert(companyId, docId, payload);
}

export async function disconnectIntegration(companyId, integrationId) {
    return integrationService.update(companyId, integrationId, { status: "disconnected" });
}

export async function getWhatsAppIntegration(companyId) {
    return integrationService.getByProvider(companyId, PROVIDER_WHATSAPP);
}
