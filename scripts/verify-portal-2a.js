#!/usr/bin/env node
/**
 * PORTAL-2A — P0 backend fixes (automation sort, notifications timestamps, integrations auth).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    compareTimestampsDesc,
    timestampToMillis,
    toIsoTimestamp,
} from "../services/core/timestampUtils.js";
import { serializeNotificationRecord } from "../services/tenants/notificationService.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

console.log("verify-portal-2a");

const workflowRegistry = read("services/automation/workflowRegistry.js");
const automationEngine = read("services/automation/automationEngine.js");
const notificationService = read("services/tenants/notificationService.js");
const tenantContext = read("services/core/tenantContext.js");
const notificationsModule = read("js/portal/modules/notifications.js");

assert.match(workflowRegistry, /compareTimestampsDesc/);
assert.doesNotMatch(workflowRegistry, /\.localeCompare\(a\.updatedAt/);
console.log("✓ workflowRegistry uses safe timestamp sort");

assert.match(automationEngine, /compareTimestampsDesc/);
assert.doesNotMatch(automationEngine, /\.localeCompare\(a\.startedAt/);
console.log("✓ automationEngine uses safe timestamp sort");

assert.match(notificationService, /serializeNotificationItems/);
assert.match(notificationService, /toIsoTimestamp/);
console.log("✓ notificationService serializes createdAt for API responses");

assert.match(tenantContext, /if \(!ctx\.profile\)/);
assert.match(tenantContext, /getTenantMembership\(ctx\.uid, ctx\.companyId\)/);
assert.doesNotMatch(
    tenantContext.slice(tenantContext.indexOf("assertIntegrationReadAccess")),
    /if \(!ctx\.profile\) \{\s*throw Object\.assign\(new Error\("User profile not found/
);
console.log("✓ integration read auth allows membership when profile doc is missing");

assert.match(notificationsModule, /function formatNotificationTime/);
assert.doesNotMatch(notificationsModule, /createdAt\?\.slice/);
console.log("✓ notifications UI uses defensive timestamp formatting");

const firestoreTs = { _seconds: 1_700_000_000, _nanoseconds: 0 };
assert.equal(timestampToMillis(firestoreTs), 1_700_000_000_000);
assert.ok(compareTimestampsDesc(firestoreTs, "2024-01-02T00:00:00.000Z") > 0);
assert.equal(toIsoTimestamp(firestoreTs), "2023-11-14T22:13:20.000Z");

const serialized = serializeNotificationRecord({
    id: "n-1",
    title: "Test",
    createdAt: firestoreTs,
});
assert.equal(typeof serialized.createdAt, "string");
assert.equal(serialized.createdAt.includes("T"), true);
console.log("✓ timestampUtils + notification serialization runtime checks");

execSync("node scripts/verify-integration-read-authorization.js", {
    cwd: ROOT,
    stdio: "inherit",
});
execSync("node scripts/verify-integration-auth-cases.js", {
    cwd: ROOT,
    stdio: "inherit",
});

console.log("\nAll PORTAL-2A checks passed.");
