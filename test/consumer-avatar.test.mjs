import assert from "node:assert/strict";
import { sarahAppUidFromConversation } from "../services/users/consumerAvatarService.js";

assert.equal(sarahAppUidFromConversation({ channel: "sarah_app", phone: "abc123" }), "abc123");
assert.equal(
    sarahAppUidFromConversation({ customerId: "sarah_app::uid-firebase-1" }),
    "uid-firebase-1"
);
assert.equal(
    sarahAppUidFromConversation({ id: "sarah_app::sarah_app::nested" }),
    "nested"
);
assert.equal(sarahAppUidFromConversation({ channel: "whatsapp", phone: "+27123456789" }), "");

console.log("consumer-avatar.test.mjs ok");