/**
 * CH1 — messaging foundation (types, participants, sarah_app channel resolution).
 */
import assert from "node:assert/strict";
import {
    CONVERSATION_TYPES,
    HANDOVER_STATES,
    buildPersonToBusinessConversationMeta,
    ensureConversationMessagingFoundation,
    isValidConversationType,
    isValidMessageRole,
} from "../services/users/messagingContracts.js";
import {
    CHAT_CONVERSATION_TYPES,
    CHAT_HANDOVER_STATES,
    USER_CONVERSATIONS,
} from "../services/database/schema.js";
import {
    inferChannelFromConversationId,
    resolveTenantConversationRef,
    resolveSarahAppUidFromRef,
} from "../services/conversation/tenantConversationRef.js";

assert.equal(USER_CONVERSATIONS.SCHEMA_VERSION, 1);
assert.equal(CONVERSATION_TYPES.PERSON_TO_BUSINESS, CHAT_CONVERSATION_TYPES.PERSON_TO_BUSINESS);
assert.equal(HANDOVER_STATES.AI_ACTIVE, CHAT_HANDOVER_STATES.AI_ACTIVE);

const personId = "firebase_uid_ch1";
const companyId = "smilemore-demo";
const meta = buildPersonToBusinessConversationMeta(personId, companyId, {
    companyDisplayName: "SmileMore",
    personDisplayName: "Alex",
});
assert.ok(isValidConversationType(meta.type));
assert.equal(meta.type, CONVERSATION_TYPES.PERSON_TO_BUSINESS);
assert.equal(meta.ownershipState, HANDOVER_STATES.AI_ACTIVE);
assert.equal(meta.participants.length, 2);
assert.equal(meta.participants[0].kind, "person");
assert.equal(meta.participants[0].id, personId);
assert.equal(meta.participants[1].kind, "company_sarah");
assert.ok(meta.companySarahAgentId.includes(companyId));

const hydrated = ensureConversationMessagingFoundation({
    id: "uc_x",
    personId,
    userId: personId,
    companyId,
    channel: "sarah_app",
});
assert.equal(hydrated.schemaVersion, 1);
assert.ok(hydrated.participants.length >= 2);

assert.ok(isValidMessageRole("human"));
assert.ok(isValidMessageRole("system"));

const sarahConvId = "sarah_app::sarah_app::firebase_uid_ch1";
assert.equal(inferChannelFromConversationId(sarahConvId), "sarah_app");
assert.equal(resolveSarahAppUidFromRef(sarahConvId), "firebase_uid_ch1");

const ref = resolveTenantConversationRef(sarahConvId);
assert.equal(ref.channel, "sarah_app");
assert.equal(ref.phone, "firebase_uid_ch1");
assert.equal(ref.canonicalId, sarahConvId);

const waRef = resolveTenantConversationRef("27821234567");
assert.equal(waRef.channel, "whatsapp");

process.env.STORAGE_BACKEND = "memory";

const { TenantRepository } = await import("../services/database/tenantRepository.js");
const { TENANT_COLLECTIONS } = await import("../services/database/schema.js");
const {
    markConversationRead,
    setHumanTakeover,
} = await import("../services/tenants/conversationService.js");

const repo = new TenantRepository(TENANT_COLLECTIONS.CONVERSATIONS);
const testCompany = "ch1-channel-co";
await repo.set(testCompany, sarahConvId, {
    id: sarahConvId,
    conversationId: sarahConvId,
    channel: "sarah_app",
    customerId: "sarah_app::firebase_uid_ch1",
    unread: true,
    updatedAt: new Date().toISOString(),
});

const read = await markConversationRead(testCompany, sarahConvId);
assert.equal(read.success, true);
assert.equal(read.conversationId, sarahConvId);

const takeover = await setHumanTakeover(testCompany, sarahConvId, {
    enabled: true,
    humanAgent: "Jordan",
});
assert.equal(takeover.channel, "sarah_app");
assert.equal(takeover.conversationId, sarahConvId);
assert.equal(takeover.humanTakeover, true);

const stored = await repo.get(testCompany, sarahConvId);
assert.equal(stored.channel, "sarah_app");
assert.equal(stored.humanTakeover, true);

process.env.STORAGE_BACKEND = "memory";
const { clearUserConversationsForTests, openUserConversation } = await import(
    "../services/users/userConversationService.js"
);
clearUserConversationsForTests();
const conv = await openUserConversation(personId, companyId, { companyName: "SmileMore" });
assert.equal(conv.type, CONVERSATION_TYPES.PERSON_TO_BUSINESS);
assert.equal(conv.ownershipState, HANDOVER_STATES.AI_ACTIVE);
assert.ok(conv.participants?.length >= 2);

console.log("ch1-messaging-foundation.test.mjs: ok");
