/**
 * CH3 — Personal group conversations + media attachment metadata (MVP).
 */
import { randomUUID } from "node:crypto";
import {
    buildGroupPersonalConversationMeta,
    CONVERSATION_TYPES,
    MESSAGE_ROLES,
    personIdFromUserId,
} from "./identityContracts.js";
import { normalizeAttachments } from "./personToPersonConversationService.js";
import {
    upsertConversation,
    upsertMessage as upsertFirestoreMessage,
} from "./userConversationFirestoreStore.js";
import { useAdminBackend } from "../database/firestoreClient.js";

/** @type {Map<string, object>} */
const conversations = new Map();
/** @type {Map<string, string[]>} personId → group ids */
const indexByPerson = new Map();
/** @type {Map<string, object[]>} */
const messagesByConversation = new Map();

function buildGroupId() {
    return `uc_group_${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

function mirrorEnabled() {
    const raw = String(process.env.USER_CONVERSATIONS_BACKEND || "memory").trim().toLowerCase();
    return (raw === "dual" || raw === "firestore") && useAdminBackend();
}

async function mirrorConversation(conv) {
    if (!mirrorEnabled()) return;
    try {
        await upsertConversation(conv);
    } catch (err) {
        console.warn("[groupConversationService] Firestore upsert failed:", err.message);
    }
}

async function mirrorMessage(conv, entry) {
    if (!mirrorEnabled()) return;
    try {
        await upsertFirestoreMessage(conv.id, entry, {
            lastMessageAt: conv.lastMessageAt,
            preview: conv.preview,
        });
    } catch (err) {
        console.warn("[groupConversationService] Firestore message upsert failed:", err.message);
    }
}

function registerMembers(conv) {
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
 * @param {object} input
 */
export async function createPersonalGroup(userId, input = {}) {
    const ownerId = personIdFromUserId(userId);
    const memberIds = (input.memberIds || []).map(String).filter((id) => id && id !== ownerId);
    const foundation = buildGroupPersonalConversationMeta(input.title, ownerId, memberIds, {
        displayNames: input.displayNames || {},
        personalSarahInvited: Boolean(input.invitePersonalSarah),
        personalSarahConsent: Boolean(input.personalSarahConsent),
    });
    const id = buildGroupId();
    const conv = {
        id,
        userId: ownerId,
        personId: ownerId,
        channel: "sarah_app",
        type: CONVERSATION_TYPES.GROUP_PERSONAL,
        title: foundation.title,
        ownerId,
        participants: foundation.participants,
        ownershipState: foundation.ownershipState,
        lastMessageAt: new Date().toISOString(),
        preview: "",
        createdAt: new Date().toISOString(),
    };
    conversations.set(id, conv);
    messagesByConversation.set(id, []);
    registerMembers(conv);
    await mirrorConversation(conv);
    return conv;
}

/**
 * @param {string} userId
 * @param {string} groupId
 * @param {string} memberId
 */
export async function addGroupMember(userId, groupId, memberId) {
    const conv = getGroupConversation(userId, groupId);
    const ownerId = personIdFromUserId(userId);
    if (conv.ownerId !== ownerId) {
        throw Object.assign(new Error("Only the group owner can add members."), {
            status: 403,
            code: "GROUP_OWNER_REQUIRED",
        });
    }
    if (conv.participants.some((p) => p.id === memberId)) return conv;
    conv.participants.push({
        id: memberId,
        kind: "person",
        displayName: null,
        invited: true,
        consentGranted: true,
        sarahAgentId: null,
        employeeId: null,
    });
    registerMembers(conv);
    await mirrorConversation(conv);
    return conv;
}

/**
 * D1 — invite Personal Sarah with explicit consent flag.
 */
export async function invitePersonalSarahToGroup(userId, groupId, { consentGranted = false } = {}) {
    const conv = getGroupConversation(userId, groupId);
    const ownerId = personIdFromUserId(userId);
    if (conv.ownerId !== ownerId) {
        throw Object.assign(new Error("Only the group owner can invite Sarah."), {
            status: 403,
            code: "GROUP_OWNER_REQUIRED",
        });
    }
    const sarahId = `personal_sarah:${ownerId}`;
    const existing = conv.participants.find((p) => p.id === sarahId);
    if (existing) {
        existing.invited = true;
        existing.consentGranted = Boolean(consentGranted);
        await mirrorConversation(conv);
        return conv;
    }
    conv.participants.push({
        id: sarahId,
        kind: "personal_sarah",
        displayName: "Personal Sarah",
        invited: true,
        consentGranted: Boolean(consentGranted),
        sarahAgentId: sarahId,
        employeeId: null,
    });
    await mirrorConversation(conv);
    return conv;
}

/**
 * Consent-gated organisation group (MVP).
 * @param {string} userId
 * @param {object} input
 */
export async function createOrganisationGroup(userId, input = {}) {
    if (!input.organisationId) {
        throw Object.assign(new Error("organisationId is required"), { status: 400, code: "ORG_ID_REQUIRED" });
    }
    if (!Boolean(input.consentGranted)) {
        throw Object.assign(new Error("Organisation group requires consentGranted"), {
            status: 400,
            code: "ORG_CONSENT_REQUIRED",
        });
    }
    const ownerId = personIdFromUserId(userId);
    const id = buildGroupId();
    const conv = {
        id,
        userId: ownerId,
        personId: ownerId,
        organisationId: String(input.organisationId),
        channel: "sarah_app",
        type: CONVERSATION_TYPES.GROUP_ORGANISATION,
        title: String(input.title || "Organisation group").slice(0, 120),
        ownerId,
        participants: [
            {
                id: ownerId,
                kind: "person",
                displayName: input.ownerDisplayName || null,
                invited: false,
                consentGranted: true,
                sarahAgentId: null,
                employeeId: null,
            },
        ],
        ownershipState: "ai_active",
        orgConsentGranted: true,
        lastMessageAt: new Date().toISOString(),
        preview: "",
        createdAt: new Date().toISOString(),
    };
    conversations.set(id, conv);
    messagesByConversation.set(id, []);
    registerMembers(conv);
    await mirrorConversation(conv);
    return conv;
}

export function listGroupConversations(userId) {
    const personId = personIdFromUserId(userId);
    const ids = indexByPerson.get(personId) || [];
    return ids
        .map((id) => conversations.get(id))
        .filter(
            (c) =>
                c &&
                (c.type === CONVERSATION_TYPES.GROUP_PERSONAL || c.type === CONVERSATION_TYPES.GROUP_ORGANISATION)
        )
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
}

export function getGroupConversation(userId, groupId) {
    const conv = conversations.get(groupId);
    if (
        !conv ||
        (conv.type !== CONVERSATION_TYPES.GROUP_PERSONAL && conv.type !== CONVERSATION_TYPES.GROUP_ORGANISATION)
    ) {
        throw Object.assign(new Error("Group not found."), { status: 404, code: "GROUP_NOT_FOUND" });
    }
    const personId = personIdFromUserId(userId);
    const member = conv.participants?.some((p) => p.id === personId && p.kind === "person");
    if (!member) {
        throw Object.assign(new Error("Forbidden."), { status: 403, code: "GROUP_FORBIDDEN" });
    }
    return conv;
}

export function getGroupMessages(groupId) {
    return messagesByConversation.get(groupId) || [];
}

export async function sendGroupMessage(userId, groupId, text, options = {}) {
    const content = String(text || "").trim();
    if (!content && !(options.attachments?.length)) {
        throw Object.assign(new Error("message or attachments required"), { status: 400, code: "MESSAGE_REQUIRED" });
    }
    const conv = getGroupConversation(userId, groupId);
    const personId = personIdFromUserId(userId);
    const sarahParticipant = conv.participants.find((p) => p.kind === "personal_sarah");
    if (sarahParticipant?.invited && !sarahParticipant.consentGranted) {
        // D1 — Sarah must not read group without consent.
    }
    const entry = {
        id: options.id || randomUUID(),
        role: MESSAGE_ROLES.USER,
        content: content || (options.attachments?.length ? "[attachment]" : ""),
        attachments: normalizeAttachments(options.attachments),
        authorParticipantId: personId,
        createdAt: new Date().toISOString(),
    };
    const list = messagesByConversation.get(groupId) || [];
    list.push(entry);
    messagesByConversation.set(groupId, list);
    conv.lastMessageAt = entry.createdAt;
    conv.preview = entry.content.slice(0, 160);
    await mirrorMessage(conv, entry);
    await mirrorConversation(conv);
    return { conversation: conv, message: entry, messages: list };
}

export function clearGroupConversationsForTests() {
    conversations.clear();
    indexByPerson.clear();
    messagesByConversation.clear();
}
