import assert from "node:assert/strict";
import { CONVERSATION_TYPES } from "../services/users/messagingContracts.js";
import {
    clearGroupConversationsForTests,
    createPersonalGroup,
    sendGroupMessage,
    invitePersonalSarahToGroup,
} from "../services/users/groupConversationService.js";

clearGroupConversationsForTests();

const owner = "owner_ch3";
const member = "friend_ch3";
const group = await createPersonalGroup(owner, { title: "Weekend", memberIds: [member] });
assert.equal(group.type, CONVERSATION_TYPES.GROUP_PERSONAL);

const sent = await sendGroupMessage(owner, group.id, "Hi team", {
    attachments: [{ name: "photo.jpg", mimeType: "image/jpeg", url: "https://example.com/photo.jpg" }],
});
assert.equal(sent.message.attachments.length, 1);

const withSarah = await invitePersonalSarahToGroup(owner, group.id, { consentGranted: true });
const sarah = withSarah.participants.find((p) => p.kind === "personal_sarah");
assert.ok(sarah?.consentGranted);

console.log("ch3-media-groups.test.mjs: ok");
