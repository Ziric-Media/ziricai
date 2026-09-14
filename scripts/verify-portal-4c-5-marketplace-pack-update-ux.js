#!/usr/bin/env node
/**
 * PORTAL-4C-5 — Marketplace pack update UX (verifier grows per sub-gate).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.STORAGE_BACKEND = "memory";
process.env.PORTAL_ACCEPTANCE_LEAF = process.env.PORTAL_ACCEPTANCE_LEAF || "1";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "js/portal/api.js";
const MP = "js/portal/modules/marketplace.js";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-5-marketplace-pack-update-ux");

const api = read(API);
const mp = read(MP);

// --- 4C-5B API contract ---
assert.match(api, /export async function applyPackUpdate\s*\(\s*companyId\s*,\s*packId\s*,\s*targetVersion\s*\)/);
const fnStart = api.indexOf("export async function applyPackUpdate");
const fnEnd = api.indexOf("export async function installMarketplacePack", fnStart);
const applyBody = api.slice(fnStart, fnEnd);
assert.match(applyBody, /request\s*\(\s*['"]\/api\/marketplace\/update['"]/);
assert.match(applyBody, /JSON\.stringify\(\s*\{\s*companyId\s*,\s*packId\s*,\s*targetVersion\s*\}\s*\)/);
assert.doesNotMatch(applyBody, /invalidateHub|prefetchHub/);
console.log("✓ 4C-5B applyPackUpdate POST contract");

// --- 4C-5C Apply UX (installed details only) ---
assert.match(mp, /import[\s\S]*applyPackUpdate[\s\S]*from\s+['"]\.\.\/api\.js['"]/);
assert.match(mp, /can\s*\(\s*state\.profile\?\.role\s*,\s*['"]canManageStaff['"]\s*\)/);
assert.doesNotMatch(mp, /enabled in a later release/i);
console.log("✓ imports applyPackUpdate; canManageStaff gate; legacy lock copy removed");

const installedStart = mp.indexOf("function openInstalledDetailModal");
const detailStart = mp.indexOf("async function openDetailModal");
const wizardStart = mp.indexOf("function openWizardModal");
assert.ok(installedStart >= 0 && detailStart > installedStart && wizardStart > detailStart);
const installedBody = mp.slice(installedStart, detailStart);
const catalogDetailBody = mp.slice(detailStart, wizardStart);

assert.match(installedBody, /wireInstalledPackUpdateForm/);
assert.match(installedBody, /renderInstalledPackUpdateSection/);
assert.match(mp, /mp-pack-update-wrap/);
assert.match(mp, /mp-pack-update-confirm/);
assert.doesNotMatch(catalogDetailBody, /applyPackUpdate|mp-pack-update-apply|wireInstalledPackUpdateForm/);
assert.doesNotMatch(mp, /\/api\/marketplace\/update/);
console.log("✓ update apply wired in installed-detail only; no raw update POST in module");

const wireStart = mp.indexOf("function wireInstalledPackUpdateForm");
const wireEnd = mp.indexOf("function wireInstalledPackReviewForm", wireStart);
assert.ok(wireEnd > wireStart);
const wireBody = mp.slice(wireStart, wireEnd);

assert.match(wireBody, /let applying\s*=\s*false|applying\s*=\s*true/);
assert.match(wireBody, /if\s*\(\s*applying\s*\)\s*return/);
assert.match(wireBody, /applyPackUpdate\s*\(\s*companyId\s*,\s*packId\s*,\s*targetVersion\s*\)/);
assert.match(wireBody, /res\.data\?\.success\s*===\s*true/);
assert.doesNotMatch(wireBody, /record\.version\s*=|lifecycleByPackId\.set[\s\S]*newVersion/);
console.log("✓ in-flight guard; success requires res.data.success; no optimistic version bump");

// --- 4C-5D Authoritative refresh ---
assert.match(mp, /async function refreshMarketplaceAuthoritativeState/);
assert.match(mp, /fetchMarketplaceLifecycle\(companyId\)/);
assert.match(mp, /fetchPackUpdates\(companyId\)/);
assert.match(mp, /invalidateHub\(\)/);
assert.match(mp, /prefetchHub\(companyId/);
assert.match(mp, /id="mpLifecycleMount"|#mpLifecycleMount/);
assert.match(mp, /patchMarketplaceLifecycleMount/);
assert.match(mp, /syncInstalledDetailLifecycleMeta/);
assert.match(
  wireBody,
  /if\s*\(\s*res\.data\?\.success\s*===\s*true\s*\)[\s\S]*refreshMarketplaceAuthoritativeState/,
);
assert.match(mp, /could not refresh installed data/i);
const afterTerminal = wireBody.slice(wireBody.indexOf("mapped.terminal"));
assert.doesNotMatch(afterTerminal, /refreshMarketplaceAuthoritativeState/);
console.log("✓ post-success authoritative refresh; hub invalidation; no refresh on failure paths");

assert.match(mp, /mapInstalledPackUpdateError/);
assert.match(mp, /MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED|MARKETPLACE_VERSION_CONFLICT/);
assert.match(mp, /status\s*===\s*409/);
assert.match(mp, /MARKETPLACE_UPDATE_RESOURCE_FAILED/);
assert.match(mp, /MARKETPLACE_UPDATE_VALIDATION_FAILED/);
assert.match(mp, /status\s*===\s*503/);
assert.match(mp, /renderInstalledPackUpdateRegistryConflictBlock/);
assert.match(mp, /mp-pack-update-permission/);
console.log("✓ honest error mapping including 409 registry conflict and permission read-only note");

console.log("\nPORTAL-4C-5 marketplace pack update UX verification passed (4C-5B + 4C-5C + 4C-5D)");
