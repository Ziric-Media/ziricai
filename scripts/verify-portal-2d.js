#!/usr/bin/env node
/**
 * PORTAL-2D — Persistence contracts + production billing usage snapshot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionUsageSnapshot } from "../services/portal/portalUsageSnapshot.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

console.log("verify-portal-2d");

const portalDemo = read("services/portal/portalDemo.js");
const usageSnapshot = read("services/portal/portalUsageSnapshot.js");
const authGuard = read("js/portal/auth-guard.js");
const settings = read("js/portal/modules/settings.js");
const customers = read("js/portal/modules/customers.js");
const billing = read("js/portal/modules/billing.js");

assert.match(portalDemo, /buildProductionUsageSnapshot/);
assert.match(portalDemo, /else if \(allowDemo\)/);
assert.doesNotMatch(
    portalDemo.slice(portalDemo.indexOf("export async function getPortalUsageAsync")),
    /buildUsageFromPlan\(planId, seed\)[\s\S]*allowPortalDemoFallback/
);
console.log("✓ provisioned tenants use buildProductionUsageSnapshot, not buildUsageFromPlan");

assert.match(usageSnapshot, /usageSource:\s*"recorded"/);
assert.match(usageSnapshot, /getCurrentMetrics/);
assert.doesNotMatch(usageSnapshot, /buildUsageFromPlan/);
console.log("✓ portalUsageSnapshot uses recorded sources only");

const snapshot = await buildProductionUsageSnapshot("central-motors-rtb", "starter");
assert.equal(snapshot.usageSource, "recorded");
assert.equal(typeof snapshot.messagesUsed, "number");
assert.equal(snapshot.tokensUsed, 0);
console.log("✓ buildProductionUsageSnapshot runtime contract");

assert.match(authGuard, /useDemoBranding/);
assert.match(authGuard, /useDemoBranding \? localStorage/);
console.log("✓ provisioned tenants prefer server branding over localStorage");

assert.match(settings, /if \(result\.error\)[\s\S]*return;[\s\S]*setState\(\{ branding/);
console.log("✓ settings branding only updates UI after API success");

assert.match(customers, /sessionStorage/);
assert.match(customers, /restoreCrmSelection/);
console.log("✓ CRM selection persists across refresh via sessionStorage");

assert.match(billing, /usageSource === 'recorded'/);
console.log("✓ billing surfaces recorded-usage notice for production tenants");

execSync("node scripts/verify-portal-2c.js", { cwd: ROOT, stdio: "inherit" });

console.log("\nAll PORTAL-2D checks passed.");
