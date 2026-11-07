/**
 * C1 — Firestore persistence for userConversations/{conversationId} + messages/.
 */
import {
    userConversationRef,
    userConversationMessageRef,
    userConversationsCollectionRef,
    userConversationMessagesCollectionRef,
    getDoc,
    setDoc,
    getDocs,
    query,
    queryWhere,
    queryOrderBy,
    useAdminBackend,
} from "../database/firestoreClient.js";

/**
 * @param {object} raw
 * @param {string} docId
 * @returns {import("./identityContracts.js").UserConversationMetadata|null}
 */
function normalizeConversation(docId, raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
        id: docId,
        personId: raw.personId || raw.userId,
        userId: raw.userId,
        companyId: raw.companyId,
        companyName: raw.companyName,
        channel: raw.channel || "sarah_app",
        tenantConversationId: raw.tenantConversationId ?? null,
        tenantCustomerId: raw.tenantCustomerId ?? null,
        lastMessageAt: raw.lastMessageAt || raw.createdAt || new Date().toISOString(),
        preview: raw.preview || "",
        createdAt: raw.createdAt || new Date().toISOString(),
        consumerDisplayName: raw.consumerDisplayName,
    };
}

/**
 * @param {string} docId
 * @param {object} raw
 */
function normalizeMessage(docId, raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
        id: docId,
        conversationId: raw.conversationId,
        role: raw.role,
        content: String(raw.content || ""),
        source: raw.source ?? null,
        createdAt: raw.createdAt || new Date().toISOString(),
        tenantMessageId: raw.tenantMessageId ?? null,
    };
}

export function firestoreUserConversationStoreEnabled() {
    return useAdminBackend();
}

/**
 * @param {import("./identityContracts.js").UserConversationMetadata & { companyName?: string, consumerDisplayName?: string }} conv
 */
export async function upsertConversation(conv) {
    if (!firestoreUserConversationStoreEnabled() || !conv?.id) return;
    const payload = {
        id: conv.id,
        personId: conv.personId || conv.userId,
        userId: conv.userId,
        companyId: conv.companyId,
        companyName: conv.companyName || null,
        channel: conv.channel || "sarah_app",
        tenantConversationId: conv.tenantConversationId ?? null,
        tenantCustomerId: conv.tenantCustomerId ?? null,
        lastMessageAt: conv.lastMessageAt,
        preview: conv.preview || "",
        createdAt: conv.createdAt || conv.lastMessageAt,
        consumerDisplayName: conv.consumerDisplayName || null,
    };
    await setDoc(userConversationRef(conv.id), payload, { merge: true });
}

/**
 * @param {string} conversationId
 */
export async function getConversationById(conversationId) {
    if (!firestoreUserConversationStoreEnabled() || !conversationId) return null;
    const snap = await getDoc(userConversationRef(conversationId));
    if (!snap.exists()) return null;
    return normalizeConversation(conversationId, snap.data());
}

/**
 * @param {string} personId
 * @param {string} companyId
 */
export async function getConversationByPersonAndCompany(personId, companyId) {
    if (!firestoreUserConversationStoreEnabled() || !personId || !companyId) return null;
    const col = userConversationsCollectionRef();
    const q = query(col, queryWhere("personId", "==", personId), queryWhere("companyId", "==", companyId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return normalizeConversation(docSnap.id, docSnap.data());
}

/**
 * @param {string} userId
 */
export async function listConversationsByUserId(userId) {
    if (!firestoreUserConversationStoreEnabled() || !userId) return [];
    const col = userConversationsCollectionRef();
    const q = query(col, queryWhere("userId", "==", userId), queryOrderBy("lastMessageAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => normalizeConversation(d.id, d.data()))
        .filter(Boolean)
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
}

/**
 * @param {string} conversationId
 * @param {object} message
 * @param {object} [conversationPatch]
 */
export async function upsertMessage(conversationId, message, conversationPatch = {}) {
    if (!firestoreUserConversationStoreEnabled() || !conversationId || !message?.id) return;
    const msgPayload = {
        id: message.id,
        conversationId,
        role: message.role,
        content: String(message.content || ""),
        source: message.source ?? null,
        createdAt: message.createdAt || new Date().toISOString(),
        tenantMessageId: message.tenantMessageId ?? null,
    };
    await setDoc(userConversationMessageRef(conversationId, message.id), msgPayload, { merge: true });

    if (Object.keys(conversationPatch).length) {
        await setDoc(userConversationRef(conversationId), conversationPatch, { merge: true });
    }
}

/**
 * @param {string} conversationId
 */
export async function listMessages(conversationId) {
    if (!firestoreUserConversationStoreEnabled() || !conversationId) return [];
    const col = userConversationMessagesCollectionRef(conversationId);
    const q = query(col, queryOrderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeMessage(d.id, d.data())).filter(Boolean);
}
