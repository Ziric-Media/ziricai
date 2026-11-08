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
} from "../services/users/personBlockService.js";
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

console.log("ch2-person-to-person.test.mjs: ok");
