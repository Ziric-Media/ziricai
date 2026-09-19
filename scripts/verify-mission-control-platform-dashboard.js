#!/usr/bin/env node
/**
 * MC-U-2B — Platform dashboard read API (read-only facade).
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { resetMemoryTenantStore } from "../services/database/tenantRepository.js";
import {
    seedDemoTenantsIfMissing,
    CENTRAL_MOTORS_COMPANY_ID,
} from "../services/storage/seedDemoTenants.js";
import {
    getPlatformDashboard,
    parsePlatformDashboardQuery,
    PlatformDashboardValidationError,
} from "../services/operations/platformDashboardService.js";
import { PRIMARY_MISSION_TENANT_ID } from "../services/operations/tenantMissionMetrics.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_PATH = join(ROOT, "services", "operations", "platformDashboardService.js");
const APP_PATH = join(ROOT, "api", "app.js");
const REGISTRY_PATH = join(ROOT, "services", "api", "routeRegistry.js");

console.log("verify-mission-control-platform-dashboard");

assert.ok(existsSync(SERVICE_PATH), "platformDashboardService.js exists");
const serviceSrc = readFileSync(SERVICE_PATH, "utf8");
assert.doesNotMatch(serviceSrc, /\.set\(|\.update\(|writeBatch|firestore\.batch/i);
assert.match(serviceSrc, /getPortalHub/);
assert.match(serviceSrc, /tenantClassification\.js/);
assert.match(serviceSrc, /summarizeByClassification/);

const appSrc = readFileSync(APP_PATH, "utf8");
assert.match(appSrc, /\/api\/operations\/platform-dashboard/);
assert.match(appSrc, /requirePlatformAccess\(\)/);
assert.match(readFileSync(REGISTRY_PATH, "utf8"), /\/api\/operations\/platform-dashboard/);

assert.throws(
    () => parsePlatformDashboardQuery({ scope: "tenant" }),
    (err) => err instanceof PlatformDashboardValidationError && err.code === "MISSING_COMPANY_ID"
);

resetMemoryTenantStore();
await seedDemoTenantsIfMissing();

const platform = await getPlatformDashboard(parsePlatformDashboardQuery({ scope: "platform" }));
assert.equal(platform.scope, "platform");
assert.ok(platform.tenantCensus?.total >= 1, "tenant census from storage directory");
assert.ok(platform.platformHealth?.status, "platform health present");
assert.equal(platform.meta.dataSource, "platform_registry");
assert.equal(platform.meta.partial, true);
assert.ok(platform.pilotSpotlight?.companyId === PRIMARY_MISSION_TENANT_ID);
assert.equal(PRIMARY_MISSION_TENANT_ID, CENTRAL_MOTORS_RTB_COMPANY_ID);

await assert.rejects(
    () => getPlatformDashboard({ scope: "tenant", companyId: "nonexistent-company-id-xyz" }),
    (err) => err instanceof PlatformDashboardValidationError && err.code === "NOT_FOUND"
);

const tenant = await getPlatformDashboard({
    scope: "tenant",
    companyId: CENTRAL_MOTORS_COMPANY_ID,
});
assert.equal(tenant.scope, "tenant");
assert.equal(tenant.meta.dataSource, "portal_hub");
assert.equal(tenant.meta.companyId, CENTRAL_MOTORS_COMPANY_ID);
assert.ok(tenant.company?.classification, "tenant classification on company block");
assert.ok(tenant.kpis, "tenant kpis from hub");

console.log("✓ MC-U-2B platform dashboard read facade verified");
