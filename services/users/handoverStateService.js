/**
 * CH6 — Consumer ownershipState ↔ portal humanTakeover mapping.
 */
import { HANDOVER_STATES } from "./messagingContracts.js";
import { getUserConversationByCompany, appendUserConversationMessage } from "./userConversationService.js";
import { MESSAGE_ROLES } from "./identityContracts.js";
import { getConversationTakeoverState } from "../conversation/takeoverSafety.js";

const HUMAN_OWNERSHIP = new Set([
    HANDOVER_STATES.HUMAN_REQUESTED,
    HANDOVER_STATES.AWAITING_ASSIGNMENT,
    HANDOVER_STATES.HUMAN_ASSIGNED,
    HANDOVER_STATES.HUMAN_ACTIVE,
]);

/** @param {boolean} humanTakeover */
export function ownershipStateFromTakeover(humanTakeover, previous = HANDOVER_STATES.AI_ACTIVE) {
    if (humanTakeover) {
        if (previous === HANDOVER_STATES.HUMAN_REQUESTED) return HANDOVER_STATES.HUMAN_ACTIVE;
        return HANDOVER_STATES.HUMAN_ACTIVE;
    }
    if (previous === HANDOVER_STATES.HUMAN_ACTIVE || previous === HANDOVER_STATES.AI_RESUME_PENDING) {
        return HANDOVER_STATES.AI_ACTIVE_AGAIN;
    }
    return HANDOVER_STATES.AI_ACTIVE;
}

export function isHumanControlledOwnership(state) {
    return HUMAN_OWNERSHIP.has(String(state || ""));
}

/**
 * @param {string} uid
 * @param {string} companyId
 */
export async function syncOwnershipFromTenant(uid, companyId) {
    const takeover = await getConversationTakeoverState(companyId, uid, "sarah_app");
    const conv = getUserConversationByCompany(uid, companyId);
    if (!conv) return null;
    const next = ownershipStateFromTakeover(Boolean(takeover?.humanTakeover), conv.ownershipState);
    if (conv.ownershipState !== next) {
        conv.ownershipState = next;
    }
    return conv;
}

/**
 * @param {object} conv
 * @param {string} nextState
 * @param {string} [reason]
 */
export async function transitionOwnershipState(conv, nextState, reason = "") {
    const prev = conv.ownershipState;
    conv.ownershipState = nextState;
    const label = handoverSystemLabel(nextState, reason);
    if (label) {
        await appendUserConversationMessage(conv, {
            role: MESSAGE_ROLES.SYSTEM,
            content: label,
            source: "handover",
            authorParticipantId: "system",
        });
    }
    return { previous: prev, next: nextState, conversation: conv };
}

export function handoverSystemLabel(state, reason = "") {
    const map = {
        [HANDOVER_STATES.HUMAN_REQUESTED]: "You requested a human team member. We'll connect you shortly.",
        [HANDOVER_STATES.HUMAN_ACTIVE]: "A team member is now handling this chat.",
        [HANDOVER_STATES.AI_ACTIVE_AGAIN]: "Company Sarah is assisting you again.",
        [HANDOVER_STATES.RESOLVED]: "This conversation has been marked resolved.",
    };
    const base = map[state];
    if (!base) return reason ? String(reason) : null;
    return reason ? `${base} (${reason})` : base;
}

const HUMAN_INTENT_RE = /\b(human|person|agent|staff|representative|call me)\b/i;

export function detectHumanHandoverIntent(text) {
    return HUMAN_INTENT_RE.test(String(text || ""));
}

/**
 * @param {string} uid
 * @param {string} companyId
 */
export async function requestHumanHandover(uid, companyId) {
    let conv = getUserConversationByCompany(uid, companyId);
    if (!conv) {
        const { openUserConversation } = await import("./userConversationService.js");
        conv = await openUserConversation(uid, companyId, {});
    }
    return transitionOwnershipState(conv, HANDOVER_STATES.HUMAN_REQUESTED);
}
