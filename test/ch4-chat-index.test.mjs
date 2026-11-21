import assert from "node:assert/strict";
import { clearUserConversationsForTests, openUserConversation } from "../services/users/userConversationService.js";
import {
    listFederatedChatConversations,
    hydrateFederatedChatIndex,
    resetFederatedHydrationForTests,
} from "../services/users/chatConversationIndexService.js";
import {
    openPersonToPersonConversation,
    clearPersonToPersonConversationsForTests,
    listPersonToPersonConversations,
} from "../services/users/personToPersonConversationService.js";
import {
    createPersonalGroup,
    clearGroupConversationsForTests,
    listGroupConversations,
} from "../services/users/groupConversationService.js";

clearUserConversationsForTests();
await openUserConversation("u4", "smilemore-demo", { companyName: "SmileMore" });
const all = listFederatedChatConversations("u4");
assert.ok(all.some((c) => c.companyId === "smilemore-demo"));
const businesses = listFederatedChatConversations("u4", { filter: "businesses" });
assert.equal(businesses.length, 1);
// Gate 6: legacy P2P/group threads (written before the participant index) are repaired by the creator's hydrate,
// so the other members can find them afterwards. Thread payloads never carry the store-only `participantIndexed` flag.
{
    clearPersonToPersonConversationsForTests();
    clearGroupConversationsForTests();
    resetFederatedHydrationForTests();
    const p2p = await openPersonToPersonConversation("ch4-alice", "ch4-bob", { peerDisplayName: "Bob" });
    const group = await createPersonalGroup("ch4-alice", { title: "Legacy crew", memberIds: ["ch4-bob"] });

    /** Durable rows as Firestore holds them: index field only present once backfilled. */
    const rows = new Map([p2p, group].map((c) => [c.id, { ...c, participantIndexed: false }]));
    const backfilled = [];
    const store = {
        listConversationsByUserId: async (uid) => [...rows.values()].filter((c) => c.userId === uid).map((c) => ({ ...c })),
        listConversationsByParticipant: async (pid) =>
            [...rows.values()]
                .filter((c) => c.participantIndexed && c.participants.some((p) => p.kind === "person" && p.id === pid))
                .map((c) => ({ ...c })),
        listMessages: async () => [],
        backfillParticipantIndex: async (conv) => {
            backfilled.push(conv.id);
            rows.get(conv.id).participantIndexed = true;
        },
    };
    const restart = () => {
        clearPersonToPersonConversationsForTests();
        clearGroupConversationsForTests();
        resetFederatedHydrationForTests();
    };

    restart();
    assert.equal((await hydrateFederatedChatIndex("ch4-bob", { enabled: true, store })).hydrated, 0, "legacy threads are invisible to the peer");

    restart();
    const alice = await hydrateFederatedChatIndex("ch4-alice", { enabled: true, store });
    assert.equal(alice.hydrated, 2);
    assert.deepEqual(backfilled.sort(), [group.id, p2p.id].sort(), "creator hydrate repairs both threads");
    assert.ok(!("participantIndexed" in listPersonToPersonConversations("ch4-alice")[0]), "store flag does not leak into the cache");
    assert.ok(!("participantIndexed" in listGroupConversations("ch4-alice")[0]));

    restart();
    const bob = await hydrateFederatedChatIndex("ch4-bob", { enabled: true, store });
    assert.equal(bob.hydrated, 2, "after the backfill the peer finds both threads");
    assert.equal(listPersonToPersonConversations("ch4-bob").length, 1);
    assert.equal(listGroupConversations("ch4-bob")[0].title, "Legacy crew");

    // a failing backfill never blocks hydration
    rows.forEach((c) => (c.participantIndexed = false));
    store.backfillParticipantIndex = async () => {
        throw new Error("write denied");
    };
    restart();
    assert.equal((await hydrateFederatedChatIndex("ch4-alice", { enabled: true, store })).hydrated, 2);

    // backend off: index never touches the store
    restart();
    assert.equal((await hydrateFederatedChatIndex("ch4-alice", { enabled: false })).skipped, "disabled");
    clearPersonToPersonConversationsForTests();
    clearGroupConversationsForTests();
}

console.log("ch4-chat-index.test.mjs: ok");
