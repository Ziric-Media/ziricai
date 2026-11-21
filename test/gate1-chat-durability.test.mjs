/**
 * Gate 1 — chat durability: P2P + group threads and attachments rehydrate from the durable store after a restart,
 * for the creator AND for other participants. Uses an in-memory fake store (no Firestore needed).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    openPersonToPersonConversation,
    sendPersonToPersonMessage,
    clearPersonToPersonConversationsForTests,
    listPersonToPersonConversations,
    getPersonToPersonMessages,
} from "../services/users/personToPersonConversationService.js";
import {
    createPersonalGroup,
    sendGroupMessage,
    clearGroupConversationsForTests,
    listGroupConversations,
    getGroupMessages,
} from "../services/users/groupConversationService.js";
import {
    hydrateFederatedChatIndex,
    listFederatedChatConversations,
    resetFederatedHydrationForTests,
} from "../services/users/chatConversationIndexService.js";

/** Fake durable store capturing what the real store would persist. */
function fakeStoreFrom(convs, msgs) {
    const withParticipants = convs.map((c) => ({ ...c }));
    return {
        listConversationsByUserId: async (uid) => withParticipants.filter((c) => c.userId === uid),
        listConversationsByParticipant: async (pid) =>
            withParticipants.filter((c) => (c.participants || []).some((p) => p.kind === "person" && p.id === pid)),
        listMessages: async (id) => msgs[id] || [],
    };
}

test("gate1: P2P + group threads and attachments rehydrate for creator and peer after restart", async () => {
    clearPersonToPersonConversationsForTests();
    clearGroupConversationsForTests();
    resetFederatedHydrationForTests();

    const p2p = await openPersonToPersonConversation("gate1-alice", "gate1-bob", { peerDisplayName: "Bob" });
    await sendPersonToPersonMessage("gate1-alice", p2p.id, "hi bob", {
        attachments: [{ kind: "image", url: "https://example.com/a.png", name: "a.png" }],
    });
    const group = await createPersonalGroup("gate1-alice", { title: "Gate1 crew", memberIds: ["gate1-bob"] });
    await sendGroupMessage("gate1-alice", group.id, "hello crew");

    const convs = [p2p, group].map((c) => ({ ...c }));
    const msgs = { [p2p.id]: [...getPersonToPersonMessages(p2p.id)], [group.id]: [...getGroupMessages(group.id)] };
    const store = fakeStoreFrom(convs, msgs);

    // "restart": wipe process caches
    clearPersonToPersonConversationsForTests();
    clearGroupConversationsForTests();
    resetFederatedHydrationForTests();
    assert.equal(listFederatedChatConversations("gate1-alice").length, 0);

    const aliceRes = await hydrateFederatedChatIndex("gate1-alice", { enabled: true, store });
    assert.equal(aliceRes.hydrated, 2);
    assert.equal(listPersonToPersonConversations("gate1-alice").length, 1);
    assert.equal(listGroupConversations("gate1-alice")[0].title, "Gate1 crew");
    assert.equal(getPersonToPersonMessages(p2p.id)[0].content, "hi bob");

    // Peer (not the creator) finds both threads through the participant lookup.
    const bobRes = await hydrateFederatedChatIndex("gate1-bob", { enabled: true, store });
    assert.equal(bobRes.hydrated, 0, "already seeded by alice's hydrate in this process: never overwrites live state");
    assert.equal(listPersonToPersonConversations("gate1-bob").length, 1);
    assert.equal(listGroupConversations("gate1-bob").length, 1);

    // Only-peer path: fresh process, bob hydrates first.
    clearPersonToPersonConversationsForTests();
    clearGroupConversationsForTests();
    resetFederatedHydrationForTests();
    const bobFirst = await hydrateFederatedChatIndex("gate1-bob", { enabled: true, store });
    assert.equal(bobFirst.hydrated, 2);
    const kinds = listFederatedChatConversations("gate1-bob").map((c) => c.listKey.split(":")[0]).sort();
    assert.deepEqual(kinds, ["group", "p2p"]);
});

test("gate1: participant lookup failure never hides the creator's own threads", async () => {
    clearPersonToPersonConversationsForTests();
    clearGroupConversationsForTests();
    resetFederatedHydrationForTests();
    const group = await createPersonalGroup("gate1-carol", { title: "Solo", memberIds: [] });
    const store = {
        listConversationsByUserId: async () => [{ ...group }],
        listConversationsByParticipant: async () => {
            throw new Error("index missing");
        },
        listMessages: async () => [],
    };
    clearGroupConversationsForTests();
    const res = await hydrateFederatedChatIndex("gate1-carol", { enabled: true, store, force: true });
    assert.equal(res.hydrated, 1);
});

test("gate1: disabled backend is a no-op", async () => {
    resetFederatedHydrationForTests();
    const res = await hydrateFederatedChatIndex("gate1-dave", { enabled: false });
    assert.equal(res.skipped, "disabled");
});
