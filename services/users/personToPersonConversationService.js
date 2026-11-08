/**
 * CH2 — Person-to-person Sarah App conversations (consumer index only; not tenant CRM).
 */
import { randomUUID } from "node:crypto";
import {
    buildPersonToPersonConversationId,
    buildPersonToPersonConversationMeta,
    CONVERSATION_TYPES,
    MESSAGE_ROLES,
    personIdFromUserId,
} from "./identityContracts.js";
import { assertMessagingAllowed } from "./personBlockService.js";
import {
    upsertConversation,
    upsertMessage as upsertFirestoreMessage,
} from "./userConversationFirestoreStore.js";
import { useAdminBackend } from "../database/firestoreClient.js";

/** @type {Map<string, object>} conversationId → record */
const conversations = new Map();
/** @type {Map<string, string[]>} personId → conversation ids */
const indexByPerson = new Map();
/** @type {Map<string, object[]>} */
const messagesByConversation = new Map();

function mirrorEnabled() {
    const raw = String(process.env.USER_CONVERSATIONS_BACKEND || "memory").trim().toLowerCase();
    return (raw === "dual" || raw === "firestore") && useAdminBackend();
}

async function mirrorConversation(conv) {
    if (!mirrorEnabled() || !conv) return;
    try {
        await upsertConversation(conv);
    } catch (err) {
        console.warn("[personToPersonConversationService] Firestore upsert failed:", err.message);
    }
}

async function mirrorMessage(conv, entry) {
    if (!mirrorEnabled() || !conv?.id) return;
    try {
        await upsertFirestoreMessage(conv.id, entry, {
            lastMessageAt: conv.lastMessageAt,
            preview: conv.preview,
        });
    } catch (err) {
        console.warn("[personToPersonConversationService] Firestore message upsert failed:", err.message);
    }
}

function registerForParticipants(conv) {
    for (const p of conv.participants || []) {
        if (p.kind !== "person") continue;
        const list = indexByPerson.get(p.id) || [];
        if (!list.includes(conv.id)) {
            list.push(conv.id);
            indexByPerson.set(p.id, list);
        }
    }
}

/**
 * @param {string} userId
 * @param {string} targetPersonId
 * @param {object} [meta]
 */
export async function openPersonToPersonConversation(userId, targetPersonId, meta = {}) {
    const personId = personIdFromUserId(userId);
    assertMessagingAllowed(personId, targetPersonId);

    const conversationId = buildPersonToPersonConversationId(personId, targetPersonId);
    let conv = conversations.get(conversationId);
    if (!conv) {
        const foundation = buildPersonToPersonConversationMeta(personId, targetPersonId, {
            viewerPersonId: personId,
            displayNames: {
                [personId]: meta.selfDisplayName ?? null,
                [targetPersonId]: meta.peerDisplayName ?? null,
            },
        });
        conv = {
            id: conversationId,
            personId,
            userId,
            peerPersonId: targetPersonId,
            channel: "sarah_app",
            type: CONVERSATION_TYPES.PERSON_TO_PERSON,
            participants: foundation.participants,
            ownershipState: foundation.ownershipState,
            assignedEmployeeId: null,
            companySarahAgentId: null,
            consumerDisplayName: meta.selfDisplayName || "User",
            peerDisplayName: meta.peerDisplayName || targetPersonId,
            lastMessageAt: new Date().toISOString(),
            preview: "",
            createdAt: new Date().toISOString(),
            ...foundation,
        };
        conversations.set(conversationId, conv);
        messagesByConversation.set(conversationId, []);
        registerForParticipants(conv);
        await mirrorConversation(conv);
    }
    return conv;
}

export function listPersonToPersonConversations(userId) {
    const personId = personIdFromUserId(userId);
    const ids = indexByPerson.get(personId) || [];
    return ids
        .map((id) => conversations.get(id))
        .filter((c) => c && c.type === CONVERSATION_TYPES.PERSON_TO_PERSON)
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
}

/**
 * @param {string} userId
 * @param {string} conversationId
 */
export function getPersonToPersonConversation(userId, conversationId) {
    const conv = conversations.get(conversationId);
    if (!conv) {
        throw Object.assign(new Error("Conversation not found."), { status: 404, code: "CONVERSATION_NOT_FOUND" });
    }
    const personId = personIdFromUserId(userId);
    const isMember = conv.participants?.some((p) => p.id === personId && p.kind === "person");
    if (!isMember) {
        throw Object.assign(new Error("Forbidden."), { status: 403, code: "CONVERSATION_FORBIDDEN" });
    }
    return conv;
}

export function getPersonToPersonMessages(conversationId) {
    return messagesByConversation.get(conversationId) || [];
}

/**
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} text
 * @param {object} [options]
 */
export async function sendPersonToPersonMessage(userId, conversationId, text, options = {}) {
    const content = String(text || "").trim();
    if (!content) {
        throw Object.assign(new Error("message is required"), { status: 400, code: "MESSAGE_REQUIRED" });
    }
    const conv = getPersonToPersonConversation(userId, conversationId);
    const personId = personIdFromUserId(userId);
    const peerId = conv.peerPersonId || conv.participants?.find((p) => p.id !== personId && p.kind === "person")?.id;
    if (peerId) assertMessagingAllowed(personId, peerId);

    const entry = {
        id: options.id || randomUUID(),
        role: MESSAGE_ROLES.USER,
        content,
        attachments: normalizeAttachments(options.attachments),
        authorParticipantId: personId,
        createdAt: new Date().toISOString(),
    };
    const list = messagesByConversation.get(conversationId) || [];
    list.push(entry);
    messagesByConversation.set(conversationId, list);
    conv.lastMessageAt = entry.createdAt;
    conv.preview = content.slice(0, 160);
    conversations.set(conversationId, conv);
    await mirrorMessage(conv, entry);
    await mirrorConversation(conv);
    return { conversation: conv, message: entry, messages: list };
}

/**
 * @param {unknown} attachments
 * @returns {object[]}
 */
export function normalizeAttachments(attachments) {
    if (!Array.isArray(attachments)) return [];
    return attachments
        .map((a) => {
            if (!a || typeof a !== "object") return null;
            const mimeType = String(a.mimeType || a.type || "application/octet-stream").slice(0, 120);
            const url = a.url ? String(a.url).slice(0, 2048) : null;
            const name = a.name ? String(a.name).slice(0, 200) : null;
            if (!url && !name) return null;
            return { mimeType, url, name, size: Number(a.size) || null };
        })
        .filter(Boolean)
        .slice(0, 8);
}

/**
 * D1 — invite Personal Sarah into a P2P thread.
 */
export async function invitePersonalSarahToP2p(userId, conversationId, { consentGranted = false } = {}) {
    const conv = getPersonToPersonConversation(userId, conversationId);
    const personId = personIdFromUserId(userId);
    const sarahId = `personal_sarah:${personId}`;
    const existing = conv.participants.find((p) => p.id === sarahId);
    if (existing) {
        existing.invited = true;
        existing.consentGranted = Boolean(consentGranted);
    } else {
        conv.participants.push({
            id: sarahId,
            kind: "personal_sarah",
            displayName: "Personal Sarah",
            invited: true,
            consentGranted: Boolean(consentGranted),
            sarahAgentId: sarahId,
            employeeId: null,
        });
    }
    await mirrorConversation(conv);
    return conv;
}

export function clearPersonToPersonConversationsForTests() {
    conversations.clear();
    indexByPerson.clear();
    messagesByConversation.clear();
}
