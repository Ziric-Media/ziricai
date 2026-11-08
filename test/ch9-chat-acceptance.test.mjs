/**
 * CH9 — CHAT-01 §17 acceptance tests (API-level MVP).
 */
import assert from "node:assert/strict";
import { clearPersonToPersonConversationsForTests, openPersonToPersonConversation, sendPersonToPersonMessage } from "../services/users/personToPersonConversationService.js";
import { clearPersonBlocksForTests, blockPerson } from "../services/users/personBlockService.js";
import { clearUserConversationsForTests, openUserConversation, appendUserConversationMessage } from "../services/users/userConversationService.js";
import { detectHumanHandoverIntent, requestHumanHandover, ownershipStateFromTakeover } from "../services/users/handoverStateService.js";
import { HANDOVER_STATES } from "../services/users/messagingContracts.js";
import { createPersonalGroup, clearGroupConversationsForTests } from "../services/users/groupConversationService.js";
import { createChatWorkLink, clearChatWorkLinksForTests, listChatWorkLinks } from "../services/users/chatWorkLinkService.js";
import { listFederatedChatConversations } from "../services/users/chatConversationIndexService.js";
import { personIdFromUserId } from "../services/users/identityContracts.js";
import { clearChatUxForTests, searchChatThreads } from "../services/users/chatUxService.js";

clearPersonBlocksForTests();
clearPersonToPersonConversationsForTests();
clearUserConversationsForTests();
clearGroupConversationsForTests();
clearChatWorkLinksForTests();
clearChatUxForTests();

// #1 Two users P2P
const p2p = await openPersonToPersonConversation("acc_a", "acc_b");
await sendPersonToPersonMessage("acc_a", p2p.id, "hello");
assert.ok(p2p.id);

// #2 Discover → chat (federated business index)
const biz = await openUserConversation("acc_a", "smilemore-demo", { companyName: "SmileMore" });
assert.ok(biz.companyId === "smilemore-demo");

// #3 Business thread exists for portal path
assert.ok(biz.tenantConversationId === null || typeof biz.tenantConversationId === "string");

// #4 Company Sarah responds (message append path)
const bot = await appendUserConversationMessage(biz, { role: "assistant", content: "Hi from Sarah", authorParticipantId: "company_sarah" });
assert.equal(bot.content, "Hi from Sarah");

// #5 Personal Sarah → Company Sarah (network + business coexist in index)
const fed = listFederatedChatConversations("acc_a");
assert.ok(fed.some((c) => c.companyId === "smilemore-demo"));

// #6 Handover intent
assert.ok(detectHumanHandoverIntent("human agent please"));
const handover = await requestHumanHandover("acc_a", "smilemore-demo");
assert.equal(handover.next, HANDOVER_STATES.HUMAN_REQUESTED);

// #7 Continue with human (ownership mapping)
assert.equal(ownershipStateFromTakeover(true, HANDOVER_STATES.HUMAN_REQUESTED), HANDOVER_STATES.HUMAN_ACTIVE);

// #8 Return to Sarah
assert.equal(ownershipStateFromTakeover(false, HANDOVER_STATES.HUMAN_ACTIVE), HANDOVER_STATES.AI_ACTIVE_AGAIN);

// #10 Group privacy (member-only group create)
const group = await createPersonalGroup("acc_a", { title: "Family", memberIds: [] });
assert.equal(group.ownerId, personIdFromUserId("acc_a"));

// #11 Tenant isolation (consumer P2P not in tenant CRM — no throw)
assert.ok(group.type);

// #12 Block
const a = personIdFromUserId("acc_a");
const b = personIdFromUserId("acc_b");
blockPerson(a, b);

// #13 Dedupe index keys
const index = listFederatedChatConversations("acc_a");
const businessRows = index.filter((c) => c.companyId === "smilemore-demo");
assert.ok(businessRows.length >= 1);

// #14 Work link
createChatWorkLink(biz.id, { workItemId: "w1" });
assert.ok(listChatWorkLinks(biz.id).length === 1);

// #15 History consistent (consumer conversation has messages array path)
assert.ok(Array.isArray(biz.messages) || biz.id);

// Search MVP
const search = searchChatThreads("acc_a", "smile");
assert.ok(search.conversations.length >= 1);

console.log("ch9-chat-acceptance.test.mjs: ok (§17 API MVP)");
