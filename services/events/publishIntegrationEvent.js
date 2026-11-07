/**
 * C1 — Integration event publisher (envelope v1).
 * Gated for Sarah App consumer flows via INTEGRATION_EVENTS_SARAH_APP=1.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publish } from "./eventBus.js";
import { EventTypes } from "./eventTypes.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(__dirname, "integrationEventContract.v1.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

const INTEGRATION_EVENT_TYPES = new Set(contract.properties.type.enum);
const SOURCE_PORTALS = new Set(contract.properties.source.properties.portal.enum);
const RESOURCE_KINDS = new Set(contract.properties.resource.properties.kind.enum);
const SERVICE_VERSION = "c1";

const idempotencyRepo = new TenantRepository(TENANT_COLLECTIONS.INTEGRATION_IDEMPOTENCY_KEYS);

/** @type {Map<string, object>} idempotencyKey → stored envelope */
const idempotencyMemory = new Map();
/** @type {Map<string, object>} eventId → audit copy (sarahNetwork/audit) */
const auditMemory = new Map();

const INTEGRATION_TO_TENANT_EVENT = {
    "integration.conversation.opened": EventTypes.CONVERSATION_STARTED,
    "integration.message.user": EventTypes.MESSAGE_RECEIVED,
    "integration.message.assistant": EventTypes.MESSAGE_SENT,
};

export function isSarahAppIntegrationEventsEnabled() {
    return String(process.env.INTEGRATION_EVENTS_SARAH_APP || "").trim() === "1";
}

function isIsoDateTime(value) {
    if (typeof value !== "string" || !value) return false;
    const t = Date.parse(value);
    return Number.isFinite(t);
}

/**
 * @param {object} envelope
 */
export function validateIntegrationEventV1(envelope) {
    if (!envelope || typeof envelope !== "object") {
        throw Object.assign(new Error("Integration event envelope is required."), {
            code: "INTEGRATION_EVENT_INVALID",
        });
    }
    for (const key of contract.required) {
        if (!(key in envelope)) {
            throw Object.assign(new Error(`Integration event missing required field: ${key}`), {
                code: "INTEGRATION_EVENT_INVALID",
            });
        }
    }
    if (!INTEGRATION_EVENT_TYPES.has(envelope.type)) {
        throw Object.assign(new Error(`Unknown integration event type: ${envelope.type}`), {
            code: "INTEGRATION_EVENT_INVALID",
        });
    }
    if (!isIsoDateTime(envelope.occurredAt)) {
        throw Object.assign(new Error("occurredAt must be a valid ISO-8601 date-time."), {
            code: "INTEGRATION_EVENT_INVALID",
        });
    }
    const source = envelope.source;
    if (!source || typeof source !== "object" || !SOURCE_PORTALS.has(source.portal)) {
        throw Object.assign(new Error("source.portal is invalid."), { code: "INTEGRATION_EVENT_INVALID" });
    }
    const resource = envelope.resource;
    if (!resource || typeof resource !== "object" || !RESOURCE_KINDS.has(resource.kind) || !resource.id) {
        throw Object.assign(new Error("resource.kind/id is invalid."), { code: "INTEGRATION_EVENT_INVALID" });
    }
    return envelope;
}

export function integrationIdempotencyDocId(idempotencyKey) {
    const raw = String(idempotencyKey || "").trim();
    return createHash("sha256").update(`integration:${raw}`).digest("hex").slice(0, 40);
}

function resolveIdempotencyKey(envelope) {
    const key = String(envelope.idempotencyKey || envelope.id || "").trim();
    if (!key) {
        throw Object.assign(new Error("idempotencyKey or id is required for publish."), {
            code: "INTEGRATION_EVENT_IDEMPOTENCY_REQUIRED",
        });
    }
    return key;
}

async function reserveIdempotency(companyId, idempotencyKey, envelope) {
    const existingMem = idempotencyMemory.get(idempotencyKey);
    if (existingMem) {
        return { duplicate: true, envelope: existingMem };
    }

    if (companyId) {
        const docId = integrationIdempotencyDocId(idempotencyKey);
        const existing = await idempotencyRepo.get(companyId, docId);
        if (existing?.envelope) {
            idempotencyMemory.set(idempotencyKey, existing.envelope);
            return { duplicate: true, envelope: existing.envelope };
        }
    }

    idempotencyMemory.set(idempotencyKey, envelope);
    if (companyId) {
        const docId = integrationIdempotencyDocId(idempotencyKey);
        await idempotencyRepo.set(companyId, docId, {
            idempotencyKey,
            envelope,
            integrationEventId: envelope.id,
        });
    }
    auditMemory.set(envelope.id, { ...envelope, auditAt: new Date().toISOString() });
    return { duplicate: false, envelope };
}

async function fanOutToTenantEventBus(envelope, idempotencyKey) {
    const tenantType = INTEGRATION_TO_TENANT_EVENT[envelope.type];
    const companyId = envelope.companyId;
    if (!tenantType || !companyId) return null;
    const channel = envelope.payload?.channel || envelope.metadata?.channel || "sarah_app";
    return publish(
        companyId,
        tenantType,
        {
            channel,
            personId: envelope.personId || null,
            resource: envelope.resource,
            integrationType: envelope.type,
            ...(envelope.payload || {}),
        },
        {
            metadata: {
                idempotencyKey,
                integrationEventId: envelope.id,
                channel,
            },
        }
    );
}

/**
 * Validate envelope, enforce idempotency, optional tenant event bus fan-out.
 * @param {object} envelope
 * @param {{ skipFanOut?: boolean }} [options]
 */
export async function publishIntegrationEvent(envelope, options = {}) {
    const normalized = validateIntegrationEventV1({
        ...envelope,
        id: envelope.id || `evt-${randomUUID()}`,
    });
    const idempotencyKey = resolveIdempotencyKey(normalized);
    const reserved = await reserveIdempotency(normalized.companyId || null, idempotencyKey, normalized);
    if (reserved.duplicate) {
        return { duplicate: true, event: reserved.envelope, tenantEvent: null };
    }

    let tenantEvent = null;
    if (!options.skipFanOut) {
        tenantEvent = await fanOutToTenantEventBus(normalized, idempotencyKey);
    }
    return { duplicate: false, event: normalized, tenantEvent };
}

export function buildSarahAppConversationOpenedEvent(conv) {
    return {
        id: `evt-${randomUUID()}`,
        type: "integration.conversation.opened",
        occurredAt: conv.createdAt || new Date().toISOString(),
        companyId: conv.companyId,
        personId: conv.personId || conv.userId,
        source: { portal: "sarah_app", service: "userConversationService", version: SERVICE_VERSION },
        resource: { kind: "conversation", id: conv.id },
        idempotencyKey: `sarah_app:${conv.companyId}:conversation:${conv.id}`,
        payload: { channel: "sarah_app", tenantConversationId: conv.tenantConversationId || null },
        metadata: { userId: conv.userId },
    };
}

/**
 * @param {object} conv
 * @param {{ id: string, role: string, content?: string, source?: string | null }} entry
 */
export function buildSarahAppMessageIntegrationEvent(conv, entry) {
    const isUser = entry.role === "user";
    return {
        id: `evt-${randomUUID()}`,
        type: isUser ? "integration.message.user" : "integration.message.assistant",
        occurredAt: entry.createdAt || new Date().toISOString(),
        companyId: conv.companyId,
        personId: conv.personId || conv.userId,
        source: { portal: "sarah_app", service: "userConversationService", version: SERVICE_VERSION },
        resource: { kind: "message", id: entry.id },
        idempotencyKey: `sarah_app:${conv.companyId}:${entry.id}`,
        payload: {
            channel: "sarah_app",
            role: entry.role,
            contentPreview: String(entry.content || "").slice(0, 160),
            conversationId: conv.id,
        },
        metadata: { userId: conv.userId, messageSource: entry.source || null },
    };
}

export function listIntegrationAuditEventsForTests() {
    return [...auditMemory.values()];
}

export function clearIntegrationEventStoresForTests() {
    idempotencyMemory.clear();
    auditMemory.clear();
}
