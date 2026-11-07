/**
 * C1 WP4 — integration event publisher + Sarah App conversation hooks.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventTypes } from "../services/events/eventTypes.js";
import { listEvents } from "../services/events/eventStore.js";
import {
    buildSarahAppMessageIntegrationEvent,
    clearIntegrationEventStoresForTests,
    listIntegrationAuditEventsForTests,
    publishIntegrationEvent,
    validateIntegrationEventV1,
} from "../services/events/publishIntegrationEvent.js";
import {
    appendUserConversationMessage,
    clearUserConversationsForTests,
    openUserConversation,
} from "../services/users/userConversationService.js";

clearIntegrationEventStoresForTests();
clearUserConversationsForTests();

const companyId = "smilemore-demo";
const uid = "u-c1-wp4";

const baseEnvelope = () => ({
    id: `evt-${randomUUID()}`,
    type: "integration.message.user",
    occurredAt: new Date().toISOString(),
    companyId,
    personId: uid,
    source: { portal: "sarah_app", service: "test", version: "c1" },
    resource: { kind: "message", id: randomUUID() },
    idempotencyKey: `sarah_app:${companyId}:${randomUUID()}`,
    payload: { channel: "sarah_app" },
});

assert.throws(() => validateIntegrationEventV1({ type: "bad" }), /missing required/i);

const envelope = baseEnvelope();
validateIntegrationEventV1(envelope);

const first = await publishIntegrationEvent(envelope);
assert.equal(first.duplicate, false);
assert.ok(first.tenantEvent);
assert.equal(first.tenantEvent.type, EventTypes.MESSAGE_RECEIVED);

const second = await publishIntegrationEvent(envelope);
assert.equal(second.duplicate, true);
assert.equal(listIntegrationAuditEventsForTests().length, 1);

const tenantListed = await listEvents(companyId, { type: EventTypes.MESSAGE_RECEIVED, limit: 20 });
assert.equal(tenantListed.items.length, 1);

delete process.env.INTEGRATION_EVENTS_SARAH_APP;
const conv = await openUserConversation(uid, companyId, { companyName: "SmileMore" });
const beforeFlag = listIntegrationAuditEventsForTests().length;
await appendUserConversationMessage(conv, { role: "user", content: "Hello", id: randomUUID() });
assert.equal(listIntegrationAuditEventsForTests().length, beforeFlag);

process.env.INTEGRATION_EVENTS_SARAH_APP = "1";
clearUserConversationsForTests();
clearIntegrationEventStoresForTests();

const conv2 = await openUserConversation(uid, companyId, { companyName: "SmileMore" });
const auditAfterOpen = listIntegrationAuditEventsForTests();
assert.equal(auditAfterOpen.length, 1);
assert.equal(auditAfterOpen[0].type, "integration.conversation.opened");

const messageId = randomUUID();
await appendUserConversationMessage(conv2, { role: "user", content: "Hi", id: messageId });
const built = buildSarahAppMessageIntegrationEvent(conv2, {
    id: messageId,
    role: "user",
    content: "Hi",
    createdAt: new Date().toISOString(),
});
await publishIntegrationEvent(built);
assert.equal(listIntegrationAuditEventsForTests().length, 2);

console.log("c1-integration-events-wp4.test.mjs: ok");
