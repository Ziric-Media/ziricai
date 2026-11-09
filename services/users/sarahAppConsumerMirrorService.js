/**
 * CH7 — Mirror portal sarah_app human replies into consumer userConversations.
 */
import {
    getUserConversationByCompany,
    appendUserConversationMessage,
    openUserConversation,
} from "./userConversationService.js";
import { MESSAGE_ROLES } from "./identityContracts.js";
import { resolveSarahAppUidFromRef } from "../conversation/tenantConversationRef.js";
import { transitionOwnershipState } from "./handoverStateService.js";
import { HANDOVER_STATES } from "./messagingContracts.js";

/**
 * @param {string} companyId
 * @param {string} conversationId
 * @param {string} text
 * @param {object} [options]
 */
export async function mirrorSarahAppHumanReplyToConsumer(companyId, conversationId, text, options = {}) {
    const uid = resolveSarahAppUidFromRef(conversationId);
    if (!uid) return { mirrored: false, reason: "not_sarah_app" };
    await openUserConversation(uid, companyId, {});
    const conv = getUserConversationByCompany(uid, companyId);
    if (!conv) return { mirrored: false, reason: "no_consumer_conv" };
    if (conv.ownershipState !== HANDOVER_STATES.HUMAN_ACTIVE) {
        await transitionOwnershipState(conv, HANDOVER_STATES.HUMAN_ACTIVE);
    }
    await appendUserConversationMessage(conv, {
        role: MESSAGE_ROLES.HUMAN,
        content: String(text || ""),
        senderName: options.senderName || "Staff",
        authorParticipantId: conv.assignedEmployeeId,
    });
    return { mirrored: true, conversationId: conv.id };
}
