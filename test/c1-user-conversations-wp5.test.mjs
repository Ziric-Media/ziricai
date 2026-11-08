/**
 * C1 WP5 — userConversations backfill helpers + dry-run apply.
 */
process.env.STORAGE_BACKEND = "memory";

import assert from "node:assert/strict";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import {
    applyBackfillPlans,
    buildBackfillPlanFromMemoryConversation,
    buildBackfillPlanFromTenantConversation,
    mapTenantMessageToConsumer,
    mergeBackfillPlans,
    parseBackfillCliArgs,
    personIdFromTenantConversation,
    plansFromMemorySnapshot,
    runUserConversationsBackfill,
} from "../services/users/backfillUserConversations.js";
import {
    clearUserConversationsForTests,
    exportInMemoryUserConversationsSnapshot,
    openUserConversation,
    appendUserConversationMessage,
} from "../services/users/userConversationService.js";
import { conversationsRepo } from "../services/storage/tenantStorage.js";

resetMemoryTenantStore();
clearUserConversationsForTests();

const companyId = "smilemore-demo";
const uid = "u-c1-wp5-backfill";

const tenantConv = {
    id: `sarah_app::sarah_app::${uid}`,
    conversationId: `sarah_app::sarah_app::${uid}`,
    customerId: `sarah_app::${uid}`,
    channel: "sarah_app",
    externalUserId: uid,
    preview: "Hello",
    lastMessageAt: "2026-11-01T12:00:00.000Z",
    createdAt: "2026-11-01T11:00:00.000Z",
};

assert.equal(personIdFromTenantConversation(tenantConv), uid);
const tenantPlan = buildBackfillPlanFromTenantConversation(companyId, tenantConv);
assert.ok(tenantPlan);
assert.equal(tenantPlan.conversationId, `uc_${companyId}_${uid}`);
assert.equal(tenantPlan.tenantConversationId, tenantConv.id);

const waConv = { id: "whatsapp::27820000000", channel: "whatsapp", customerId: "27820000000" };
assert.equal(buildBackfillPlanFromTenantConversation(companyId, waConv), null);

await conversationsRepo.set(companyId, tenantConv.id, tenantConv);

clearUserConversationsForTests();
const conv = await openUserConversation(uid, companyId, { consumerDisplayName: "Alex" });
await appendUserConversationMessage(conv, { role: "user", content: "Backfill me" });

const snap = exportInMemoryUserConversationsSnapshot();
assert.equal(snap.conversations.length, 1);
const memoryPlans = plansFromMemorySnapshot(snap);
assert.equal(memoryPlans.length, 1);
assert.ok(memoryPlans[0].messages.length >= 1);

const merged = mergeBackfillPlans([tenantPlan, memoryPlans[0]]);
assert.equal(merged.length, 1);
assert.equal(merged[0].source, "merged");
assert.ok(merged[0].messages.length >= 1);

const mapped = mapTenantMessageToConsumer(
    {
        id: "msg-tenant-1",
        role: "assistant",
        content: "Reply",
        createdAt: "2026-11-01T12:01:00.000Z",
        externalId: "ext-1",
    },
    tenantPlan.conversationId
);
assert.equal(mapped.id, "ext-1");
assert.equal(mapped.role, "assistant");

/** @type {object[]} */
const writtenConversations = [];
/** @type {object[]} */
const writtenMessages = [];

const stats = await applyBackfillPlans(
    merged,
    { dryRun: true, copyMessages: true, maxMessages: 10 },
    {
        getConversationById: async () => null,
        upsertConversation: async (c) => writtenConversations.push(c),
        upsertMessage: async (cid, msg) => writtenMessages.push({ cid, msg }),
    }
);
assert.equal(stats.conversationsWritten, 1);
assert.ok(stats.messagesWritten >= 1);
assert.equal(writtenConversations.length, 0);

const cli = parseBackfillCliArgs([
    "--company-id=smilemore-demo",
    "--dry-run",
    "--max-messages=5",
    "--since=2026-01-01",
]);
assert.equal(cli.companyId, "smilemore-demo");
assert.equal(cli.dryRun, true);

const { stats: runStats } = await runUserConversationsBackfill(
    {
        companyId,
        dryRun: true,
        since: null,
        maxMessages: 20,
        copyMessages: true,
        limit: 100,
        memorySnapshot: snap,
        fromTenant: true,
    },
    {
        listTenantConversationsPage: (cid, opts) => conversationsRepo.listPage(cid, opts),
        getConversationById: async () => null,
        upsertConversation: async () => {},
        upsertMessage: async () => {},
        loadTenantMessages: async () => [],
    }
);
assert.ok(runStats.conversationsWritten >= 1);

const memOnly = buildBackfillPlanFromMemoryConversation(conv, [{ role: "user", content: "x", id: "m1" }]);
assert.ok(memOnly);
assert.equal(memOnly.userId, uid);

console.log("c1-user-conversations-wp5.test.mjs: ok");
