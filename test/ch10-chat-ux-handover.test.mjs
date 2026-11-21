import assert from "node:assert/strict";
import {
    clearChatUxForTests,
    searchChatThreads,
    patchConversationPreferences,
    addMessageReaction,
} from "../services/users/chatUxService.js";
import { clearChatMediaForTests, createChatMediaUpload } from "../services/users/chatMediaService.js";
import {
    assignSarahAppConversation,
    acceptSarahAppConversation,
    clearSarahInboxHandoverForTests,
    getHandoverMeta,
} from "../services/tenants/sarahInboxHandoverService.js";
import { clearUserConversationsForTests, openUserConversation } from "../services/users/userConversationService.js";
import { clearGroupConversationsForTests, createOrganisationGroup } from "../services/users/groupConversationService.js";
import { clearPersonToPersonConversationsForTests, openPersonToPersonConversation, invitePersonalSarahToP2p } from "../services/users/personToPersonConversationService.js";
import { personIdFromUserId } from "../services/users/identityContracts.js";
import { createChatWorkLink, clearChatWorkLinksForTests } from "../services/users/chatWorkLinkService.js";
import { appendNetworkTranscriptLine, clearNetworkChatLinksForTests, ensureNetworkChatThread } from "../services/users/sarahNetworkChatLinkService.js";

clearChatUxForTests();
clearChatMediaForTests();
clearSarahInboxHandoverForTests();
clearUserConversationsForTests();
clearGroupConversationsForTests();
clearPersonToPersonConversationsForTests();
clearChatWorkLinksForTests();
clearNetworkChatLinksForTests();

await openUserConversation("ux_a", "smilemore-demo", { companyName: "SmileMore" });
const search = searchChatThreads("ux_a", "smile");
assert.ok(search.conversations.some((c) => c.companyId === "smilemore-demo"));

const personA = personIdFromUserId("ux_a");
const prefs = patchConversationPreferences(personA, "conv_smilemore", { muted: true });
assert.equal(prefs.muted, true);

const reactions = addMessageReaction("msg1", personA, "👍");
assert.ok(reactions.some((r) => r.emoji === "👍"));

const upload = createChatMediaUpload("ux_a", { mimeType: "image/png", byteLength: 1024 });
assert.ok(upload.uploadUrl.includes("/api/chat/media/"));

const convId = "sarah_app::sarah_app::ux_test_uid";
await assignSarahAppConversation("smilemore-demo", convId, { employeeId: "emp1", humanAgent: "Emp One" });
const meta = getHandoverMeta("smilemore-demo", convId);
assert.equal(meta.assignmentState, "human_assigned");
await acceptSarahAppConversation("smilemore-demo", convId, { employeeId: "emp1" });
assert.equal(getHandoverMeta("smilemore-demo", convId).assignmentState, "human_active");

const orgGroup = await createOrganisationGroup("ux_a", {
    organisationId: "org-pilot",
    consentGranted: true,
    title: "Org pilot",
});
assert.equal(orgGroup.type, "group_organisation");

const p2p = await openPersonToPersonConversation("ux_a", "person_ux_b");
const withSarah = await invitePersonalSarahToP2p("ux_a", p2p.id, { consentGranted: true });
assert.ok(withSarah.participants.some((p) => p.kind === "personal_sarah"));

const workLink = createChatWorkLink("conv1", { bookingId: "b1", linkType: "booking" });
assert.equal(workLink.linkType, "booking");

const net = await ensureNetworkChatThread({
    source: { userId: "ux_a" },
    destination: { companyId: "smilemore-demo" },
    requestId: "req-ux-1",
    payload: { naturalLanguage: "Hello network" },
    response: { reply: "Network reply" },
});
await appendNetworkTranscriptLine(net.id, { content: "Follow-up", role: "assistant" });

console.log("ch10-chat-ux-handover.test.mjs: ok");
