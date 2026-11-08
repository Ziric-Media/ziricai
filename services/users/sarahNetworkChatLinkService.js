/**
 * CH5 — Link Sarah Network enquiries to consumer Chat threads (ai_to_ai).
 */
import { randomUUID } from "node:crypto";
import {
    buildAiToAiConversationMeta,
    buildConsumerConversationId,
    CONVERSATION_TYPES,
    MESSAGE_ROLES,
    personIdFromUserId,
} from "./identityContracts.js";
import { getBusinessDirectoryEntry } from "./businessDirectoryService.js";
import { upsertConversation, upsertMessage } from "./userConversationFirestoreStore.js";
import { useAdminBackend } from "../database/firestoreClient.js";

/** @type {Map<string, object>} */
const conversations = new Map();
/** @type {Map<string, string>} networkRequestId → conversationId */
const requestIndex = new Map();
/** @type {Map<string, object[]>} */
const messagesByConversation = new Map();
/** @type {Map<string, string[]>} */
const indexByPerson = new Map();

function mirrorEnabled() {
    const raw = String(process.env.USER_CONVERSATIONS_BACKEND || "memory").trim().toLowerCase();
    return (raw === "dual" || raw === "firestore") && useAdminBackend();
}

async function persist(conv, entry) {
    if (!mirrorEnabled()) return;
    try {
        await upsertConversation(conv);
        if (entry) await upsertMessage(conv.id, entry, { lastMessageAt: conv.lastMessageAt, preview: conv.preview });
    } catch (err) {
        console.warn("[sarahNetworkChatLinkService] Firestore mirror failed:", err.message);
    }
}

/**
 * Create or return Chat thread for a completed network request.
 * @param {object} requestDoc
 */
export async function ensureNetworkChatThread(requestDoc) {
    const uid = requestDoc?.source?.userId;
    const companyId = requestDoc?.destination?.companyId;
    const requestId = requestDoc?.requestId;
    if (!uid || !companyId || !requestId) return null;

    const existingId = requestIndex.get(requestId);
    if (existingId) return conversations.get(existingId);

    const personId = personIdFromUserId(uid);
    const entry = getBusinessDirectoryEntry(companyId);
    const foundation = buildAiToAiConversationMeta(personId, companyId, requestId, {
        companyDisplayName: entry?.displayName || companyId,
        personDisplayName: requestDoc.payload?.consumerDisplayName || null,
    });

    const id = `${buildConsumerConversationId(personId, companyId)}_net_${requestId}`.slice(0, 180);
    const conv = {
        id,
        userId: uid,
        personId,
        companyId,
        companyName: entry?.displayName || companyId,
        networkRequestId: requestId,
        channel: "sarah_app",
        type: CONVERSATION_TYPES.AI_TO_AI,
        participants: foundation.participants,
        ownershipState: foundation.ownershipState,
        lastMessageAt: new Date().toISOString(),
        preview: "",
        createdAt: new Date().toISOString(),
    };
    conversations.set(id, conv);
    requestIndex.set(requestId, id);
    const list = indexByPerson.get(personId) || [];
    list.push(id);
    indexByPerson.set(personId, list);

    const enquiry = String(requestDoc.payload?.naturalLanguage || "").trim();
    const responseText = String(requestDoc.response?.reply || requestDoc.response?.summary || "").trim();
    const msgs = [];
    if (enquiry) {
        msgs.push({
            id: randomUUID(),
            role: MESSAGE_ROLES.USER,
            content: enquiry,
            source: "ai_to_ai",
            authorParticipantId: `personal_sarah:${personId}`,
            createdAt: new Date().toISOString(),
        });
    }
    if (responseText) {
        msgs.push({
            id: randomUUID(),
            role: MESSAGE_ROLES.ASSISTANT,
            content: responseText,
            source: "ai_to_ai",
            authorParticipantId: foundation.companySarahAgentId,
            createdAt: new Date().toISOString(),
        });
    }
    messagesByConversation.set(id, msgs);
    if (msgs.length) {
        const last = msgs[msgs.length - 1];
        conv.lastMessageAt = last.createdAt;
        conv.preview = last.content.slice(0, 160);
    }
    await persist(conv, msgs[msgs.length - 1]);
    return conv;
}

export function listNetworkLinkedConversations(userId) {
    const personId = personIdFromUserId(userId);
    const ids = indexByPerson.get(personId) || [];
    return ids
        .map((id) => conversations.get(id))
        .filter((c) => c && c.type === CONVERSATION_TYPES.AI_TO_AI)
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
}

export function getNetworkChatMessages(conversationId) {
    return messagesByConversation.get(conversationId) || [];
}

export function clearNetworkChatLinksForTests() {
    conversations.clear();
    requestIndex.clear();
    messagesByConversation.clear();
    indexByPerson.clear();
}
