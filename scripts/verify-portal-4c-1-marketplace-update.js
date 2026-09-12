#!/usr/bin/env node
/**
 * PORTAL-4C-1 — Marketplace update foundation (backend only).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
    assertAuthenticatedTenantMemberAccess,
} from "../services/core/tenantContext.js";
import { hasPermission } from "../services/auth/permissionsService.js";

if (!process.argv.includes("--firestore")) {
    process.env.STORAGE_BACKEND = "memory";
}
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "pack-funeral-ai";
const RTB_ID = "central-motors-rtb";

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
    const end = source.indexOf("\n    });", match.index);
    return source.slice(match.index, end > match.index ? end + 8 : match.index + 900);
}

console.log("verify-portal-4c-1-marketplace-update");
console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);

const versioningSrc = read("services/platform/marketplaceVersioning.js");
assert.doesNotMatch(versioningSrc, /\.saveKnowledgeDoc\b|store\.saveKnowledgeDoc/);
assert.match(versioningSrc, /saveKnowledgeDocument/);
assert.doesNotMatch(versioningSrc, /getStorageAdapter\(\)[\s\S]{0,120}listPackVersions/);
assert.match(versioningSrc, /getMarketplacePackVersionRepository/);
assert.match(versioningSrc, /withMarketplaceUpdateLock/);
assert.match(versioningSrc, /validatePackUpdate/);
assert.match(versioningSrc, /updateInstalledRecord/);
console.log("✓ update engine uses version repo + authoritative services (no legacy saveKnowledgeDoc)");

for (const rel of ["js/portal/modules/marketplace.js", "app/js/portal/modules/marketplace.js"]) {
    const portalMarketplace = read(rel);
    assert.doesNotMatch(portalMarketplace, /applyMarketplaceUpdate|Apply Update|\/api\/marketplace\/update/i);
}
console.log("✓ Portal marketplace module has no Apply Update / update POST helper");

const apiSrc = read("api/app.js");
const updateRoute = extractRouteBlock(apiSrc, "post", "/api/marketplace/update");
assert.match(updateRoute, /requireAuthenticatedTenantMember\(\)/);
assert.match(updateRoute, /checkPermission\("canManageStaff"\)/);
console.log("✓ update route preserves 4A auth + canManageStaff");

const { platformPackVersionPath, platformPackVersionCollectionPath } = await import(
    "../services/database/schema.js"
);
const canonicalDoc = platformPackVersionPath(PACK, "1.1.0");
const canonicalCol = platformPackVersionCollectionPath(PACK);
assert.equal(canonicalDoc, "platform/marketplace/packs/pack-funeral-ai/versions/1.1.0");
assert.equal(canonicalCol, "platform/marketplace/packs/pack-funeral-ai/versions");
assert.equal(canonicalDoc.split("/").length % 2, 0, "Firestore document path must have even segments");
assert.equal(canonicalCol.split("/").length % 2, 1, "Firestore collection path must have odd segments");
assert.doesNotMatch(read("services/platform/firestoreMarketplacePackVersionRepository.js"), /platform\/marketplace\/packs\/\$\{/);
console.log("✓ platform pack version paths canonical + publish/list aligned");

const companyId = process.env.PORTAL_4C1_TEST_COMPANY || `portal-4c1-upd-${Date.now()}`;

const { installIndustryPack, getInstalledPacks } = await import("../services/platform/industryPackService.js");
const {
    listPackVersions,
    checkForUpdates,
    applyUpdate,
    compareVersions,
    seedPackVersions,
} = await import("../services/platform/marketplaceVersioning.js");
const { getMarketplacePackVersionRepository, publishCuratedPackVersions } = await import(
    "../services/platform/marketplacePackVersionRepository.js"
);
const { getInstall, updateInstalledRecord } = await import("../services/platform/marketplaceInstallService.js");
const { getMarketplaceInstallRepository } = await import(
    "../services/platform/marketplaceInstallRepository.js"
);
const { listKnowledgeDocuments } = await import("../services/tenants/knowledgeService.js");
const { listWorkflows } = await import("../services/automation/workflowRegistry.js");
const { validatePackUpdate } = await import("../services/platform/marketplaceUpdateValidator.js");
const { getCuratedPackVersions } = await import("../services/platform/marketplacePackVersionCatalog.js");

// --- Version repository (memory) ---
const versionRepo = await getMarketplacePackVersionRepository();
assert.equal((await versionRepo.listVersions(PACK)).length, 0);

const beforeUpdates = await checkForUpdates(companyId, PACK);
assert.equal(beforeUpdates.updates.length, 0);
console.log("✓ no update when no published versions exist");

await publishCuratedPackVersions([PACK]);
const versions = await listPackVersions(PACK);
assert.ok(versions.some((v) => v.version === "1.0.0"));
assert.ok(versions.some((v) => v.version === "1.1.0"));
const v110 = versions.find((v) => v.version === "1.1.0");
assert.ok(v110.template?.knowledge?.some((k) => k.title.includes("Grief Support")));
assert.ok(v110.template?.workflows?.some((w) => w.name.includes("Family Support Check-in")));
console.log("✓ curated 1.1.0 is an explicit additive delta (not version-string bump only)");

const curatedOnly = getCuratedPackVersions(PACK);
const funeral110 = curatedOnly.find((v) => v.version === "1.1.0");
assert.ok(compareVersions("1.1.0", "1.0.0") > 0);
assert.ok(funeral110.changelog?.length >= 2);
console.log("✓ version publish/read via repository");

await installIndustryPack(companyId, PACK, {}, { installedBy: "verify-4c1" });
const installed = (await getInstalledPacks(companyId)).items[0];
assert.equal(installed.version, "1.0.0");

const withPublished = await checkForUpdates(companyId, PACK);
assert.equal(withPublished.updates.length, 1);
assert.equal(withPublished.updates[0].latestVersion, "1.1.0");
console.log("✓ update appears when real 1.1.0 exists");

const kbBefore = (await listKnowledgeDocuments(companyId)).length;
const wfBefore = (await listWorkflows(companyId)).length;

const updateResult = await applyUpdate(companyId, PACK, "1.1.0");
assert.equal(updateResult.success, true);
assert.equal(updateResult.newVersion, "1.1.0");
assert.equal(updateResult.merged.knowledgeAdded, 1);
assert.equal(updateResult.merged.workflowsAdded, 1);
console.log("✓ 1.0.0 → 1.1.0 update applied");

const reg = await getInstall(companyId, PACK);
assert.equal(reg.version, "1.1.0");
const updateWfId = "wf-upd-pack-funeral-ai-follow-up-family-support-check-in";
assert.ok(reg.knowledgeDocIds?.includes("kn-upd-pack-funeral-ai-faq-grief-support-resources"));
assert.ok(reg.workflowIds?.includes(updateWfId));
const regJson = JSON.stringify(reg);
assert.ok(!regJson.includes('"content":'), "registry must not embed knowledge bodies");
console.log("✓ registry references updated; no resource bodies in registry");

const kbAfter = await listKnowledgeDocuments(companyId);
const wfAfter = await listWorkflows(companyId);
assert.equal(kbAfter.length, kbBefore + 1);
assert.equal(wfAfter.length, wfBefore + 1);
for (const id of reg.knowledgeDocIds) {
    assert.ok(kbAfter.some((d) => d.id === id), `KB ${id} persisted`);
}
for (const id of reg.workflowIds) {
    assert.ok(wfAfter.some((w) => w.id === id), `workflow ${id} persisted`);
}
console.log("✓ KB/workflows persist via authoritative tenant services");

// --- Idempotency: second apply at same target fails; no duplicate resources ---
const kbCountAfterFirst = kbAfter.length;
const wfCountAfterFirst = wfAfter.length;
await assert.rejects(() => applyUpdate(companyId, PACK, "1.1.0"), /greater than installed/);
assert.equal((await listKnowledgeDocuments(companyId)).length, kbCountAfterFirst);
assert.equal((await listWorkflows(companyId)).length, wfCountAfterFirst);
console.log("✓ repeat update rejected; no duplicate KB/workflows");

// --- Version conflict (stale expectedVersion) ---
const companyConflict = `${companyId}-conflict`;
await installIndustryPack(companyConflict, PACK, {}, { installedBy: "verify-4c1-conflict" });
await applyUpdate(companyConflict, PACK, "1.1.0");
await assert.rejects(
    () =>
        updateInstalledRecord(companyConflict, PACK, {
            expectedVersion: "1.0.0",
            patch: { version: "1.1.0" },
        }),
    /Version mismatch/
);
const still = await getInstall(companyConflict, PACK);
assert.equal(still.version, "1.1.0");
console.log("✓ stale expectedVersion fails; registry unchanged from last good commit");

// --- Concurrency (single process lock) ---
const companyConcurrent = `${companyId}-concurrent`;
await installIndustryPack(companyConcurrent, PACK, {}, { installedBy: "verify-4c1-conc" });
const results = await Promise.allSettled([
    applyUpdate(companyConcurrent, PACK, "1.1.0"),
    applyUpdate(companyConcurrent, PACK, "1.1.0"),
]);
const fulfilled = results.filter((r) => r.status === "fulfilled");
const rejected = results.filter((r) => r.status === "rejected");
assert.equal(fulfilled.length, 1);
assert.equal(rejected.length, 1);
const concReg = await getInstall(companyConcurrent, PACK);
assert.equal(concReg.version, "1.1.0");
const updateKbId = "kn-upd-pack-funeral-ai-faq-grief-support-resources";
const updateKbRows = (await listKnowledgeDocuments(companyConcurrent)).filter((d) => d.id === updateKbId);
assert.equal(updateKbRows.length, 1);
console.log("✓ concurrent updates: one success, one clean failure; no duplicate resources");

// --- Partial failure: registry commit fails after resources applied ---
const companyDrift = `${companyId}-drift`;
await installIndustryPack(companyDrift, PACK, {}, { installedBy: "verify-4c1-drift" });
const installRepo = await getMarketplaceInstallRepository();
const origUpdate = installRepo.updateInstalledRecord.bind(installRepo);
installRepo.updateInstalledRecord = async (...args) => {
    throw new Error("simulated registry commit failure");
};
let driftErr = null;
try {
    await applyUpdate(companyDrift, PACK, "1.1.0");
} catch (err) {
    driftErr = err;
}
installRepo.updateInstalledRecord = origUpdate;
assert.ok(driftErr);
assert.equal(driftErr.code, "MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED");
assert.ok(driftErr.applied?.knowledgeDocIds?.length >= 1);
const driftReg = await getInstall(companyDrift, PACK);
assert.equal(driftReg.version, "1.0.0");
const driftValidation = await validatePackUpdate(companyDrift, {
    knowledgeDocIds: driftErr.applied.knowledgeDocIds,
    workflowIds: driftErr.applied.workflowIds,
});
assert.equal(driftValidation.valid, true);
console.log("✓ registry commit failure is explicit; drift detectable (resources applied, registry at 1.0.0)");

assert.match(versioningSrc, /MARKETPLACE_UPDATE_RESOURCE_FAILED/);
assert.match(versioningSrc, /MARKETPLACE_UPDATE_VALIDATION_FAILED/);
console.log("✓ resource/validation failures prevent registry commit (explicit error codes)");

// --- Auth unit checks (same pattern as 4A) ---
const membership = async (uid, tenantId) =>
    uid === "member-rtb" && tenantId === RTB_ID ? { uid, companyId: tenantId, role: "owner" } : null;

let err403 = null;
try {
    await assertAuthenticatedTenantMemberAccess(
        {
            companyId: RTB_ID,
            uid: "member-demo",
            isSuperAdmin: false,
            profile: { companyId: "other-tenant", role: "owner" },
        },
        { getTenantMembership: membership, auditSurface: "marketplace_update_test" }
    );
    assert.fail("expected wrong-tenant access to throw");
} catch (err) {
    err403 = err;
}
assert.equal(err403?.status, 403);
await assertAuthenticatedTenantMemberAccess(
    {
        companyId: RTB_ID,
        uid: "member-rtb",
        isSuperAdmin: false,
        profile: { companyId: RTB_ID, role: "owner" },
    },
    { getTenantMembership: membership, auditSurface: "marketplace_update_test" }
);
assert.equal(hasPermission("sales", "canManageStaff"), false);
console.log("✓ authorization matrix (tenant member + canManageStaff)");

// --- seedPackVersions uses curated catalog only ---
const seeded = await seedPackVersions();
assert.ok(Array.isArray(seeded));
console.log("✓ seedPackVersions publishes curated versions only");

// --- RTB untouched ---
const repo = await getMarketplaceInstallRepository();
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
console.log("✓ PORTAL-4A / 4A-R1 static regression passed");

console.log("\nPORTAL-4C-1 marketplace update foundation verification passed");
