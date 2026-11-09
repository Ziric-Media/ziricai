/**
 * CH4 — Federated consumer Chat index (business, P2P, groups, network threads).
 */
import { listUserConversations, getUserConversationByCompany, seedUserConversationFromStore } from "./userConversationService.js";
import { listPersonToPersonConversations, seedPersonToPersonFromStore } from "./personToPersonConversationService.js";
import { listGroupConversations, seedGroupFromStore } from "./groupConversationService.js";
import { listNetworkLinkedConversations, seedNetworkConversationFromStore } from "./sarahNetworkChatLinkService.js";
import {
    listConversationsByUserId,
    listConversationsByParticipant,
    listMessages,
    backfillParticipantIndex,
} from "./userConversationFirestoreStore.js";
import { hydratePersonBlocks } from "./personBlockService.js";
import { personIdFromUserId } from "./identityContracts.js";
import { useAdminBackend } from "../database/firestoreClient.js";
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
                conversationKind:
                    c.type === CONVERSATION_TYPES.GROUP_ORGANISATION
                        ? CONVERSATION_TYPES.GROUP_ORGANISATION
                        : CONVERSATION_TYPES.GROUP_PERSONAL,
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

function isPeerOrGroup(conv) {
    return (
        conv?.type === CONVERSATION_TYPES.PERSON_TO_PERSON ||
        conv?.type === CONVERSATION_TYPES.GROUP_PERSONAL ||
        conv?.type === CONVERSATION_TYPES.GROUP_ORGANISATION
    );
}

const HYDRATE_TTL_MS = 30_000;
const HYDRATE_MAX_THREADS = 50;
/** @type {Map<string, number>} */
const lastHydratedAt = new Map();

function hydrationEnabled() {
    const raw = String(process.env.USER_CONVERSATIONS_BACKEND || "memory").trim().toLowerCase();
    return (raw === "dual" || raw === "firestore") && useAdminBackend();
}

/**
 * SNET-08 — rebuild this user's business + network threads from the durable store after a restart / on another
 * replica (the services are process caches over `userConversations`). Never overwrites live in-process state.
 * Only runs when USER_CONVERSATIONS_BACKEND is dual|firestore and Firebase Admin is available; otherwise a no-op.
 *
 * Scope: person_to_business, ai_to_ai, person_to_person and group threads (Gate 1). Threads are found by creator
 * (`userId`) and by participant (`participantPersonIds`); P2P/group threads written before Gate 1 are only found by
 * creator until the creator's hydrate backfills their participant index (Gate 6). Block lists are rehydrated too.
 * @param {string} userId
 * @param {{ enabled?: boolean, force?: boolean, store?: { listConversationsByUserId: Function, listConversationsByParticipant?: Function, listMessages: Function } }} [deps] test seams
 * @returns {Promise<{ hydrated: number, skipped?: string, error?: string }>}
 */
export async function hydrateFederatedChatIndex(userId, deps = {}) {
    const enabled = deps.enabled ?? hydrationEnabled();
    if (!enabled || !userId) return { hydrated: 0, skipped: "disabled" };
    // Gate 6: block lists first (own short TTL) so a restart never lifts a block before the thread is usable.
    await hydratePersonBlocks(personIdFromUserId(userId), { enabled: true, force: deps.force, store: deps.blockStore });
    const last = lastHydratedAt.get(userId);
    if (!deps.force && last && Date.now() - last < HYDRATE_TTL_MS) return { hydrated: 0, skipped: "fresh" };

    const store = deps.store || {
        listConversationsByUserId,
        listConversationsByParticipant,
        listMessages,
        backfillParticipantIndex,
    };
    let stored;
    try {
        stored = await store.listConversationsByUserId(userId);
        if (typeof store.listConversationsByParticipant === "function") {
            // Participant lookup is additive: a failure must not hide the creator's own threads.
            const asParticipant = await store.listConversationsByParticipant(userId).catch((err) => {
                console.warn("[chatConversationIndex] participant lookup failed:", err.message);
                return [];
            });
            const seen = new Set(stored.map((c) => c.id));
            stored = [...stored, ...asParticipant.filter((c) => !seen.has(c.id))].sort((a, b) =>
                String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))
            );
        }
    } catch (err) {
        console.warn("[chatConversationIndex] hydrate failed:", err.message);
        return { hydrated: 0, error: err.message };
    }
    lastHydratedAt.set(userId, Date.now());

    const knownNetwork = new Set(listNetworkLinkedConversations(userId).map((c) => c.id));
    let hydrated = 0;
    for (const storedConv of stored.slice(0, HYDRATE_MAX_THREADS)) {
        // `participantIndexed` is store metadata, not part of the thread: keep it out of the process caches / API payloads.
        const { participantIndexed, ...conv } = storedConv;
        try {
            // Gate 6: P2P/group threads written before Gate 1 have no participant index, so peers could not find them.
            // The creator's hydrate repairs it (best effort, once per thread) so the other members see the thread too.
            if (isPeerOrGroup(conv) && participantIndexed === false && typeof store.backfillParticipantIndex === "function") {
                await store.backfillParticipantIndex(conv).catch((err) => {
                    console.warn("[chatConversationIndex] participant backfill failed:", err.message);
                });
            }
            if (conv.type === CONVERSATION_TYPES.AI_TO_AI) {
                if (knownNetwork.has(conv.id)) continue;
                // Threads written before SNET-08 lack `networkRequestId`; it is the suffix of the id.
                const withLink = conv.networkRequestId
                    ? conv
                    : { ...conv, networkRequestId: conv.id.includes("_net_") ? conv.id.split("_net_").pop() : null };
                if (!withLink.networkRequestId) continue;
                const messages = await store.listMessages(conv.id);
                if (seedNetworkConversationFromStore(withLink, messages)) hydrated += 1;
            } else if (conv.type === CONVERSATION_TYPES.PERSON_TO_PERSON) {
                if (listPersonToPersonConversations(userId).some((c) => c.id === conv.id)) continue;
                if (seedPersonToPersonFromStore(conv, await store.listMessages(conv.id))) hydrated += 1;
            } else if (
                conv.type === CONVERSATION_TYPES.GROUP_PERSONAL ||
                conv.type === CONVERSATION_TYPES.GROUP_ORGANISATION
            ) {
                if (listGroupConversations(userId).some((c) => c.id === conv.id)) continue;
                if (seedGroupFromStore(conv, await store.listMessages(conv.id))) hydrated += 1;
            } else if (conv.type === CONVERSATION_TYPES.PERSON_TO_BUSINESS || !conv.type) {
                if (getUserConversationByCompany(userId, conv.companyId)) continue;
                const messages = await store.listMessages(conv.id);
                if (seedUserConversationFromStore(conv, messages)) hydrated += 1;
            }
        } catch (err) {
            console.warn("[chatConversationIndex] hydrate thread failed:", err.message);
        }
    }
    return { hydrated };
}

/** Async index: hydrate from the durable store first (no-op in memory mode), then list. */
export async function listFederatedChatConversationsAsync(userId, options = {}, deps = {}) {
    await hydrateFederatedChatIndex(userId, deps);
    return listFederatedChatConversations(userId, options);
}

export function resetFederatedHydrationForTests() {
    lastHydratedAt.clear();
}