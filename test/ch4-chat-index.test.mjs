import assert from "node:assert/strict";
import { clearUserConversationsForTests, openUserConversation } from "../services/users/userConversationService.js";
import { listFederatedChatConversations } from "../services/users/chatConversationIndexService.js";

clearUserConversationsForTests();
await openUserConversation("u4", "smilemore-demo", { companyName: "SmileMore" });
const all = listFederatedChatConversations("u4");
assert.ok(all.some((c) => c.companyId === "smilemore-demo"));
const businesses = listFederatedChatConversations("u4", { filter: "businesses" });
assert.equal(businesses.length, 1);
console.log("ch4-chat-index.test.mjs: ok");
