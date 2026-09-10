#!/usr/bin/env node
/**
 * PORTAL-2C — Marketplace / Analytics error integrity + simulated stats gate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

console.log("verify-portal-2c");

const marketplace = read("js/portal/modules/marketplace.js");
const analytics = read("js/portal/modules/analytics.js");
const portalDemo = read("services/portal/portalDemo.js");
const dashboardService = read("services/analytics/dashboardService.js");
const billing = read("js/portal/modules/billing.js");

assert.match(marketplace, /if \(catalogRes\.error\)/);
assert.match(marketplace, /errorState\(catalogRes\.error\)/);
assert.doesNotMatch(marketplace, /catalogRes\.error \? \{ categories: \[\], packs: \[\] \}/);
console.log("✓ Marketplace catalog API failure surfaces error state");

assert.match(analytics, /if \(res\.error && !useDemo\)/);
assert.doesNotMatch(analytics, /res\.error && useDemo \? fallback : apiData \|\| fallback/);
assert.match(analytics, /formatPercentMetric/);
assert.doesNotMatch(analytics, /\?\? 85\}/);
assert.doesNotMatch(analytics, /\?\? 1\.8\}/);
assert.doesNotMatch(analytics, /\?\? 4\.2\}/);
console.log("✓ Analytics API failure never substitutes demo for provisioned tenants");

assert.doesNotMatch(dashboardService, /aiResolutionRate: metrics\.aiAccuracy \?\? 85/);
assert.doesNotMatch(dashboardService, /avgResponseSec: metrics\.avgResponseSec \?\? 1\.8/);
assert.doesNotMatch(dashboardService, /avgSatisfaction: metrics\.customerSatisfaction \?\? 4\.2/);
assert.doesNotMatch(dashboardService, /: 80\) \/ 100\)/);
console.log("✓ dashboardService summary KPIs do not fabricate production fallbacks");

assert.match(portalDemo, /emptyQuickStats/);
assert.match(portalDemo, /emptyChartSeries/);
assert.match(portalDemo, /allowDemo[\s\S]*generateMonthlyUsageSeries/);
assert.match(portalDemo, /quickStats = allowDemo \? getPortalQuickStats/);
console.log("✓ getPortalQuickStats/chartSeries gated for provisioned tenants");

assert.match(billing, /No daily usage history recorded yet/);
assert.doesNotMatch(billing, /tenant-scoped demo data/);
console.log("✓ Billing chart no longer labels simulated series as demo data for all tenants");

execSync("node scripts/verify-portal-foundation.js", { cwd: ROOT, stdio: "inherit" });

console.log("\nAll PORTAL-2C checks passed.");
