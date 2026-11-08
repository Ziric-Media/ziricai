import assert from "node:assert/strict";
import { CONVERSATION_TYPES } from "../services/users/messagingContracts.js";
import {
    clearNetworkChatLinksForTests,
    ensureNetworkChatThread,
} from "../services/users/sarahNetworkChatLinkService.js";

clearNetworkChatLinksForTests();
const conv = await ensureNetworkChatThread({
    requestId: "req_ch5",
    source: { userId: "user_ch5" },
    destination: { companyId: "smilemore-demo" },
    payload: { naturalLanguage: "Do you offer braces?", consumerDisplayName: "Sam" },
    response: { reply: "Yes, we offer orthodontic consultations." },
});
assert.ok(conv);
assert.equal(conv.type, CONVERSATION_TYPES.AI_TO_AI);
console.log("ch5-sarah-network-chat.test.mjs: ok");
