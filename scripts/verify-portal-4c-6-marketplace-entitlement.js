#!/usr/bin/env node
/**
 * PORTAL-4C-6 — Marketplace paid-pack entitlement (verifier grows per sub-gate).
 * 4C-6D: entitlement security matrix; 4C-6I-C: install integration verification.
 * Set PORTAL_ACCEPTANCE_LEAF=1 to skip nested 4A/R1/4C scripts (fast leaf).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.env.STORAGE_BACKEND = "memory";
const skipNestedRegressions = process.env.PORTAL_ACCEPTANCE_LEAF === "1";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAID_PACK = "pack-automotive-ai";
const FREE_PACK = "pack-funeral-ai";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4c-6-marketplace-entitlement");

// --- 4C-6B-1 Repository / schema ---
const schema = read("services/database/schema.js");
assert.match(schema, /MARKETPLACE_ENTITLEMENTS:\s*["']marketplaceEntitlements["']/);
assert.match(schema, /tenantMarketplaceEntitlementPath/);
assert.match(read("firestore.rules"), /marketplaceEntitlements\/\{packId\}/);
console.log("✓ 4C-6B-1 schema + rules paths");

// --- 4C-6B-2 Read API surface ---
const appJs = read("api/app.js");
assert.match(appJs, /getTenantMarketplaceEntitlement/);
assert.match(appJs, /listTenantMarketplaceEntitlements/);
assert.match(appJs, /\/api\/marketplace\/entitlements\/:companyId/);
assert.doesNotMatch(appJs, /app\.post\(\s*["']\/api\/marketplace\/entitlements/);
assert.doesNotMatch(appJs, /app\.patch\(\s*["']\/api\/marketplace\/entitlements/);
assert.doesNotMatch(appJs, /app\.delete\(\s*["']\/api\/marketplace\/entitlements/);
const reg = read("services/api/routeRegistry.js");
assert.match(reg, /entitlements\/:companyId/);
console.log("✓ 4C-6B-2 GET entitlement routes only (no tenant POST grant)");

// --- 4C-6C-B Platform grant write surface ---
assert.match(appJs, /grantMarketplaceEntitlement/);
assert.match(appJs, /\/api\/platform\/marketplace\/entitlements/);
const grantRouteBlock = appJs.match(
    /app\.post\(\s*["']\/api\/platform\/marketplace\/entitlements["'][\s\S]*?\n\);/
);
assert.ok(grantRouteBlock, "platform grant POST route must exist");
assert.match(grantRouteBlock[0], /requirePlatformAccess\(\)/);
assert.doesNotMatch(grantRouteBlock[0], /requireAuthenticatedTenantMember\(\)/);
assert.match(reg, /POST.*\/api\/platform\/marketplace\/entitlements/);
console.log("✓ 4C-6C-B platform grant route uses requirePlatformAccess (not tenant member)");

// --- 4C-6C-C Revoke / lifecycle write surface ---
assert.match(appJs, /revokeMarketplaceEntitlement/);
assert.match(appJs, /updateMarketplaceEntitlementExpiry/);
const patchBlock = appJs.match(
    /app\.patch\(\s*["']\/api\/platform\/marketplace\/entitlements\/:companyId\/:packId["'][\s\S]*?\n\);/
);
const deleteBlock = appJs.match(
    /app\.delete\(\s*["']\/api\/platform\/marketplace\/entitlements\/:companyId\/:packId["'][\s\S]*?\n\);/
);
assert.ok(patchBlock, "platform entitlement PATCH route must exist");
assert.ok(deleteBlock, "platform entitlement DELETE route must exist");
assert.match(patchBlock[0], /requirePlatformAccess\(\)/);
assert.match(deleteBlock[0], /requirePlatformAccess\(\)/);
assert.doesNotMatch(patchBlock[0], /requireAuthenticatedTenantMember\(\)/);
assert.match(reg, /PATCH.*\/api\/platform\/marketplace\/entitlements/);
assert.match(reg, /DELETE.*\/api\/platform\/marketplace\/entitlements/);
const lifecycleContract = read("scripts/PORTAL-4C-6C-lifecycle-contract.md");
assert.match(lifecycleContract, /install still requiresPayment/i);
console.log("✓ 4C-6C-C platform PATCH/DELETE lifecycle routes + contract doc");

// --- 4C-6I-B Entitlement-aware install (minimal) ---
const installer = read("services/platform/marketplaceInstaller.js");
assert.match(installer, /isEntitlementInstallEligible/);
assert.match(installer, /getMarketplaceEntitlementRepository/);
assert.match(installer, /marketplace_install_entitlement_authorized/);
assert.match(installer, /requiresPayment/);
console.log("✓ 4C-6I-B executeInstall consults entitlement + audit on authorized install");

// --- 4C-6B-3 Isolation + read behavior (memory) ---
const { assertAuthenticatedTenantMemberAccess } = await import("../services/core/tenantContext.js");
const {
    getTenantMarketplaceEntitlement,
    listTenantMarketplaceEntitlements,
} = await import("../services/platform/marketplaceEntitlementReadService.js");
const { getMarketplaceEntitlementRepository } = await import(
    "../services/platform/marketplaceEntitlementRepository.js"
);
const { runInstallWizard } = await import("../services/platform/marketplaceInstaller.js");
const { toTenantEntitlementView } = await import("../services/platform/marketplaceEntitlementModel.js");

const companyA = `portal-4c6b-a-${Date.now()}`;
const companyB = `${companyA}-other`;

const membership = async (uid, tenantId) => {
    if (uid === "owner-a" && tenantId === companyA) return { uid, companyId: tenantId, role: "owner" };
    if (uid === "owner-b" && tenantId === companyB) return { uid, companyId: tenantId, role: "owner" };
    return null;
};

const expectAccess = async (fn) => {
    try {
        await fn();
        assert.fail("expected access error");
    } catch (err) {
        return err;
    }
};

const err401 = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        { companyId: companyA, uid: null, isSuperAdmin: false, profile: { companyId: companyA, role: "owner" } },
        { getTenantMembership: membership, auditSurface: "entitlement_test" }
    )
);
assert.equal(err401.status, 401);
console.log("✓ unauthenticated tenant access → 401");

const err403wrong = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        {
            companyId: companyB,
            uid: "owner-a",
            isSuperAdmin: false,
            profile: { companyId: companyA, role: "owner" },
        },
        { getTenantMembership: membership, auditSurface: "entitlement_test" }
    )
);
assert.equal(err403wrong.status, 403);
console.log("✓ wrong-tenant member → 403");

const err403non = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        {
            companyId: companyB,
            uid: "owner-a",
            isSuperAdmin: false,
            profile: { companyId: companyA, role: "owner" },
        },
        { getTenantMembership: membership, auditSurface: "entitlement_test" }
    )
);
assert.equal(err403non.status, 403);
console.log("✓ non-member / cross-tenant → 403");

await assertAuthenticatedTenantMemberAccess(
    {
        companyId: companyA,
        uid: "owner-a",
        isSuperAdmin: false,
        profile: { companyId: companyA, role: "owner" },
    },
    { getTenantMembership: membership, auditSurface: "entitlement_test" }
);
console.log("✓ valid tenant member access allowed");

const missing = await getTenantMarketplaceEntitlement(companyA, PAID_PACK);
assert.equal(missing.entitlement.status, "none");
assert.equal(missing.entitlement.entitled, false);
console.log("✓ missing entitlement → honest none / not entitled");

const repo = await getMarketplaceEntitlementRepository();
await repo.saveEntitlement({
    companyId: companyA,
    packId: PAID_PACK,
    status: "active",
    grantedBy: { uid: "ops-test", source: "script" },
    salesReference: "INTERNAL-TEST-ONLY",
});

const afterGrant = await getTenantMarketplaceEntitlement(companyA, PAID_PACK);
assert.equal(afterGrant.entitlement.status, "active");
assert.equal(afterGrant.entitlement.entitled, true);
assert.ok(afterGrant.entitlement.grantedAt);
assert.equal(afterGrant.entitlement.grantedBy, undefined);
assert.equal(afterGrant.entitlement.salesReference, undefined);
assert.equal(afterGrant.entitlement.revokeReason, undefined);
console.log("✓ active entitlement read — tenant DTO excludes internal grant fields");

const list = await listTenantMarketplaceEntitlements(companyA);
assert.ok(list.items.some((i) => i.packId === PAID_PACK && i.entitled));
console.log("✓ list entitlements for own company");

const repo2 = await getMarketplaceEntitlementRepository();
const durable = await repo2.getEntitlement(companyA, PAID_PACK);
assert.ok(durable);
assert.equal(durable.status, "active");
console.log("✓ durability within repository singleton (restart simulation)");

const paidInstallEntitled = await runInstallWizard(companyA, PAID_PACK, {
    step: "install",
    installedBy: "4c6-entitled-test",
});
assert.notEqual(paidInstallEntitled.requiresPayment, true);
assert.equal(paidInstallEntitled.stepName, "install");
console.log("✓ active entitlement allows paid pack install (6I-B)");

await repo.saveEntitlement({
    companyId: companyA,
    packId: PAID_PACK,
    status: "revoked",
    revokeReason: "test revoke",
});
const revoked = await getTenantMarketplaceEntitlement(companyA, PAID_PACK);
assert.equal(revoked.entitlement.status, "revoked");
assert.equal(revoked.entitlement.entitled, false);
console.log("✓ revoked entitlement → not entitled");

const paidInstallRevoked = await runInstallWizard(companyA, PAID_PACK, { step: "install" });
assert.equal(paidInstallRevoked.requiresPayment, true);
console.log("✓ revoked entitlement → paid install requiresPayment");

const expiredView = toTenantEntitlementView(PAID_PACK, {
    packId: PAID_PACK,
    status: "active",
    expiresAt: "2000-01-01T00:00:00.000Z",
});
assert.equal(expiredView.status, "expired");
assert.equal(expiredView.entitled, false);
console.log("✓ expired-by-time → not entitled");

const freeInstall = await runInstallWizard(companyA, FREE_PACK, { step: "install", installedBy: "4c6b-test" });
assert.notEqual(freeInstall.requiresPayment, true);
console.log("✓ free pack install path unaffected");

// --- 4C-6C-B Platform grant + security boundary ---
function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (payload) => {
        res.body = payload;
        return res;
    };
    return res;
}

const grantPath = "/api/platform/marketplace/entitlements";
const testPlatformKey = "verify-portal-4c6-platform-grant-key";
process.env.PLATFORM_API_KEY = testPlatformKey;
const { requirePlatformAccess } = await import("../services/auth/platformAuth.js");
const platformGate = requirePlatformAccess();

const unauthGrantReq = { headers: {}, path: grantPath, method: "POST" };
const unauthGrantRes = mockRes();
let unauthGrantPassed = false;
await platformGate(unauthGrantReq, unauthGrantRes, () => {
    unauthGrantPassed = true;
});
assert.equal(unauthGrantPassed, false);
assert.equal(unauthGrantRes.statusCode, 401);
assert.equal(unauthGrantRes.body?.code, "UNAUTHORIZED");
console.log("✓ unauthenticated → platform grant denied (401)");

const keyGrantReq = {
    headers: { "x-platform-api-key": testPlatformKey },
    path: grantPath,
    method: "POST",
};
const keyGrantRes = mockRes();
let keyGrantPassed = false;
await platformGate(keyGrantReq, keyGrantRes, () => {
    keyGrantPassed = true;
});
assert.equal(keyGrantPassed, true);
assert.equal(keyGrantReq.platformAuth?.via, "api_key");
console.log("✓ platform API key → grant gate allowed");

const { createCompany } = await import("../services/tenants/companyService.js");
const { grantMarketplaceEntitlement } = await import("../services/platform/marketplaceEntitlementService.js");

const companyGrant = `portal-4c6c-${Date.now()}`;
await createCompany(companyGrant, { name: "4C-6C grant test tenant" });

const firstGrant = await grantMarketplaceEntitlement(
    { companyId: companyGrant, packId: PAID_PACK, salesReference: "OPS-GRANT-TEST" },
    { platformAuth: { via: "api_key" } }
);
assert.equal(firstGrant.idempotent, false);
assert.equal(firstGrant.entitlement.status, "active");
assert.equal(firstGrant.entitlement.grantedBy?.source, "platform_api");
assert.equal(firstGrant.entitlement.salesReference, "OPS-GRANT-TEST");
console.log("✓ authorized platform grant → durable active entitlement with audit fields");

const tenantAfterGrant = await getTenantMarketplaceEntitlement(companyGrant, PAID_PACK);
assert.equal(tenantAfterGrant.entitlement.entitled, true);
assert.equal(tenantAfterGrant.entitlement.grantedBy, undefined);
assert.equal(tenantAfterGrant.entitlement.salesReference, undefined);
console.log("✓ tenant GET after platform grant — entitled, internal fields stripped");

const repoGrant = await getMarketplaceEntitlementRepository();
const durableGrant = await repoGrant.getEntitlement(companyGrant, PAID_PACK);
assert.ok(durableGrant);
assert.equal(durableGrant.status, "active");
console.log("✓ grant durability in repository");

const secondGrant = await grantMarketplaceEntitlement(
    { companyId: companyGrant, packId: PAID_PACK, salesReference: "OPS-GRANT-RETRY" },
    { platformAuth: { via: "api_key" } }
);
assert.equal(secondGrant.idempotent, true);
assert.equal(secondGrant.entitlement.grantedAt, firstGrant.entitlement.grantedAt);
assert.equal(secondGrant.entitlement.salesReference, "OPS-GRANT-RETRY");
console.log("✓ idempotent re-grant preserves grantedAt, refreshes metadata");

const paidInstallAfterGrant = await runInstallWizard(companyGrant, PAID_PACK, {
    step: "install",
    installedBy: "6i-grant-test",
});
assert.notEqual(paidInstallAfterGrant.requiresPayment, true);
console.log("✓ paid install after platform grant allowed when entitlement active (6I-B)");

assert.doesNotMatch(
    read("services/platform/marketplaceEntitlementService.js"),
    /runInstallWizard|marketplaceInstaller|skipPayment|requiresPayment/
);
console.log("✓ grant service does not touch install authorization");

const {
    revokeMarketplaceEntitlement,
    updateMarketplaceEntitlementExpiry,
} = await import("../services/platform/marketplaceEntitlementService.js");

const companyLifecycle = `portal-4c6c-lc-${Date.now()}`;
await createCompany(companyLifecycle, { name: "4C-6C-C lifecycle tenant" });
await grantMarketplaceEntitlement(
    { companyId: companyLifecycle, packId: PAID_PACK, salesReference: "LC-GRANT" },
    { platformAuth: { via: "api_key" } }
);

const futureExpiry = new Date(Date.now() + 86400000 * 30).toISOString();
const expiryUpdate = await updateMarketplaceEntitlementExpiry(
    companyLifecycle,
    PAID_PACK,
    futureExpiry,
    { platformAuth: { via: "api_key" } }
);
assert.equal(expiryUpdate.entitlement.expiresAt, futureExpiry);
const tenantWithExpiry = await getTenantMarketplaceEntitlement(companyLifecycle, PAID_PACK);
assert.equal(tenantWithExpiry.entitlement.expiresAt, futureExpiry);
assert.equal(tenantWithExpiry.entitlement.entitled, true);
console.log("✓ PATCH expiresAt on active entitlement — tenant read reflects expiry");

const perpetual = await updateMarketplaceEntitlementExpiry(companyLifecycle, PAID_PACK, null, {
    platformAuth: { via: "api_key" },
});
assert.equal(perpetual.entitlement.expiresAt, null);
console.log("✓ PATCH expiresAt null → perpetual");

const revokedLc = await revokeMarketplaceEntitlement(
    companyLifecycle,
    PAID_PACK,
    { revokeReason: "OPS-REVOKE-TEST" },
    { platformAuth: { via: "superadmin", uid: "ops-super" } }
);
assert.equal(revokedLc.idempotent, false);
assert.equal(revokedLc.entitlement.status, "revoked");
assert.equal(revokedLc.entitlement.revokedBy?.source, "superadmin");
assert.equal(revokedLc.entitlement.revokeReason, "OPS-REVOKE-TEST");
assert.ok(revokedLc.entitlement.grantedAt);
console.log("✓ platform revoke → soft revoked with audit fields");

const tenantRevoked = await getTenantMarketplaceEntitlement(companyLifecycle, PAID_PACK);
assert.equal(tenantRevoked.entitlement.entitled, false);
assert.equal(tenantRevoked.entitlement.status, "revoked");
assert.equal(tenantRevoked.entitlement.revokeReason, undefined);
assert.equal(tenantRevoked.entitlement.revokedBy, undefined);
console.log("✓ tenant GET after revoke — not entitled, internal revoke fields stripped");

const paidInstallAfterRevoke = await runInstallWizard(companyLifecycle, PAID_PACK, { step: "install" });
assert.equal(paidInstallAfterRevoke.requiresPayment, true);
console.log("✓ paid install after revoke blocked (402 path)");

const revokeAgain = await revokeMarketplaceEntitlement(companyLifecycle, PAID_PACK, {}, {
    platformAuth: { via: "api_key" },
});
assert.equal(revokeAgain.idempotent, true);
assert.equal(revokeAgain.entitlement.status, "revoked");
console.log("✓ idempotent revoke on already-revoked entitlement");

await grantMarketplaceEntitlement(
    { companyId: companyLifecycle, packId: PAID_PACK, salesReference: "LC-REGRANT" },
    { platformAuth: { via: "api_key" } }
);
const regranted = await getTenantMarketplaceEntitlement(companyLifecycle, PAID_PACK);
assert.equal(regranted.entitlement.entitled, true);
assert.equal(regranted.entitlement.status, "active");
console.log("✓ POST re-grant after revoke restores active / entitled");

const companyDeleteRevoke = `portal-4c6c-del-${Date.now()}`;
await createCompany(companyDeleteRevoke, { name: "4C-6C DELETE revoke" });
await grantMarketplaceEntitlement(
    { companyId: companyDeleteRevoke, packId: PAID_PACK },
    { platformAuth: { via: "api_key" } }
);
const delRevoke = await revokeMarketplaceEntitlement(companyDeleteRevoke, PAID_PACK, {}, {
    platformAuth: { via: "api_key" },
});
assert.equal(delRevoke.entitlement.status, "revoked");
console.log("✓ DELETE-path revoke service (soft revoke, no doc delete)");

assert.doesNotMatch(
    read("services/platform/marketplaceEntitlementService.js"),
    /uninstall|removeInstall|deleteInstall|marketplaceInstaller/i
);
console.log("✓ lifecycle service does not uninstall packs");

// --- 4C-6I-B Install authorization boundary ---
const companyNoEnt = `portal-6ib-none-${Date.now()}`;
await createCompany(companyNoEnt, { name: "6I-B no entitlement" });
const noEntInstall = await runInstallWizard(companyNoEnt, PAID_PACK, { step: "install" });
assert.equal(noEntInstall.requiresPayment, true);
console.log("✓ no entitlement → paid install requiresPayment");

const companyExpired = `portal-6ib-exp-${Date.now()}`;
await createCompany(companyExpired, { name: "6I-B expired" });
await repo.saveEntitlement({
    companyId: companyExpired,
    packId: PAID_PACK,
    status: "active",
    expiresAt: "2000-01-01T00:00:00.000Z",
});
const expiredInstall = await runInstallWizard(companyExpired, PAID_PACK, { step: "install" });
assert.equal(expiredInstall.requiresPayment, true);
console.log("✓ expired entitlement → paid install requiresPayment");

const companyBypass = `portal-6ib-bypass-${Date.now()}`;
await createCompany(companyBypass, { name: "6I-B Policy A bypass" });
const bypassInstall = await runInstallWizard(companyBypass, PAID_PACK, {
    step: "install",
    skipPayment: true,
    installedBy: "6i-bypass-test",
});
assert.notEqual(bypassInstall.requiresPayment, true);
console.log("✓ Policy A skipPayment bypass without entitlement → install allowed");

const entitledDocBefore = await repoGrant.getEntitlement(companyGrant, PAID_PACK);
assert.equal(entitledDocBefore?.status, "active");
console.log("✓ entitlement not consumed by install (doc remains active)");

// --- 4C-6I-C Install integration verification (consolidated) ---
const RTB = "central-motors-rtb";
assert.notEqual(companyNoEnt, RTB);
assert.notEqual(companyBypass, RTB);
assert.notEqual(companyGrant, RTB);
console.log("✓ 6I-C Central Motors not used for install-integration tests");

assert.match(read("scripts/PORTAL-4C-6I-c-install-integration-verification.md"), /Installer Integration Verification/);
console.log("✓ 6I-C install integration verification charter present");

const executeInstallBlock = installer.match(/export async function executeInstall[\s\S]*?^}/m);
assert.ok(executeInstallBlock, "executeInstall block required for static 6I-C checks");
assert.match(executeInstallBlock[0], /if \(manifest\.isPaid\)/);
const paidBranch = executeInstallBlock[0].slice(
    executeInstallBlock[0].indexOf("if (manifest.isPaid)"),
    executeInstallBlock[0].indexOf("const customizations")
);
assert.match(paidBranch, /getMarketplaceEntitlementRepository/);
assert.match(paidBranch, /entitlement read failed/);
assert.match(paidBranch, /buildPaidInstallBlockedResult/);
assert.doesNotMatch(
    executeInstallBlock[0].slice(0, executeInstallBlock[0].indexOf("if (manifest.isPaid)")),
    /getMarketplaceEntitlementRepository/
);
console.log("✓ free path skips entitlement lookup; paid path fail-closed on read errors (static)");

const installRouteBlock = appJs.match(
    /app\.post\(\s*["']\/api\/marketplace\/install["'][\s\S]*?\n\}\);/
);
assert.ok(installRouteBlock);
assert.match(installRouteBlock[0], /resolveMarketplacePaymentBypass/);
assert.doesNotMatch(installRouteBlock[0], /\bentitled\b/);
assert.doesNotMatch(installer, /options\.entitled|body\.entitled/);
console.log("✓ install route strips trusted bypass only; no client entitlement hint");

const { resolveMarketplacePaymentBypass } = await import("../services/platform/marketplaceAuth.js");
const tenantBypass = resolveMarketplacePaymentBypass(
    { headers: {}, tenant: { uid: "tenant-1", isSuperAdmin: false } },
    { demoMode: true, skipPayment: true }
);
assert.equal(tenantBypass.demoMode, false);
assert.equal(tenantBypass.skipPayment, false);
const trustedBypass = resolveMarketplacePaymentBypass(
    { headers: {}, tenant: { uid: "ops-1", isSuperAdmin: true } },
    { demoMode: true, skipPayment: false }
);
assert.equal(trustedBypass.demoMode, true);
console.log("✓ tenant payment bypass stripped; superadmin Policy A preserved");

assert.doesNotMatch(read("services/platform/marketplaceVersioning.js"), /entitlement|getMarketplaceEntitlement/i);
const updateRoute = appJs.match(/app\.post\(\s*["']\/api\/marketplace\/update["'][\s\S]*?\n\}\);/);
assert.ok(updateRoute);
assert.doesNotMatch(updateRoute[0], /entitlement|getMarketplaceEntitlement/i);
console.log("✓ pack update path unaffected by entitlement checks");

const companyDemoBypass = `portal-6ic-demo-${Date.now()}`;
await createCompany(companyDemoBypass, { name: "6I-C demoMode bypass" });
const demoBypassInstall = await runInstallWizard(companyDemoBypass, PAID_PACK, {
    step: "install",
    demoMode: true,
    installedBy: "6i-demo-bypass",
});
assert.notEqual(demoBypassInstall.requiresPayment, true);
console.log("✓ Policy A demoMode bypass without entitlement → install allowed");

const companyImmutable = `portal-6ic-immut-${Date.now()}`;
await createCompany(companyImmutable, { name: "6I-C entitlement immutability" });
await grantMarketplaceEntitlement(
    { companyId: companyImmutable, packId: PAID_PACK, salesReference: "IMMUT-TEST" },
    { platformAuth: { via: "api_key" } }
);
const beforeInstallDoc = await repo.getEntitlement(companyImmutable, PAID_PACK);
const immutInstall = await runInstallWizard(companyImmutable, PAID_PACK, {
    step: "install",
    installedBy: "6i-immut-test",
});
assert.notEqual(immutInstall.requiresPayment, true);
const afterInstallDoc = await repo.getEntitlement(companyImmutable, PAID_PACK);
assert.equal(afterInstallDoc.status, beforeInstallDoc.status);
assert.equal(afterInstallDoc.grantedAt, beforeInstallDoc.grantedAt);
assert.equal(afterInstallDoc.salesReference, beforeInstallDoc.salesReference);
assert.equal(afterInstallDoc.revokedAt, beforeInstallDoc.revokedAt);
console.log("✓ entitlement doc unchanged after entitlement-authorized install");

const companyFreeNoEnt = `portal-6ic-free-${Date.now()}`;
await createCompany(companyFreeNoEnt, { name: "6I-C free without entitlement" });
const freeNoEnt = await runInstallWizard(companyFreeNoEnt, FREE_PACK, {
    step: "install",
    installedBy: "6i-free-test",
});
assert.notEqual(freeNoEnt.requiresPayment, true);
console.log("✓ free pack installs with no entitlement record");

const { MemoryMarketplaceEntitlementRepository } = await import(
    "../services/platform/memoryMarketplaceEntitlementRepository.js"
);
const companyFailClosed = `portal-6ic-fail-${Date.now()}`;
await createCompany(companyFailClosed, { name: "6I-C repo fail closed" });
await grantMarketplaceEntitlement(
    { companyId: companyFailClosed, packId: PAID_PACK },
    { platformAuth: { via: "api_key" } }
);
const proto = MemoryMarketplaceEntitlementRepository.prototype;
const origGetEntitlement = proto.getEntitlement;
proto.getEntitlement = async () => {
    throw new Error("6I-C simulated entitlement repository failure");
};
try {
    const failClosedInstall = await runInstallWizard(companyFailClosed, PAID_PACK, { step: "install" });
    assert.equal(failClosedInstall.requiresPayment, true);
    console.log("✓ entitlement repository read failure → requiresPayment (fail closed)");
} finally {
    proto.getEntitlement = origGetEntitlement;
}

console.log("✓ 4C-6I-C install integration matrix consolidated (see also 6I-B behavioral proofs above)");

// --- 4C-6D Security matrix (consolidated) ---
const lifecyclePath = "/api/platform/marketplace/entitlements/:companyId/:packId";

const unauthPatchReq = { headers: {}, path: lifecyclePath, method: "PATCH" };
const unauthPatchRes = mockRes();
let unauthPatchPassed = false;
await platformGate(unauthPatchReq, unauthPatchRes, () => {
    unauthPatchPassed = true;
});
assert.equal(unauthPatchPassed, false);
assert.equal(unauthPatchRes.statusCode, 401);
console.log("✓ unauthenticated → platform PATCH lifecycle denied (401)");

const unauthDeleteReq = { headers: {}, path: lifecyclePath, method: "DELETE" };
const unauthDeleteRes = mockRes();
let unauthDeletePassed = false;
await platformGate(unauthDeleteReq, unauthDeleteRes, () => {
    unauthDeletePassed = true;
});
assert.equal(unauthDeletePassed, false);
assert.equal(unauthDeleteRes.statusCode, 401);
console.log("✓ unauthenticated → platform DELETE revoke denied (401)");

const { ENTITLEMENT_NOT_FOUND } = await import("../services/platform/marketplaceEntitlementErrors.js");
const companyMissingRevoke = `portal-4c6d-miss-${Date.now()}`;
await createCompany(companyMissingRevoke, { name: "4C-6D missing entitlement" });
const missingRevokeErr = await expectAccess(() =>
    revokeMarketplaceEntitlement(companyMissingRevoke, PAID_PACK, {}, { platformAuth: { via: "api_key" } })
);
assert.equal(missingRevokeErr.status, 404);
assert.equal(missingRevokeErr.code, ENTITLEMENT_NOT_FOUND);
console.log("✓ revoke missing entitlement → 404 ENTITLEMENT_NOT_FOUND");

const companyInstallMatrix = `portal-4c6d-inst-${Date.now()}`;
await createCompany(companyInstallMatrix, { name: "4C-6D install matrix" });
await grantMarketplaceEntitlement(
    { companyId: companyInstallMatrix, packId: PAID_PACK },
    { platformAuth: { via: "api_key" } }
);
assert.notEqual(
    (await runInstallWizard(companyInstallMatrix, PAID_PACK, { step: "install", installedBy: "6i-matrix" }))
        .requiresPayment,
    true
);
await updateMarketplaceEntitlementExpiry(companyInstallMatrix, PAID_PACK, new Date(Date.now() + 86400000).toISOString(), {
    platformAuth: { via: "api_key" },
});
assert.notEqual(
    (await runInstallWizard(companyInstallMatrix, PAID_PACK, { step: "install", installedBy: "6i-matrix" }))
        .requiresPayment,
    true
);
await revokeMarketplaceEntitlement(companyInstallMatrix, PAID_PACK, {}, { platformAuth: { via: "api_key" } });
assert.equal((await runInstallWizard(companyInstallMatrix, PAID_PACK, { step: "install" })).requiresPayment, true);
console.log("✓ 6I-B install matrix: grant+expiry allow; revoke blocks");

const repoRestart = await getMarketplaceEntitlementRepository();
const restartDoc = await repoRestart.getEntitlement(companyInstallMatrix, PAID_PACK);
assert.ok(restartDoc);
assert.equal(restartDoc.status, "revoked");
const repoRestart2 = await getMarketplaceEntitlementRepository();
assert.deepEqual(await repoRestart2.getEntitlement(companyInstallMatrix, PAID_PACK), restartDoc);
console.log("✓ restart durability — entitlement survives repository re-fetch");

const listRevokedAudit = await listTenantMarketplaceEntitlements(companyInstallMatrix);
const listItem = listRevokedAudit.items.find((i) => i.packId === PAID_PACK);
assert.ok(listItem);
assert.equal(listItem.entitled, false);
assert.equal(listItem.revokeReason, undefined);
assert.equal(listItem.revokedBy, undefined);
assert.equal(listItem.grantedBy, undefined);
console.log("✓ list tenant DTO strips audit metadata on revoked entitlement");

assert.match(read("scripts/PORTAL-4C-6C-d-security-verification.md"), /Security matrix/);
console.log("✓ 4C-6D security verification charter present");

// --- 4C-6D Regressions ---
if (skipNestedRegressions) {
    console.log("✓ nested regressions skipped (PORTAL_ACCEPTANCE_LEAF=1)");
} else {
    const env = { ...process.env, STORAGE_BACKEND: "memory" };
    const run = (script) => execSync(`node scripts/${script}`, { cwd: ROOT, stdio: "inherit", env });
    run("verify-portal-4a-marketplace-auth.js");
    run("verify-portal-4a-r1-marketplace-security.js");
    run("verify-portal-4c-3-marketplace-payment-ux.js");
    run("verify-portal-4c-2-marketplace-lifecycle.js");
    run("verify-portal-4c-5-marketplace-pack-update-ux.js");
    console.log("✓ 4A/R1/4C-3/4C-2/4C-5 regressions passed");
}

console.log("\nPORTAL-4C-6 marketplace entitlement verification passed (through 4C-6I-C)");
