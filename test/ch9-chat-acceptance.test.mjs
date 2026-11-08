/**
 * CH9 — subset of CHAT-01 §17 acceptance tests (MVP).
 */
import assert from "node:assert/strict";
import { clearPersonToPersonConversationsForTests, openPersonToPersonConversation } from "../services/users/personToPersonConversationService.js";
import { clearPersonBlocksForTests } from "../services/users/personBlockService.js";
import { clearUserConversationsForTests, openUserConversation } from "../services/users/userConversationService.js";
import { detectHumanHandoverIntent } from "../services/users/handoverStateService.js";

// #1 Two users P2P
clearPersonBlocksForTests();
clearPersonToPersonConversationsForTests();
await openPersonToPersonConversation("acc_a", "acc_b");

// #3 Business thread exists for portal path (tenant mirror on message — CH1)
clearUserConversationsForTests();
const biz = await openUserConversation("acc_a", "smilemore-demo", { companyName: "SmileMore" });
assert.ok(biz.tenantConversationId === null || typeof biz.tenantConversationId === "string");

// #6 Handover intent detection
assert.ok(detectHumanHandoverIntent("human agent please"));

console.log("ch9-chat-acceptance.test.mjs: ok (MVP subset)");
