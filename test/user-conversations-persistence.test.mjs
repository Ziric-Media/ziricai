/**
 * C1 WP6 — programme persistence acceptance (AT-C1-01..04, Firestore indexes).
 * @see docs/architecture/COMPANY_PORTAL_C1_IDENTITY_EVENTS_PLAN.md §8
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import { useAdminBackend } from "../services/database/firestoreClient.js";
import { buildConsumerConversationId } from "../services/users/identityContracts.js";
import {
    appendUserConversationMessage,
    clearUserConversationsForTests,
    getUserConversationMessages,
    openUserConversation,
    syncMessagesFromTenant,
    listUserConversations,
} from "../services/users/userConversationService.js";
import { getTenantConversationHistory } from "../services/storage/tenantStorage.js";
import { personIdFromTenantConversation } from "../services/users/backfillUserConversations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexesPath = path.join(__dirname, "../firestore.indexes.json");
const indexes = JSON.parse(fs.readFileSync(indexesPath, "utf8"));

function findIndex(collectionGroup, fields) {
    return indexes.indexes.find(
        (idx) =>
            idx.collectionGroup === collectionGroup &&
            idx.fields?.length === fields.length &&
            fields.every((f, i) => idx.fields[i]?.fieldPath === f.fieldPath && idx.fields[i]?.order === f.order)
    );
}

assert.ok(
    findIndex("userConversations", [
        { fieldPath: "userId", order: "ASCENDING" },
        { fieldPath: "lastMessageAt", order: "DESCENDING" },
    ]),
    "missing userConversations userId+lastMessageAt index"
);
assert.ok(
    findIndex("userConversations", [
        { fieldPath: "personId", order: "ASCENDING" },
        { fieldPath: "companyId", order: "ASCENDING" },
    ]),
    "missing userConversations personId+companyId index"
);
assert.ok(
    findIndex("messages", [{ fieldPath: "createdAt", order: "ASCENDING" }]),
    "missing messages collectionGroup createdAt index"
);

resetMemoryTenantStore();
clearUserConversationsForTests();

const companyId = "smilemore-demo";
const uid = "u-c1-wp6-persist";

// AT-C1-03 — stable conversationId for (uid, companyId)
const a = await openUserConversation(uid, companyId, { companyName: "SmileMore" });
const b = await openUserConversation(uid, companyId, { companyName: "SmileMore" });
assert.equal(a.id, b.id);
assert.equal(a.id, buildConsumerConversationId(uid, companyId));

const messageId = randomUUID();
await appendUserConversationMessage(a, { role: "user", content: "Persistence check", id: messageId });
await appendUserConversationMessage(a, { role: "user", content: "Persistence check", id: messageId });
assert.equal(getUserConversationMessages(a.id).length, 1);

const tenantHistory = await getTenantConversationHistory(companyId, uid, "sarah_app", 50, {
    externalUserId: uid,
});
const tenantWithId = tenantHistory.filter((m) => m.id === messageId);
assert.equal(tenantWithId.length, 1, "AT-C1-04: duplicate messageId → single tenant row");

assert.equal(listUserConversations(uid).length, 1);

// AT-C1-02 — in-memory index cleared; tenant mirror + sync restores thread (restart surrogate)
clearUserConversationsForTests();
assert.equal(listUserConversations(uid).length, 0);

const reopened = await openUserConversation(uid, companyId, { companyName: "SmileMore" });
assert.equal(reopened.id, a.id);
const synced = await syncMessagesFromTenant(reopened, 50);
assert.ok(synced.length >= 1);
assert.equal(getUserConversationMessages(reopened.id).length, synced.length);

const waTenant = {
    id: "whatsapp::27821112222",
    channel: "whatsapp",
    customerId: "27821112222",
    externalUserId: null,
};
assert.equal(personIdFromTenantConversation(waTenant), null, "backfill skips WhatsApp-only conversations");

if (useAdminBackend() && process.env.USER_CONVERSATIONS_BACKEND === "firestore") {
    const liveConv = await openUserConversation("u-c1-wp6-fs", companyId, { companyName: "SmileMore" });
    await appendUserConversationMessage(liveConv, { role: "user", content: "Firestore slice", id: randomUUID() });
    clearUserConversationsForTests();
    const hydrated = await openUserConversation("u-c1-wp6-fs", companyId, { companyName: "SmileMore" });
    assert.equal(hydrated.id, liveConv.id);
    assert.ok(getUserConversationMessages(hydrated.id).length >= 1, "AT-C1-02 Firestore hydrate after clear");
} else {
    console.log(
        "user-conversations-persistence: Firestore restart slice skipped (need admin backend + USER_CONVERSATIONS_BACKEND=firestore)"
    );
}

console.log("user-conversations-persistence.test.mjs: ok");
