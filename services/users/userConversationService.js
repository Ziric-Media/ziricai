/**
 * U5 — consumer ↔ company Sarah conversations (user index + tenant mirror).
 */
import { randomUUID } from "node:crypto";
import { saveInboundMessage, saveOutboundMessage } from "../conversationService.js";
import { getTenantConversationHistory } from "../storage/tenantStorage.js";
import { getBusinessDirectoryEntry } from "./businessDirectoryService.js";
import { getPortalCompanyAsync } from "../portal/portalDemo.js";
import {
    buildConsumerConversationId,
    personIdFromUserId,
    ensureConversationMessagingFoundation,
    MESSAGE_ROLES,
} from "./identityContracts.js";
import {
    upsertConversation,
    upsertMessage as upsertFirestoreMessage,
    getConversationByPersonAndCompany,
    listMessages as listFirestoreMessages,
} from "./userConversationFirestoreStore.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import {
    buildSarahAppConversationOpenedEvent,
    buildSarahAppMessageIntegrationEvent,
    isSarahAppIntegrationEventsEnabled,
    publishIntegrationEvent,
} from "../events/publishIntegrationEvent.js";

const CHANNEL = "sarah_app";

/** @type {Map<string, object>} */
const conversations = new Map();
/** @type {Map<string, object[]>} */
const messagesByConversation = new Map();

function conversationKey(userId, companyId) {
    return `${companyId}::${userId}`;
}

function resolveUserConversationsBackend() {
    const raw = String(process.env.USER_CONVERSATIONS_BACKEND || "memory").trim().toLowerCase();
    if (raw === "dual" || raw === "firestore") return raw;
    return "memory";
}

/** @returns {"memory"|"dual"|"firestore"} */
export function getUserConversationsBackend() {
    return resolveUserConversationsBackend();
}

function shouldMirrorToFirestore() {
    const mode = resolveUserConversationsBackend();
    return (mode === "dual" || mode === "firestore") && useAdminBackend();
}

function shouldReadFirestoreIndex() {
    const mode = resolveUserConversationsBackend();
    return mode === "dual" || mode === "firestore";
}

/**
 * Dual/firestore: hydrate process cache from Firestore after restart (memory empty).
 * @param {string} userId
 * @param {string} companyId
 */
async function tryHydrateConversationFromFirestore(userId, companyId) {
    if (!shouldReadFirestoreIndex() || !useAdminBackend()) return null;
    try {
        const personId = personIdFromUserId(userId);
        const conv = await getConversationByPersonAndCompany(personId, companyId);
        if (!conv) return null;
        const key = conversationKey(userId, companyId);
        conversations.set(key, conv);
        const msgs = await listFirestoreMessages(conv.id);
        messagesByConversation.set(conv.id, msgs.length ? msgs : []);
        return conv;
    } catch (err) {
        console.warn("[userConversationService] Firestore hydrate failed:", err.message);
        return null;
    }
}

async function mirrorConversationToFirestore(conv) {
    if (!shouldMirrorToFirestore() || !conv) return;
    try {
        await upsertConversation(conv);
    } catch (err) {
        console.warn("[userConversationService] Firestore conversation upsert failed:", err.message);
    }
}

async function emitSarahAppIntegrationEvent(envelope) {
    if (!isSarahAppIntegrationEventsEnabled()) return;
    try {
        await publishIntegrationEvent(envelope);
    } catch (err) {
        console.warn("[userConversationService] integration event publish failed:", err.message);
    }
}

async function mirrorMessageToFirestore(conv, entry) {
    if (!shouldMirrorToFirestore() || !conv?.id || !entry?.id) return;
    try {
        await upsertFirestoreMessage(conv.id, entry, {
            lastMessageAt: conv.lastMessageAt,
            preview: conv.preview,
            tenantConversationId: conv.tenantConversationId ?? null,
        });
    } catch (err) {
        console.warn("[userConversationService] Firestore message upsert failed:", err.message);
    }
}

async function resolveCompanyDisplayName(companyId) {
    const dir = getBusinessDirectoryEntry(companyId);
    if (dir?.displayName) return dir.displayName;
    const company = await getPortalCompanyAsync(companyId).catch(() => null);
    return company?.company?.name || company?.name || companyId;
}

/**
 * @param {string} userId
 * @param {string} companyId
 * @param {object} [meta]
 */
export async function openUserConversation(userId, companyId, meta = {}) {
    const key = conversationKey(userId, companyId);
    let conv = conversations.get(key);
    if (!conv) {
        conv = await tryHydrateConversationFromFirestore(userId, companyId);
        if (conv) {
            conv = ensureConversationMessagingFoundation(conv);
            conversations.set(key, conv);
        }
    }
    if (!conv) {
        const personId = personIdFromUserId(userId);
        const companyName = await resolveCompanyDisplayName(companyId);
        conv = ensureConversationMessagingFoundation({
            id: buildConsumerConversationId(personId, companyId),
            personId,
            userId,
            companyId,
            companyName,
            channel: CHANNEL,
            lastMessageAt: new Date().toISOString(),
            preview: "",
            tenantConversationId: null,
            createdAt: new Date().toISOString(),
            ...meta,
        });
        conversations.set(key, conv);
        messagesByConversation.set(conv.id, []);
        await mirrorConversationToFirestore(conv);
        await emitSarahAppIntegrationEvent(buildSarahAppConversationOpenedEvent(conv));
    }
    return conv;
}

export function listUserConversations(userId) {
    return [...conversations.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
}

export function getUserConversationById(userId, conversationId) {
    const conv = [...conversations.values()].find((c) => c.id === conversationId && c.userId === userId);
    if (!conv) {
        throw Object.assign(new Error("Conversation not found."), { status: 404, code: "CONVERSATION_NOT_FOUND" });
    }
    return conv;
}

export function getUserConversationByCompany(userId, companyId) {
    return conversations.get(conversationKey(userId, companyId)) || null;
}

export function getUserConversationMessages(conversationId) {
    return messagesByConversation.get(conversationId) || [];
}

/**
 * @param {object} conv
 * @param {{ role: string, content: string, source?: string, id?: string }} message
 */
export async function appendUserConversationMessage(conv, message) {
    const list = messagesByConversation.get(conv.id) || [];
    const role = String(message.role || MESSAGE_ROLES.USER);
    const entry = {
        id: message.id && String(message.id) ? String(message.id) : randomUUID(),
        role,
        content: String(message.content || ""),
        source: message.source || null,
        authorParticipantId: message.authorParticipantId ?? null,
        createdAt: new Date().toISOString(),
    };
    const existing = list.find((m) => m.id === entry.id);
    if (existing) {
        return existing;
    }
    list.push(entry);
    messagesByConversation.set(conv.id, list);

    conv.lastMessageAt = entry.createdAt;
    conv.preview = entry.content.slice(0, 160);
    conversations.set(conversationKey(conv.userId, conv.companyId), conv);

    const tenantOpts = {
        channel: CHANNEL,
        externalUserId: conv.userId,
        contactName: conv.consumerDisplayName || "Sarah App user",
        customerName: conv.consumerDisplayName || "Sarah App user",
        companyName: conv.companyName,
    };

    if (role === MESSAGE_ROLES.USER) {
        entry.authorParticipantId = entry.authorParticipantId || conv.personId;
        const saved = await saveInboundMessage(conv.userId, entry.content, {
            companyId: conv.companyId,
            ...tenantOpts,
            source: "customer",
            externalId: entry.id,
        });
        conv.tenantConversationId = saved.conversationId || conv.tenantConversationId;
    } else if (role === MESSAGE_ROLES.ASSISTANT) {
        entry.authorParticipantId =
            entry.authorParticipantId || conv.companySarahAgentId || `company_sarah:${conv.companyId}`;
        await saveOutboundMessage(conv.userId, entry.content, {
            companyId: conv.companyId,
            ...tenantOpts,
            source: "ai",
            senderName: conv.companyName ? `${conv.companyName} Sarah` : "Company Sarah",
            externalId: entry.id,
        });
    } else if (role === MESSAGE_ROLES.HUMAN) {
        entry.authorParticipantId = entry.authorParticipantId || conv.assignedEmployeeId;
        await saveOutboundMessage(conv.userId, entry.content, {
            companyId: conv.companyId,
            ...tenantOpts,
            source: "human",
            senderName: message.senderName || "Staff",
            externalId: entry.id,
        });
    }

    await mirrorMessageToFirestore(conv, entry);
    await mirrorConversationToFirestore(conv);

    await emitSarahAppIntegrationEvent(buildSarahAppMessageIntegrationEvent(conv, entry));

    return entry;
}

/**
 * Load tenant history into user view when local empty (memory restart recovery).
 */
export async function syncMessagesFromTenant(conv, max = 50) {
    const local = getUserConversationMessages(conv.id);
    if (local.length) return local;
    const history = await getTenantConversationHistory(conv.companyId, conv.userId, CHANNEL, max, {
        externalUserId: conv.userId,
    });
    const mapped = history.map((m) => ({
        id: m.id || randomUUID(),
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content || m.message || "",
        createdAt: m.createdAt || new Date().toISOString(),
    }));
    if (mapped.length) {
        messagesByConversation.set(conv.id, mapped);
        const last = mapped[mapped.length - 1];
        conv.preview = last.content.slice(0, 160);
        conv.lastMessageAt = last.createdAt;
        await mirrorConversationToFirestore(conv);
    }
    return mapped;
}

export function buildCompanySarahGreeting(preferredName, companyName) {
    const name = preferredName || "there";
    return `Hello ${name}, welcome to ${companyName}! I'm ${companyName}'s Sarah. How can I help you today?`;
}

/**
 * Plain-text summary for Personal Sarah (authorized).
 */
export function summarizeConversationForUser(conversationId, maxMessages = 12) {
    const msgs = getUserConversationMessages(conversationId).slice(-maxMessages);
    if (!msgs.length) return "No messages in this conversation yet.";
    return msgs
        .map((m) => `${m.role === "user" ? "You" : "Company Sarah"}: ${m.content}`)
        .join("\n");
}

export function clearUserConversationsForTests() {
    conversations.clear();
    messagesByConversation.clear();
}

/**
 * Snapshot in-memory U5 index for C1 backfill (same-process or JSON file).
 * @returns {{ version: number, exportedAt: string, conversations: object[], messagesByConversationId: Record<string, object[]> }}
 */
export function exportInMemoryUserConversationsSnapshot() {
    const list = [...conversations.values()];
    /** @type {Record<string, object[]>} */
    const messagesByConversationId = {};
    for (const conv of list) {
        messagesByConversationId[conv.id] = [...(messagesByConversation.get(conv.id) || [])];
    }
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        conversations: list.map((c) => ({ ...c })),
        messagesByConversationId,
    };
}
