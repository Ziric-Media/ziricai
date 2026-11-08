/**
 * CH4 — Federated consumer Chat index (business, P2P, groups, network threads).
 */
import { listUserConversations } from "./userConversationService.js";
import { listPersonToPersonConversations } from "./personToPersonConversationService.js";
import { listGroupConversations } from "./groupConversationService.js";
import { listNetworkLinkedConversations } from "./sarahNetworkChatLinkService.js";
import { CONVERSATION_TYPES } from "./messagingContracts.js";

/**
 * @param {string} userId
 * @param {object} [options]
 * @param {string} [options.filter] people | businesses | groups | sarahs | all
 */
export function listFederatedChatConversations(userId, options = {}) {
    const filter = String(options.filter || "all").toLowerCase();
    /** @type {object[]} */
    const items = [];

    if (filter === "all" || filter === "businesses" || filter === "business") {
        for (const c of listUserConversations(userId)) {
            items.push({
                ...c,
                listKey: `business:${c.companyId}`,
                displayLabel: c.companyName || c.companyId,
                conversationKind: CONVERSATION_TYPES.PERSON_TO_BUSINESS,
            });
        }
    }

    if (filter === "all" || filter === "people") {
        for (const c of listPersonToPersonConversations(userId)) {
            items.push({
                ...c,
                listKey: `p2p:${c.id}`,
                displayLabel: c.peerDisplayName || c.peerPersonId || "Person",
                conversationKind: CONVERSATION_TYPES.PERSON_TO_PERSON,
            });
        }
    }

    if (filter === "all" || filter === "groups") {
        for (const c of listGroupConversations(userId)) {
            items.push({
                ...c,
                listKey: `group:${c.id}`,
                displayLabel: c.title || "Group",
                conversationKind: CONVERSATION_TYPES.GROUP_PERSONAL,
            });
        }
    }

    if (filter === "all" || filter === "sarahs") {
        for (const c of listNetworkLinkedConversations(userId)) {
            items.push({
                ...c,
                listKey: `network:${c.id}`,
                displayLabel: c.companyName || c.companyId || "Sarah Network",
                conversationKind: CONVERSATION_TYPES.AI_TO_AI,
            });
        }
    }

    return items.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
}
