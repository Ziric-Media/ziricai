/**
 * CH2 — person-to-person messaging and blocking.
 */
import assert from "node:assert/strict";
import {
    buildPersonToPersonConversationId,
    buildPersonToPersonConversationMeta,
    CONVERSATION_TYPES,
} from "../services/users/messagingContracts.js";
import {
    clearPersonBlocksForTests,
    blockPerson,
    isBlockedBetween,
    unblockPerson,
    listBlocksForPerson,
    hydratePersonBlocks,
    setPersonBlockMirrorForTests,
} from "../services/users/personBlockService.js";
import { flushNetworkWrites } from "../services/network/networkWriteQueue.js";
import {
    clearPersonToPersonConversationsForTests,
    openPersonToPersonConversation,
    sendPersonToPersonMessage,
    listPersonToPersonConversations,
} from "../services/users/personToPersonConversationService.js";

const alice = "alice_uid_ch2";
const bob = "bob_uid_ch2";

assert.equal(buildPersonToPersonConversationId(alice, bob), buildPersonToPersonConversationId(bob, alice));

const meta = buildPersonToPersonConversationMeta(alice, bob, { viewerPersonId: alice });
assert.equal(meta.type, CONVERSATION_TYPES.PERSON_TO_PERSON);
assert.equal(meta.participants.length, 2);

clearPersonBlocksForTests();
clearPersonToPersonConversationsForTests();

const conv = await openPersonToPersonConversation(alice, bob, {
    selfDisplayName: "Alice",
    peerDisplayName: "Bob",
});
assert.ok(conv.id.startsWith("uc_p2p_"));
assert.equal(conv.peerPersonId, bob);

const send = await sendPersonToPersonMessage(alice, conv.id, "Hello Bob");
assert.equal(send.messages.length, 1);
assert.equal(send.message.content, "Hello Bob");

const bobView = listPersonToPersonConversations(bob);
assert.equal(bobView.length, 1);

blockPerson(alice, bob);
assert.ok(isBlockedBetween(alice, bob));

let blocked = false;
try {
    await sendPersonToPersonMessage(alice, conv.id, "blocked");
} catch (err) {
    blocked = err.code === "PERSON_BLOCKED";
}
assert.ok(blocked, "blocked send should fail");

// Gate 6: block lists are durable — a restart (cleared process sets) must not lift a block.
{
    setPersonBlockMirrorForTests(true);
    clearPersonBlocksForTests();
    const carol = "carol_uid_ch2";
    blockPerson(alice, bob);
    blockPerson(carol, alice);
    await flushNetworkWrites();

    // "restart": drop the in-process sets but keep the durable collection
    clearPersonBlocksForTests({ keepDurable: true });
    assert.equal(isBlockedBetween(alice, bob), false, "cache is empty after restart");

    const res = await hydratePersonBlocks(alice, { force: true });
    assert.equal(res.hydrated, 2, "blocks where alice is blocker AND blocked are restored");
    assert.ok(isBlockedBetween(alice, bob));
    assert.ok(isBlockedBetween(alice, carol), "a block placed BY someone else against alice also applies to her");
    assert.deepEqual(listBlocksForPerson(alice), [bob]);
    assert.equal((await hydratePersonBlocks(alice)).skipped, "fresh", "short TTL guards the store");

    // unblock is durable and a stale hydrate never resurrects it
    unblockPerson(alice, bob);
    await hydratePersonBlocks(alice, { force: true });
    assert.equal(isBlockedBetween(alice, bob), false, "locally unblocked pair is not resurrected");
    await flushNetworkWrites();
    clearPersonBlocksForTests({ keepDurable: true });
    await hydratePersonBlocks(alice, { force: true });
    assert.equal(isBlockedBetween(alice, bob), false, "unblock reached the durable store");
    assert.ok(isBlockedBetween(alice, carol));

    // a store failure never throws into the request path
    const failed = await hydratePersonBlocks(bob, {
        force: true,
        store: { listBlocksInvolving: async () => { throw new Error("store down"); } },
    });
    assert.equal(failed.hydrated, 0);
    assert.equal(failed.error, "store down");
    assert.equal((await hydratePersonBlocks(bob, { enabled: false })).skipped, "disabled");
    setPersonBlockMirrorForTests(null);
    clearPersonBlocksForTests();
}

console.log("ch2-person-to-person.test.mjs: ok");
