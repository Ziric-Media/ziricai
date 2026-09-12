#!/usr/bin/env node
/**
 * PORTAL-4C-2 — Marketplace install lifecycle read API + Portal visibility (local).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

if (!process.argv.includes("--firestore")) {
    process.env.STORAGE_BACKEND = "memory";
}
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "pack-funeral-ai";
const RTB_ID = "central-motors-rtb";

const LIFECYCLE_ALLOWED = new Set([
    "packId",
    "packName",
    "status",
    "version",
    "installedAt",
    "updatedAt",
    "failedAt",
    "lastError",
    "installAttemptId",
    "installedCompletedAt",
    "installingStale",
]);

const FORBIDDEN_LIFECYCLE_KEYS = [
    "template",
    "knowledge",
    "workflows",
    "resources",
    "manifest",
    "body",
    "content",
];

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function extractRouteBlock(source, method, pathPattern) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${pathPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route: app.${method}("${pathPattern}")`);
    const slice = source.slice(match.index);
    const close = slice.search(/\n\}\);/);
    assert.ok(close >= 0, `Could not close route handler for ${pathPattern}`);
    return slice.slice(0, close + 4);
}

console.log("verify-portal-4c-2-marketplace-lifecycle");
console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);

const apiSrc = read("api/app.js");
const installedRoute = extractRouteBlock(apiSrc, "get", "/api/marketplace/installed/:companyId");
assert.match(installedRoute, /getInstalledPacks/);
assert.doesNotMatch(installedRoute, /listMarketplaceInstallLifecycle/);
console.log("✓ GET installed unchanged (getInstalledPacks only)");

const lifecycleRoute = extractRouteBlock(apiSrc, "get", "/api/marketplace/lifecycle/:companyId");
assert.match(lifecycleRoute, /requireAuthenticatedTenantMember\(\)/);
assert.match(lifecycleRoute, /listMarketplaceInstallLifecycle/);
console.log("✓ lifecycle route tenant auth + listMarketplaceInstallLifecycle");

assert.match(read("services/api/routeRegistry.js"), /\/api\/marketplace\/lifecycle\/:companyId/);
console.log("✓ routeRegistry documents lifecycle endpoint");

for (const rel of ["js/portal/api.js", "app/js/portal/api.js"]) {
    assert.match(read(rel), /fetchMarketplaceLifecycle/);
}
console.log("✓ Portal api exposes fetchMarketplaceLifecycle");

for (const rel of ["js/portal/modules/marketplace.js", "app/js/portal/modules/marketplace.js"]) {
    const src = read(rel);
    assert.match(src, /fetchMarketplaceLifecycle/);
    assert.doesNotMatch(src, /applyMarketplaceUpdate|Apply Update|\/api\/marketplace\/update/i);
    assert.match(src, /INSTALL_IN_PROGRESS/);
    assert.match(src, /402|PAYMENT_REQUIRED/);
    assert.match(src, /mp-read-only-note|read-only/i);
    assert.match(src, /installMarketplacePack/);
    assert.doesNotMatch(src, /demoLifecycle|fakeLifecycle|MOCK_LIFECYCLE/i);
}
console.log("✓ Portal lifecycle UI wired; no Apply Update; wizard error distinctions; no fake lifecycle");

const companyId = process.env.PORTAL_4C2_TEST_COMPANY || `portal-4c2-lc-${Date.now()}`;

const { listMarketplaceInstallLifecycle } = await import(
    "../services/platform/marketplaceInstallLifecycle.js"
);
const { claimInstall, failInstall, listInstalled } = await import(
    "../services/platform/marketplaceInstallService.js"
);
const { getInstalledPacks, installIndustryPack } = await import(
    "../services/platform/industryPackService.js"
);
const { getMarketplaceInstallRepository } = await import(
    "../services/platform/marketplaceInstallRepository.js"
);
const { publishCuratedPackVersions } = await import(
    "../services/platform/marketplacePackVersionRepository.js"
);
const { checkForUpdates } = await import("../services/platform/marketplaceVersioning.js");

const empty = await listMarketplaceInstallLifecycle(companyId);
assert.equal(empty.companyId, companyId);
assert.deepEqual(empty.summary, { installing: 0, failed: 0, installed: 0 });
assert.deepEqual(empty.items, []);
console.log("✓ empty lifecycle response shape");

const claim = await claimInstall(companyId, PACK, { installedBy: "4c2-verify" });
assert.equal(claim.outcome, "claimed");

const mid = await listMarketplaceInstallLifecycle(companyId);
assert.equal(mid.summary.installing, 1);
const installingItem = mid.items.find((i) => i.packId === PACK);
assert.ok(installingItem);
assert.equal(installingItem.status, "installing");
assert.equal(installingItem.installingStale, false);
for (const key of Object.keys(installingItem)) {
    assert.ok(LIFECYCLE_ALLOWED.has(key), `unexpected lifecycle field: ${key}`);
}
for (const bad of FORBIDDEN_LIFECYCLE_KEYS) {
    assert.ok(!Object.prototype.hasOwnProperty.call(installingItem, bad));
}
console.log("✓ installing visible in lifecycle (metadata only)");

const installedOnly = await listInstalled(companyId);
assert.equal(installedOnly.length, 0);
const { items: installedPacksItems } = await getInstalledPacks(companyId);
assert.equal(installedPacksItems.length, 0);
console.log("✓ listInstalled / getInstalledPacks exclude installing");

const repo = await getMarketplaceInstallRepository();
const docKey = `${companyId}::${PACK}`;
assert.ok(repo.docs?.has(docKey), "memory repo expected for stale test");
const rec = repo.docs.get(docKey);
rec.updatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
repo.docs.set(docKey, rec);

const staleView = await listMarketplaceInstallLifecycle(companyId);
const staleItem = staleView.items.find((i) => i.packId === PACK);
assert.equal(staleItem.status, "installing");
assert.equal(staleItem.installingStale, true);
console.log("✓ stale installing flagged without changing stored status");

await failInstall(companyId, PACK, claim.installAttemptId, "Simulated install failure for 4C-2");
const failedView = await listMarketplaceInstallLifecycle(companyId);
assert.equal(failedView.summary.failed, 1);
assert.equal(failedView.summary.installing, 0);
const failedItem = failedView.items.find((i) => i.packId === PACK);
assert.equal(failedItem.status, "failed");
assert.match(failedItem.lastError, /Simulated install failure/);
assert.ok(failedItem.failedAt);
console.log("✓ failed visible with lastError");

const retryClaim = await claimInstall(companyId, PACK, { installedBy: "4c2-retry" });
assert.equal(retryClaim.outcome, "claimed");
assert.notEqual(retryClaim.installAttemptId, claim.installAttemptId);
console.log("✓ retry uses existing claimInstall path (new attempt after failed)");

const retryRec = repo.docs.get(docKey);
retryRec.updatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
repo.docs.set(docKey, retryRec);

await installIndustryPack(companyId, PACK, { installedBy: "4c2-complete" });
const afterInstall = await listMarketplaceInstallLifecycle(companyId);
assert.equal(afterInstall.summary.installed, 1);
const installedItem = afterInstall.items.find((i) => i.packId === PACK);
assert.equal(installedItem.status, "installed");
assert.ok(installedItem.installedCompletedAt || installedItem.updatedAt);

const { items: afterInstalledList } = await getInstalledPacks(companyId);
assert.equal(afterInstalledList.length, 1);
assert.equal(afterInstalledList[0].packId, PACK);
assert.equal(afterInstalledList[0].status, "installed");
console.log("✓ installed records returned via getInstalledPacks after successful install");

await publishCuratedPackVersions([PACK]);
const updates = await checkForUpdates(companyId, PACK);
assert.ok(updates.updates?.length >= 1, "expected update when curated versions published");
const upd = updates.updates.find((u) => u.packId === PACK);
assert.ok(upd);
assert.equal(upd.latestVersion, "1.1.0");
assert.ok(Array.isArray(upd.changelog) && upd.changelog.length >= 1);
console.log("✓ update availability + changelog from version repository");

if (repo.docs) {
    for (const key of repo.docs.keys()) {
        assert.ok(!key.startsWith(`${RTB_ID}::`), "must not write RTB registry in verify");
    }
}

execSync("node scripts/verify-portal-4a-marketplace-auth.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4a-r1-marketplace-security.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4b-marketplace-registry.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4c-1-marketplace-update.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
console.log("✓ PORTAL-4A / 4A-R1 / 4B / 4C-1 regressions passed");

console.log("\nPORTAL-4C-2 marketplace lifecycle verification passed");
