/**
 * CHAT-01 — Consumer chat UX: preferences, reactions, replies metadata.
 */
import { randomUUID } from "node:crypto";
import { personIdFromUserId } from "./identityContracts.js";
import { listFederatedChatConversations } from "./chatConversationIndexService.js";
import { blockPerson, listBlocksForPerson } from "./personBlockService.js";

/** @type {Map<string, object>} `${personId}:${conversationId}` */
const preferences = new Map();
/** @type {Map<string, Map<string, Set<string>>>} messageId → emoji → personIds */
const reactions = new Map();

function prefKey(personId, conversationId) {
    return `${personId}:${conversationId}`;
}

export function getConversationPreferences(personId, conversationId) {
    return (
        preferences.get(prefKey(personId, conversationId)) || {
            muted: false,
            archived: false,
            reported: false,
            reportedAt: null,
            reportReason: null,
        }
    );
}

export function patchConversationPreferences(personId, conversationId, patch = {}) {
    const key = prefKey(personId, conversationId);
    const current = getConversationPreferences(personId, conversationId);
    const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    if (patch.reported === true) {
        next.reportedAt = new Date().toISOString();
    }
    preferences.set(key, next);
    return next;
}

export function addMessageReaction(messageId, personId, emoji = "👍") {
    const id = String(messageId || "").trim();
    if (!id) throw Object.assign(new Error("messageId required"), { status: 400, code: "MESSAGE_ID_REQUIRED" });
    const e = String(emoji || "👍").slice(0, 8);
    let byEmoji = reactions.get(id);
    if (!byEmoji) {
        byEmoji = new Map();
        reactions.set(id, byEmoji);
    }
    let set = byEmoji.get(e);
    if (!set) {
        set = new Set();
        byEmoji.set(e, set);
    }
    set.add(personId);
    return listReactionsForMessage(id);
}

export function listReactionsForMessage(messageId) {
    const byEmoji = reactions.get(String(messageId || ""));
    if (!byEmoji) return [];
    return [...byEmoji.entries()].map(([emoji, ids]) => ({
        emoji,
        count: ids.size,
        personIds: [...ids],
    }));
}

/**
 * Federated thread search (titles + preview text).
 * @param {string} userId
 * @param {string} query
 */
export function searchChatThreads(userId, query) {
    const q = String(query || "").trim().toLowerCase();
    const all = listFederatedChatConversations(userId, { filter: "all", includeArchived: true });
    if (!q) return { conversations: all.slice(0, 50), query: "" };
    const personId = personIdFromUserId(userId);
    const filtered = all.filter((c) => {
        const prefs = getConversationPreferences(personId, c.id || c.companyId || "");
        if (prefs.archived) return false;
        const hay = [
            c.displayLabel,
            c.companyName,
            c.title,
            c.preview,
            c.companyId,
            c.id,
            c.type,
            c.conversationKind,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    });
    return { conversations: filtered.slice(0, 50), query: q };
}

export function buildReplyMetadata(replyToMessageId) {
    const id = String(replyToMessageId || "").trim();
    if (!id) return null;
    return { replyToMessageId: id, replyId: randomUUID() };
}

export function listBlockedPeersForUser(userId) {
    const personId = personIdFromUserId(userId);
    return listBlocksForPerson(personId);
}

export function blockPeerForUser(userId, targetPersonId) {
    const personId = personIdFromUserId(userId);
    return blockPerson(personId, targetPersonId);
}

export function clearChatUxForTests() {
    preferences.clear();
    reactions.clear();
}
