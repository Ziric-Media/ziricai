#!/usr/bin/env node
/**
 * PORTAL-2B — Hub/demo boundary verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldUseDemoFallback } from "../services/core/dataMode.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

console.log("verify-portal-2b");

assert.equal(
    shouldUseDemoFallback({ companyId: "central-motors-rtb", isDemo: true, isProvisioned: true }),
    false
);
assert.equal(
    shouldUseDemoFallback({ companyId: "central-motors-rtb", isDemo: false, isProvisioned: true }),
    false
);
assert.equal(shouldUseDemoFallback({ companyId: "demo-central-motors", isProvisioned: false }), true);
assert.equal(
    shouldUseDemoFallback({ companyId: "demo-central-motors", isProvisioned: true }),
    true
);
console.log("✓ shouldUseDemoFallback blocks demo for provisioned tenants");

const hub = read("services/portal/portalDataHub.js");
assert.match(hub, /shouldUseDemoFallback/);
assert.match(hub, /useDemoContent/);
assert.doesNotMatch(hub, /isDemoTenantFlag/);
assert.match(hub, /:\s*useDemoContent[\s\S]*\?\s*DEMO_HUB_CONVERSATIONS/);
console.log("✓ portalDataHub uses centralized demo gate");

const portalDemo = read("services/portal/portalDemo.js");
assert.match(portalDemo, /allowPortalDemoFallback/);
assert.match(portalDemo, /if \(await allowPortalDemoFallback\(companyId\)\)/);
console.log("✓ portalDemo async fallbacks gated by allowPortalDemoFallback");

const conversations = read("js/portal/modules/conversations.js");
assert.doesNotMatch(conversations, /hubData\?\.recentConversations/);
console.log("✓ Inbox no longer substitutes hub demo conversations");

const dataService = read("js/portal/core/dataService.js");
assert.match(dataService, /shouldUseDemoFallback/);
console.log("✓ dataService hub cache uses shouldUseDemoFallback");

const appJs = read("api/app.js");
assert.match(appJs, /allowPortalDemoFallback/);
assert.doesNotMatch(appJs, /isDemo:\s*!items\.length/);
console.log("✓ portal activity/notifications routes no longer mark empty as demo");

execSync("node scripts/verify-integration-auth-cases.js", { cwd: ROOT, stdio: "inherit" });
execSync("node scripts/verify-portal-foundation.js", { cwd: ROOT, stdio: "inherit" });

console.log("\nAll PORTAL-2B checks passed.");
