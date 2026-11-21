#!/usr/bin/env node
/**
 * C1 — Backfill Firestore userConversations from tenant CRM + optional in-memory snapshot.
 *
 * Scans companies/{companyId}/conversations where channel === sarah_app (skips WhatsApp),
 * upserts consumer metadata to userConversations/{conversationId}, optionally copies messages.
 *
 * Usage:
 *   node scripts/backfill-user-conversations-from-tenant.mjs --company-id=smilemore-demo --dry-run
 *   node scripts/backfill-user-conversations-from-tenant.mjs --company-id=smilemore-demo
 *   node scripts/backfill-user-conversations-from-tenant.mjs --company-id=smilemore-demo --since=2026-01-01T00:00:00.000Z
 *   node scripts/backfill-user-conversations-from-tenant.mjs --company-id=smilemore-demo --memory-snapshot=./uc-snapshot.json
 *   node scripts/backfill-user-conversations-from-tenant.mjs --company-id=smilemore-demo --from-process-memory --dry-run
 *
 * npm shortcuts:
 *   npm run backfill:user-conversations:dry -- --company-id=smilemore-demo
 *   npm run backfill:user-conversations -- --company-id=smilemore-demo
 *
 * @see docs/architecture/COMPANY_PORTAL_C1_IDENTITY_EVENTS_PLAN.md §4.3
 */
import { readFileSync } from "node:fs";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { conversationsRepo, messagesRepo } from "../services/storage/tenantStorage.js";
import {
    getConversationById,
    upsertConversation,
    upsertMessage,
    firestoreUserConversationStoreEnabled,
} from "../services/users/userConversationFirestoreStore.js";
import {
    formatBackfillUsage,
    parseBackfillCliArgs,
    runUserConversationsBackfill,
} from "../services/users/backfillUserConversations.js";
import { exportInMemoryUserConversationsSnapshot } from "../services/users/userConversationService.js";

bootstrapEnv();

const cli = parseBackfillCliArgs(process.argv.slice(2));
if (cli.help) {
    console.log(formatBackfillUsage());
    process.exit(0);
}

if (!cli.companyId) {
    console.error(formatBackfillUsage());
    console.error("\nError: --company-id is required.");
    process.exit(1);
}

if (!firestoreUserConversationStoreEnabled()) {
    console.error(
        "Firestore admin backend unavailable — set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS."
    );
    process.exit(1);
}

/** @type {object|null} */
let memorySnapshot = null;
if (cli.memorySnapshotPath) {
    const raw = readFileSync(cli.memorySnapshotPath, "utf8");
    memorySnapshot = JSON.parse(raw);
}

/** @type {object|null} */
const processMemorySnapshot = cli.fromProcessMemory ? exportInMemoryUserConversationsSnapshot() : null;

async function listTenantConversationsPage(companyId, options) {
    return conversationsRepo.listPage(companyId, options);
}

async function loadTenantMessages(companyId, tenantConversationId) {
    const all = await messagesRepo.list(companyId, { max: 500, orderByField: "createdAt" });
    return all
        .filter((m) => m.conversationId === tenantConversationId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

const { plans, stats } = await runUserConversationsBackfill(
    {
        companyId: cli.companyId,
        dryRun: cli.dryRun,
        since: cli.since,
        maxMessages: cli.maxMessages,
        copyMessages: cli.copyMessages,
        limit: cli.limit,
        fromTenant: cli.fromTenant,
        memorySnapshot,
        processMemorySnapshot,
    },
    {
        listTenantConversationsPage,
        getConversationById,
        upsertConversation,
        upsertMessage,
        loadTenantMessages,
    }
);

const mode = cli.dryRun ? "dry-run" : "apply";
console.log(`[backfill-user-conversations] mode=${mode} companyId=${cli.companyId}`);
console.log(
    JSON.stringify(
        {
            plans: plans.length,
            ...stats,
        },
        null,
        2
    )
);

if (stats.errors.length) {
    process.exitCode = 1;
}
