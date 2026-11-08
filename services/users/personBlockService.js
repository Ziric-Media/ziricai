/**
 * CH2 — Person-to-person blocking (no Network routing across block).
 *
 * Gate 6: blocks are mirrored to a durable collection (`chatPersonBlocks`, Admin SDK only) when
 * USER_CONVERSATIONS_BACKEND is dual|firestore, and rehydrated into the in-process sets after a restart / on another
 * replica via {@link hydratePersonBlocks}. Without this a restart silently lifted every block.
 */

import { isValidPersonId } from "./identityContracts.js";
import { createNetworkCollection } from "../network/networkCollectionStore.js";
import { writeThrough } from "../network/networkWriteQueue.js";
import { useAdminBackend } from "../database/firestoreClient.js";

/** @type {Map<string, Set<string>>} blocker → blocked set */
const blocks = new Map();
/** Pairs unblocked in this process: hydration must not resurrect them while the durable delete is in flight. */
const locallyUnblocked = new Set();
/** @type {Map<string, number>} */
const lastHydratedAt = new Map();
const HYDRATE_TTL_MS = 10_000;

const collection = createNetworkCollection("chatPersonBlocks");
let forceMirror = null;

const pairKey = (blockerId, blockedId) => `${blockerId}__${blockedId}`;

function mirrorEnabled() {
    if (forceMirror !== null) return forceMirror;
    const raw = String(process.env.USER_CONVERSATIONS_BACKEND || "memory").trim().toLowerCase();
    return (raw === "dual" || raw === "firestore") && useAdminBackend();
}

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
    locallyUnblocked.delete(pairKey(blockerId, blockedId));
    if (mirrorEnabled()) {
        writeThrough("personBlock.put", () =>
            collection.put(pairKey(blockerId, blockedId), { blockerId, blockedId, createdAt: new Date().toISOString() })
        );
    }
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
    locallyUnblocked.add(pairKey(blockerId, blockedId));
    if (mirrorEnabled() && isValidPersonId(blockerId) && isValidPersonId(blockedId)) {
        writeThrough("personBlock.remove", () => collection.remove(pairKey(blockerId, blockedId)));
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

/**
 * Load every block involving `personId` (as blocker or blocked) from the durable store into the in-process sets.
 * Additive only (never removes), short per-person TTL, never throws. No-op unless the dual|firestore backend is on.
 * @param {string} personId
 * @param {{ enabled?: boolean, force?: boolean, store?: { listBlocksInvolving: (personId: string) => Promise<Array<{blockerId: string, blockedId: string}>> } }} [deps]
 * @returns {Promise<{ hydrated: number, skipped?: string, error?: string }>}
 */
export async function hydratePersonBlocks(personId, deps = {}) {
    const enabled = deps.enabled ?? mirrorEnabled();
    if (!enabled || !isValidPersonId(personId)) return { hydrated: 0, skipped: "disabled" };
    const last = lastHydratedAt.get(personId);
    if (!deps.force && last && Date.now() - last < HYDRATE_TTL_MS) return { hydrated: 0, skipped: "fresh" };
    try {
        const store = deps.store || {
            async listBlocksInvolving(id) {
                const [asBlocker, asBlocked] = await Promise.all([
                    collection.list({ where: [["blockerId", "==", id]], limit: 500 }),
                    collection.list({ where: [["blockedId", "==", id]], limit: 500 }),
                ]);
                return [...asBlocker, ...asBlocked];
            },
        };
        const rows = await store.listBlocksInvolving(personId);
        lastHydratedAt.set(personId, Date.now());
        let hydrated = 0;
        for (const { blockerId, blockedId } of rows) {
            if (!isValidPersonId(blockerId) || !isValidPersonId(blockedId)) continue;
            if (locallyUnblocked.has(pairKey(blockerId, blockedId))) continue;
            const set = blocks.get(blockerId) || new Set();
            if (set.has(blockedId)) continue;
            set.add(blockedId);
            blocks.set(blockerId, set);
            hydrated += 1;
        }
        return { hydrated };
    } catch (err) {
        console.warn("[personBlockService] hydrate failed:", err?.message || err);
        return { hydrated: 0, error: err?.message || String(err) };
    }
}

/** @param {{ keepDurable?: boolean }} [opts] keepDurable simulates a process restart (durable rows survive). */
export function clearPersonBlocksForTests({ keepDurable = false } = {}) {
    blocks.clear();
    locallyUnblocked.clear();
    lastHydratedAt.clear();
    if (!keepDurable) collection.clearMemory();
}

/** Tests only: force the durable mirror on/off regardless of env (null = follow env). */
export function setPersonBlockMirrorForTests(value) {
    forceMirror = value;
}
