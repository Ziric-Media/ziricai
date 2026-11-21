/**
 * C1 WP1 — schema path helpers + integration event contract shape.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    USER_CONVERSATIONS,
    userConversationPath,
    userConversationMessagesCollectionPath,
    userConversationMessagePath,
    businessDirectoryPath,
} from "../services/database/schema.js";
import {
    buildConsumerConversationId,
    isValidPersonId,
    isValidConsumerConversationId,
    isValidConsumerMessageId,
} from "../services/users/identityContracts.js";

const convId = "uc_demo-co_u-test";
assert.equal(userConversationPath(convId), `${USER_CONVERSATIONS.ROOT}/${convId}`);
assert.equal(
    userConversationMessagesCollectionPath(convId),
    `userConversations/${convId}/messages`
);
assert.equal(
    userConversationMessagePath(convId, "msg-1"),
    `userConversations/${convId}/messages/msg-1`
);
assert.equal(businessDirectoryPath("demo-co"), "businessDirectory/demo-co");

const personId = "firebase_uid_123";
assert.ok(isValidPersonId(personId));
const built = buildConsumerConversationId(personId, "smilemore-demo");
assert.ok(isValidConsumerConversationId(built));
assert.match(built, /^uc_/);

assert.ok(isValidConsumerMessageId("550e8400-e29b-41d4-a716-446655440000"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(__dirname, "../services/events/integrationEventContract.v1.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
assert.equal(contract.title, "ZiricIntegrationEventV1");
assert.ok(Array.isArray(contract.properties.type.enum));

const example = {
    id: "evt-test-1",
    type: "integration.message.user",
    occurredAt: new Date().toISOString(),
    companyId: "smilemore-demo",
    personId: "u1",
    source: { portal: "sarah_app", service: "userConversationService", version: "c1" },
    resource: { kind: "message", id: "550e8400-e29b-41d4-a716-446655440000" },
    idempotencyKey: "sarah_app:smilemore-demo:550e8400-e29b-41d4-a716-446655440000",
    payload: { channel: "sarah_app" },
};
for (const key of contract.required) {
    assert.ok(key in example, `example missing required field ${key}`);
}
assert.ok(contract.properties.type.enum.includes(example.type));
assert.ok(contract.properties.source.properties.portal.enum.includes(example.source.portal));
assert.ok(contract.properties.resource.properties.kind.enum.includes(example.resource.kind));

console.log("c1-user-conversations-wp1.test.mjs: ok");
