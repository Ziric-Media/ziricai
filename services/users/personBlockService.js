/**
 * CH2 — Person-to-person blocking (no Network routing across block).
 */

import { isValidPersonId } from "./identityContracts.js";

/** @type {Map<string, Set<string>>} blocker → blocked set */
const blocks = new Map();

/**
 * @param {string} blockerId
 * @param {string} blockedId
 */
export function blockPerson(blockerId, blockedId) {
    if (!isValidPersonId(blockerId) || !isValidPersonId(blockedId)) {
        throw Object.assign(new Error("Valid person ids required."), { status: 400, code: "INVALID_PERSON_ID" });
    }
    if (blockerId === blockedId) {
        throw Object.assign(new Error("Cannot block yourself."), { status: 400, code: "SELF_BLOCK" });
    }
    const set = blocks.get(blockerId) || new Set();
    set.add(blockedId);
    blocks.set(blockerId, set);
    return { blockerId, blockedId, blocked: true };
}

/**
 * @param {string} blockerId
 * @param {string} blockedId
 */
export function unblockPerson(blockerId, blockedId) {
    const set = blocks.get(blockerId);
    if (set) {
        set.delete(blockedId);
        if (!set.size) blocks.delete(blockerId);
    }
    return { blockerId, blockedId, blocked: false };
}

/**
 * @param {string} personA
 * @param {string} personB
 */
export function isBlockedBetween(personA, personB) {
    const aBlocksB = blocks.get(personA)?.has(personB);
    const bBlocksA = blocks.get(personB)?.has(personA);
    return Boolean(aBlocksB || bBlocksA);
}

/**
 * @param {string} senderId
 * @param {string} recipientId
 */
export function assertMessagingAllowed(senderId, recipientId) {
    if (isBlockedBetween(senderId, recipientId)) {
        throw Object.assign(new Error("Messaging is blocked between these users."), {
            status: 403,
            code: "PERSON_BLOCKED",
        });
    }
}

export function listBlocksForPerson(personId) {
    return [...(blocks.get(personId) || [])];
}

export function clearPersonBlocksForTests() {
    blocks.clear();
}
