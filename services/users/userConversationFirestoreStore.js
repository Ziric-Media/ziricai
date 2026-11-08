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
import { ensureConversationMessagingFoundation } from "./messagingContracts.js";

/**
 * @param {object} raw
 * @param {string} docId
 * @returns {import("./identityContracts.js").UserConversationMetadata|null}
 */
function normalizeConversation(docId, raw) {
    if (!raw || typeof raw !== "object") return null;
    const base = {
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
        schemaVersion: raw.schemaVersion,
        type: raw.type,
        participants: raw.participants,
        ownershipState: raw.ownershipState,
        assignedEmployeeId: raw.assignedEmployeeId ?? null,
        companySarahAgentId: raw.companySarahAgentId ?? null,
    };
    // SNET-08: network-linked (ai_to_ai) threads carry their request link so the index can rebuild after a restart.
    if (raw.networkRequestId) base.networkRequestId = raw.networkRequestId;
    if (raw.networkConsentScope) base.networkConsentScope = raw.networkConsentScope;
    // Gate 1: P2P / group threads carry their own display fields; keep them so the index can rebuild after a restart.
    for (const key of ["peerPersonId", "peerDisplayName", "title", "ownerId", "organisationId"]) {
        if (raw[key]) base[key] = raw[key];
    }
    if (raw.orgConsentGranted) base.orgConsentGranted = true;
    // Gate 6: false = a P2P/group thread written before the participant index existed (see backfillParticipantIndex).
    base.participantIndexed = Array.isArray(raw.participantPersonIds);
    return ensureConversationMessagingFoundation(base);
}

/** Person ids of a thread's person participants (the `array-contains` index). */
function personParticipantIds(conv) {
    return (conv?.participants || []).filter((p) => p?.kind === "person" && p.id).map((p) => String(p.id));
}

/**
 * Gate 6: repair a legacy P2P/group thread so non-creator members can find it (writes only the index field).
 * @param {{ id: string, participants?: object[] }} conv
 */
export async function backfillParticipantIndex(conv) {
    if (!firestoreUserConversationStoreEnabled() || !conv?.id) return;
    const ids = personParticipantIds(conv);
    if (!ids.length) return;
    await setDoc(userConversationRef(conv.id), { participantPersonIds: ids }, { merge: true });
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
        authorParticipantId: raw.authorParticipantId ?? null,
        attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
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
    const enriched = ensureConversationMessagingFoundation(conv);
    const payload = {
        id: enriched.id,
        personId: enriched.personId || enriched.userId,
        userId: enriched.userId,
        companyId: enriched.companyId,
        companyName: enriched.companyName || null,
        channel: enriched.channel || "sarah_app",
        tenantConversationId: enriched.tenantConversationId ?? null,
        tenantCustomerId: enriched.tenantCustomerId ?? null,
        lastMessageAt: enriched.lastMessageAt,
        preview: enriched.preview || "",
        createdAt: enriched.createdAt || enriched.lastMessageAt,
        consumerDisplayName: enriched.consumerDisplayName || null,
        schemaVersion: enriched.schemaVersion,
        type: enriched.type,
        participants: enriched.participants,
        ownershipState: enriched.ownershipState,
        assignedEmployeeId: enriched.assignedEmployeeId ?? null,
        companySarahAgentId: enriched.companySarahAgentId ?? null,
        networkRequestId: enriched.networkRequestId ?? null,
        networkConsentScope: enriched.networkConsentScope ?? null,
        peerPersonId: enriched.peerPersonId ?? null,
        peerDisplayName: enriched.peerDisplayName ?? null,
        title: enriched.title ?? null,
        ownerId: enriched.ownerId ?? null,
        organisationId: enriched.organisationId ?? null,
        orgConsentGranted: enriched.orgConsentGranted ?? null,
        // Lets non-creator members (P2P peer, group members) find the thread with a single array-contains query.
        participantPersonIds: personParticipantIds(enriched),
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
 * Gate 1: threads where `personId` is a person participant (P2P peers, group members), regardless of who created it.
 * Threads written before this field existed are only found via {@link listConversationsByUserId} (creator).
 * Single-field array-contains: no composite index needed; sorted in memory.
 * @param {string} personId
 */
export async function listConversationsByParticipant(personId) {
    if (!firestoreUserConversationStoreEnabled() || !personId) return [];
    const col = userConversationsCollectionRef();
    const q = query(col, queryWhere("participantPersonIds", "array-contains", personId));
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
        authorParticipantId: message.authorParticipantId ?? null,
        // Gate 1: attachment metadata (media refs) must survive a restart; it was previously dropped on write.
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
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
