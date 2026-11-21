import assert from "node:assert/strict";
import { CONVERSATION_TYPES } from "../services/users/messagingContracts.js";
import {
    clearNetworkChatLinksForTests,
    ensureNetworkChatThread,
    getNetworkLinkedConversation,
    getNetworkChatMessages,
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
const loaded = getNetworkLinkedConversation("user_ch5", conv.id);
assert.equal(loaded.id, conv.id);
assert.ok(getNetworkChatMessages(conv.id).length >= 2);

// SNET-01a: real dispatch returns payload.naturalLanguage (not response.reply).
const real = await ensureNetworkChatThread({
    requestId: "req_ch5_real_shape",
    source: { userId: "user_ch5" },
    destination: { companyId: "smilemore-demo" },
    payload: { naturalLanguage: "Do you offer whitening?" },
    response: { status: "completed", payload: { naturalLanguage: "Yes, whitening is available." } },
});
assert.equal(getNetworkChatMessages(real.id).at(-1).content, "Yes, whitening is available.");
console.log("ch5-sarah-network-chat.test.mjs: ok");
