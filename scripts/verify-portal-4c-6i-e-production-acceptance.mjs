#!/usr/bin/env node
/**
 * PORTAL-4C-6I-E — Production acceptance (entitlement lifecycle + entitled install matrix).
 * Prepared / aligned at PORTAL-4C-6I-D (replaces pre-6I frozen-402 6C-E install expectations).
 *
 * Disposable tenant only — never central-motors-rtb.
 *
 *   npx @railway/cli run node scripts/verify-portal-4c-6i-e-production-acceptance.mjs
 *
 * After API deploy (strict HTTP):
 *   PORTAL_6I_E_STRICT_HTTP=1 npx @railway/cli run node scripts/verify-portal-4c-6i-e-production-acceptance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
const PAID_PACK = "pack-automotive-ai";
const STRICT_HTTP = process.env.PORTAL_6I_E_STRICT_HTTP === "1";
const API_BASE = (
    process.env.PORTAL_6I_E_API_BASE ||
    process.env.PORTAL_6C_E_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");
const PORTAL_ORIGIN = (
    process.env.PORTAL_6I_E_APP_ORIGIN || process.env.PORTAL_6C_E_APP_ORIGIN || "https://app.ziricai.com"
).replace(/\/$/, "");

const testCo = process.env.PORTAL_6I_E_TEST_COMPANY || process.env.PORTAL_6C_E_TEST_COMPANY || `portal-6ie-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_6I_E_SMOKE_PASSWORD ||
    process.env.PORTAL_6C_E_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4B_TEST_COMPANY = testCo;
process.env.PORTAL_4B_SMOKE_PASSWORD = smokePassword;

const resultsDir = join(ROOT, "test-results");
const evidence = {
    gate: "PORTAL-4C-6I-E-production-acceptance",
    evolution: "6I-D-aligned (supersedes 6C-E frozen install expectations)",
    strictHttp: STRICT_HTTP,
    apiBase: API_BASE,
    portalOrigin: PORTAL_ORIGIN,
    testCompany: testCo,
    rtbUntouched: RTB,
    acceptanceMode: null,
    platformEntitlementHttpDeployed: null,
    platformHttpAuthVia: null,
    installHttpIntegrationDeployed: null,
    steps: {},
    http: {},
    service: {},
    firestore: {},
    installMatrix: {},
    commercialAccessProof: null,
    limitations: [],
};

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

function writeEvidence() {
    mkdirSync(resultsDir, { recursive: true });
    const payload = `${JSON.stringify(evidence, null, 2)}\n`;
    writeFileSync(join(resultsDir, "portal-4c-6i-production-acceptance.json"), payload);
    writeFileSync(join(resultsDir, "portal-4c-6c-production-acceptance.json"), payload);
}

function stop(msg, detail) {
    evidence.failure = { message: msg, detail };
    writeEvidence();
    console.error("STOP:", msg, detail ?? "");
    process.exit(1);
}

async function firebaseToken(email, password) {
    const { PRODUCTION_WEB_CONFIG } = await import("../js/firebase-config.js");
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );
    const data = await res.json();
    if (!data.idToken) throw new Error(data.error?.message || "Firebase auth failed");
    return { idToken: data.idToken, uid: data.localId };
}

async function tenantApi(method, path, { token, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 800) };
    }
    return { status: res.status, data };
}

let platformHttpAuthCache = null;

/** Production platform routes: PLATFORM_API_KEY or superadmin Bearer (password or Admin custom token). */
async function resolvePlatformHttpAuth() {
    if (platformHttpAuthCache) return platformHttpAuthCache;

    const platformKey = process.env.PLATFORM_API_KEY || "";
    if (platformKey) {
        platformHttpAuthCache = { via: "api_key", headers: { "x-platform-api-key": platformKey } };
        return platformHttpAuthCache;
    }

    const superEmail =
        process.env.PORTAL_6I_E_SUPERADMIN_EMAIL ||
        process.env.PORTAL_PLATFORM_SUPERADMIN_EMAIL ||
        "admin@ziricai.com";
    const superPassword =
        process.env.PORTAL_6I_E_SUPERADMIN_PASSWORD || process.env.PORTAL_PLATFORM_SUPERADMIN_PASSWORD || "";
    if (superPassword) {
        const { idToken } = await firebaseToken(superEmail, superPassword);
        platformHttpAuthCache = { via: "superadmin_password", headers: { Authorization: `Bearer ${idToken}` } };
        return platformHttpAuthCache;
    }

    const { PRODUCTION_WEB_CONFIG } = await import("../js/firebase-config.js");
    const { getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
    if (!getAdminFirestore()) {
        stop("Firebase Admin required for superadmin custom-token platform HTTP auth");
    }
    const adminMod = await import("firebase-admin");
    const user = await adminMod.default.auth().getUserByEmail(superEmail);
    const customToken = await adminMod.default.auth().createCustomToken(user.uid);
    const exchange = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${PRODUCTION_WEB_CONFIG.apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        }
    );
    const exchangeData = await exchange.json();
    if (!exchangeData.idToken) {
        stop("Platform HTTP auth unavailable", {
            hint: "Set PLATFORM_API_KEY on Railway and in run env, or PORTAL_6I_E_SUPERADMIN_PASSWORD",
            firebase: exchangeData.error?.message,
        });
    }
    platformHttpAuthCache = {
        via: "superadmin_custom_token",
        headers: { Authorization: `Bearer ${exchangeData.idToken}` },
    };
    return platformHttpAuthCache;
}

async function platformApi(method, path, { body } = {}) {
    const auth = await resolvePlatformHttpAuth();
    const headers = {
        "Content-Type": "application/json",
        ...auth.headers,
    };
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 800) };
    }
    return { status: res.status, data };
}

async function httpPaidInstall(token, companyId) {
    return tenantApi("POST", "/api/marketplace/install", {
        token,
        body: { companyId, packId: PAID_PACK, step: "install" },
    });
}

async function assertPaidInstallBlocked(token, companyId, label) {
    const res = await httpPaidInstall(token, companyId);
    assert.equal(res.status, 402, `${label}: expected 402, got ${res.status}`);
    assert.equal(res.data?.code, "PAYMENT_REQUIRED", `${label}: code`);
    assert.equal(res.data?.requiresPayment, true, `${label}: requiresPayment`);
    evidence.installMatrix[label] = {
        blocked: true,
        status: res.status,
        code: res.data?.code,
        via: "http",
    };
    return res;
}

async function assertPaidInstallAllowed(token, companyId, label, { installedBy = "6i-e-accept" } = {}) {
    const httpRes = await httpPaidInstall(token, companyId);
    if (httpRes.status === 402 && httpRes.data?.requiresPayment) {
        if (STRICT_HTTP) {
            stop(`${label}: HTTP install still 402 after entitlement — deploy 6I-B installer to API_BASE`);
        }
        evidence.installHttpIntegrationDeployed = false;
        evidence.limitations.push(
            `${label}: API_BASE install not entitlement-aware yet; positive path via service-layer runInstallWizard`
        );
        const { runInstallWizard } = await import("../services/platform/marketplaceInstaller.js");
        const local = await runInstallWizard(companyId, PAID_PACK, { step: "install", installedBy });
        assert.notEqual(local.requiresPayment, true, `${label}: service install must succeed`);
        evidence.installMatrix[label] = { blocked: false, via: "service_runInstallWizard" };
        evidence.service.installSuccess = { label, stepName: local.stepName, alreadyInstalled: local.alreadyInstalled };
        return { via: "service", result: local };
    }
    evidence.installHttpIntegrationDeployed = true;
    assert.ok(httpRes.status === 201 || httpRes.status === 200, `${label}: expected 201/200, got ${httpRes.status}`);
    evidence.installMatrix[label] = { blocked: false, status: httpRes.status, via: "http" };
    evidence.http.installSuccess = { label, status: httpRes.status, alreadyInstalled: httpRes.data?.alreadyInstalled };
    return { via: "http", result: httpRes.data };
}

console.log("verify-portal-4c-6i-e-production-acceptance");
console.log("testCompany", testCo, "strictHttp", STRICT_HTTP);
assert.notEqual(testCo, RTB, "disposable tenant must not be RTB");

const installer = read("services/platform/marketplaceInstaller.js");
assert.match(installer, /isEntitlementInstallEligible/);
assert.match(installer, /getMarketplaceEntitlementRepository/);
assert.match(installer, /marketplace_install_entitlement_authorized/);
step("6I_B_installer_static", { entitlementAware: true });

assert.match(read("scripts/PORTAL-4C-6I-d-production-verification.md"), /Production Verification Preparation/);
step("6I_D_contract_present", true);

const { hasAdminCredentials, getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
const { tenantMarketplaceEntitlementPath, tenantMarketplaceInstallPath } = await import(
    "../services/database/schema.js"
);

if (!hasAdminCredentials()) {
    evidence.limitations.push("NO_ADMIN_CREDENTIALS — run via railway run with Firebase Admin");
    stop("Firebase Admin required");
}

const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 6I-E Entitlement ${testCo}`,
});
const { idToken: token, uid } = await firebaseToken(actor.email, smokePassword);
step("disposable_actor", { email: actor.email, uid, companyId: testCo });

mkdirSync(resultsDir, { recursive: true });
const credPath = join(resultsDir, "portal-6ie-disposable-credentials.json");
writeFileSync(
    credPath,
    `${JSON.stringify(
        {
            companyId: testCo,
            email: actor.email,
            uid,
            password: smokePassword,
            provisionedAt: new Date().toISOString(),
        },
        null,
        2
    )}\n`,
    "utf8"
);
evidence.credentialsFile = credPath;

const {
    grantMarketplaceEntitlement,
    revokeMarketplaceEntitlement,
    updateMarketplaceEntitlementExpiry,
} = await import("../services/platform/marketplaceEntitlementService.js");
const { getTenantMarketplaceEntitlement } = await import(
    "../services/platform/marketplaceEntitlementReadService.js"
);

const platformCtx = { platformAuth: { via: "api_key" } };

async function tenantEntitlementView(companyId = testCo) {
    const data = await getTenantMarketplaceEntitlement(companyId, PAID_PACK);
    return data.entitlement;
}

async function grantEntitlement(companyId, salesReference) {
    if (httpEntitlementsLive) {
        const grant = await platformApi("POST", "/api/platform/marketplace/entitlements", {
            body: { companyId, packId: PAID_PACK, salesReference },
        });
        if (grant.status === 404) stop("Platform grant route not found on API_BASE", grant.data);
        assert.ok(grant.status === 201 || grant.status === 200);
        return { via: "http", data: grant.data };
    }
    const result = await grantMarketplaceEntitlement(
        { companyId, packId: PAID_PACK, salesReference },
        platformCtx
    );
    assert.equal(result.entitlement.status, "active");
    return { via: "service", data: result };
}

const initialGetHttp = await tenantApi("GET", `/api/marketplace/entitlements/${testCo}/${PAID_PACK}`, { token });
const httpEntitlementsLive = initialGetHttp.status === 200;
evidence.platformEntitlementHttpDeployed = httpEntitlementsLive;
if (httpEntitlementsLive) {
    evidence.platformHttpAuthVia = (await resolvePlatformHttpAuth()).via;
}
evidence.acceptanceMode = httpEntitlementsLive
    ? "production_http_entitlements_preferred"
    : "production_firestore_service_layer_entitlements";

if (httpEntitlementsLive) {
    assert.equal(initialGetHttp.data?.entitlement?.entitled, false);
    evidence.http.initialGet = initialGetHttp.data?.entitlement;
} else {
    assert.equal(initialGetHttp.status, 404);
    evidence.limitations.push(
        "Entitlement HTTP routes not on API_BASE — grant/revoke/read via service layer on production Firestore"
    );
    const initialView = await tenantEntitlementView();
    assert.equal(initialView.entitled, false);
    evidence.service.initialGet = initialView;
}
step("1_initial_not_entitled", evidence.http.initialGet || evidence.service?.initialGet);

if (STRICT_HTTP && !httpEntitlementsLive) {
    stop("PORTAL_6I_E_STRICT_HTTP=1 requires entitlement HTTP routes on API_BASE (deploy 6C-B/C)");
}

await assertPaidInstallBlocked(token, testCo, "no_entitlement");
step("1_paid_install_402_no_entitlement", evidence.installMatrix.no_entitlement);

const salesRef = `6I-E-${Date.now()}`;
const grantMeta = await grantEntitlement(testCo, salesRef);
step("2_platform_grant", { companyId: testCo, packId: PAID_PACK, via: grantMeta.via, salesReference: salesRef });
if (STRICT_HTTP) assert.equal(grantMeta.via, "http", "STRICT_HTTP requires platform grant via HTTP");

const afterGrantView = httpEntitlementsLive
    ? (await tenantApi("GET", `/api/marketplace/entitlements/${testCo}/${PAID_PACK}`, { token })).data?.entitlement
    : await tenantEntitlementView();
assert.equal(afterGrantView.entitled, true);
assert.equal(afterGrantView.status, "active");
assert.equal(afterGrantView.grantedBy, undefined);
step("2_tenant_get_entitled", afterGrantView);

const db = getAdminFirestore();
const entitlementPath = tenantMarketplaceEntitlementPath(testCo, PAID_PACK);
const snapBeforeInstall = await db.doc(entitlementPath).get();
assert.ok(snapBeforeInstall.exists);
evidence.firestore.beforeInstall = { status: snapBeforeInstall.data()?.status };

await assertPaidInstallAllowed(token, testCo, "active_entitlement", { installedBy: uid });
step("3_paid_install_allowed_with_entitlement", evidence.installMatrix.active_entitlement);

const snapAfterInstall = await db.doc(entitlementPath).get();
assert.equal(snapAfterInstall.data()?.status, snapBeforeInstall.data()?.status);
assert.equal(snapAfterInstall.data()?.grantedAt, snapBeforeInstall.data()?.grantedAt);
evidence.firestore.afterInstallEntitlementUnchanged = true;
step("3_entitlement_not_consumed", {
    status: snapAfterInstall.data()?.status,
    grantedAt: snapAfterInstall.data()?.grantedAt,
});

const installRegistryPath = tenantMarketplaceInstallPath(testCo, PAID_PACK);
const installedHttp = await tenantApi("GET", `/api/marketplace/installed/${testCo}`, { token });
assert.equal(installedHttp.status, 200);
const installedItems = installedHttp.data?.items || installedHttp.data?.packs || [];
const matchingInstalled = Array.isArray(installedItems)
    ? installedItems.find((p) => {
          const id = String(p.packId || p.id || "");
          return id === PAID_PACK || id.includes("automotive");
      })
    : null;
const installSnap = await db.doc(installRegistryPath).get();
assert.ok(installSnap.exists || matchingInstalled, "installed registry must exist after successful install");
const installDoc = installSnap.exists ? installSnap.data() : null;
evidence.http.installedList = {
    status: installedHttp.status,
    itemCount: Array.isArray(installedItems) ? installedItems.length : 0,
    matchingPack: matchingInstalled
        ? { packId: matchingInstalled.packId || matchingInstalled.id, status: matchingInstalled.status }
        : null,
};
evidence.firestore.installedRegistry = installDoc
    ? {
          path: installRegistryPath,
          packId: PAID_PACK,
          status: installDoc.status,
          installedVersion: installDoc.installedVersion ?? installDoc.version ?? null,
      }
    : { path: installRegistryPath, exists: false };
if (STRICT_HTTP) {
    assert.equal(evidence.installMatrix.active_entitlement?.via, "http", "STRICT_HTTP requires HTTP install");
    assert.ok(matchingInstalled || installSnap.exists, "STRICT_HTTP requires durable installed record");
}
evidence.commercialAccessProof = {
    disposableCompanyId: testCo,
    packId: PAID_PACK,
    salesReference: salesRef,
    entitlementFirestorePath: entitlementPath,
    installRegistryFirestorePath: installRegistryPath,
    installHttp: evidence.installMatrix.active_entitlement,
    tenantInstalledGet: evidence.http.installedList,
    entitlementAfterInstall: {
        status: snapAfterInstall.data()?.status,
        grantedAt: snapAfterInstall.data()?.grantedAt,
    },
    installedRegistry: evidence.firestore.installedRegistry,
};
step("3_installed_registry", evidence.commercialAccessProof);

const futureExpiry = new Date(Date.now() + 86400000 * 45).toISOString();
if (httpEntitlementsLive) {
    const expiryPatch = await platformApi("PATCH", `/api/platform/marketplace/entitlements/${testCo}/${PAID_PACK}`, {
        body: { expiresAt: futureExpiry },
    });
    assert.equal(expiryPatch.status, 200);
    evidence.http.expiryPatch = { expiresAt: futureExpiry };
} else {
    await updateMarketplaceEntitlementExpiry(testCo, PAID_PACK, futureExpiry, platformCtx);
    evidence.service.expiryPatch = { expiresAt: futureExpiry };
}
step("4_expiry_update", evidence.http.expiryPatch || evidence.service.expiryPatch);

const afterExpiryView = httpEntitlementsLive
    ? (await tenantApi("GET", `/api/marketplace/entitlements/${testCo}/${PAID_PACK}`, { token })).data?.entitlement
    : await tenantEntitlementView();
assert.equal(afterExpiryView.expiresAt, futureExpiry);
assert.equal(afterExpiryView.entitled, true);
step("4_tenant_get_reflects_expiry", afterExpiryView.expiresAt);

if (httpEntitlementsLive) {
    const revoke = await platformApi("DELETE", `/api/platform/marketplace/entitlements/${testCo}/${PAID_PACK}`, {
        body: { revokeReason: "6I-E acceptance revoke" },
    });
    assert.equal(revoke.status, 200);
    evidence.http.revoke = { status: revoke.status };
} else {
    await revokeMarketplaceEntitlement(testCo, PAID_PACK, { revokeReason: "6I-E acceptance revoke" }, platformCtx);
    evidence.service.revoke = true;
}
step("4_revoke", evidence.http.revoke || evidence.service.revoke);

const afterRevokeView = httpEntitlementsLive
    ? (await tenantApi("GET", `/api/marketplace/entitlements/${testCo}/${PAID_PACK}`, { token })).data?.entitlement
    : await tenantEntitlementView();
assert.equal(afterRevokeView.entitled, false);
assert.equal(afterRevokeView.status, "revoked");
step("4_tenant_get_after_revoke", afterRevokeView);

await assertPaidInstallBlocked(token, testCo, "revoked_entitlement");
step("5_paid_install_402_after_revoke", evidence.installMatrix.revoked_entitlement);

const companyExpired = process.env.PORTAL_6I_E_EXPIRED_COMPANY || `portal-6ie-exp-${Date.now()}`;
assert.notEqual(companyExpired, RTB);
const expiredActor = await provisionPortal4bDisposableActor({
    companyId: companyExpired,
    password: smokePassword,
    companyName: `Portal 6I-E Expired ${companyExpired}`,
});
await grantMarketplaceEntitlement(
    {
        companyId: companyExpired,
        packId: PAID_PACK,
        expiresAt: "2000-01-01T00:00:00.000Z",
        salesReference: "6I-E-EXPIRED",
    },
    platformCtx
);
const expiredView = await tenantEntitlementView(companyExpired);
assert.equal(expiredView.entitled, false);
assert.equal(expiredView.status, "expired");
const expiredToken = (await firebaseToken(expiredActor.email, smokePassword)).idToken;
await assertPaidInstallBlocked(expiredToken, companyExpired, "expired_entitlement");
step("5_expired_entitlement_402", evidence.installMatrix.expired_entitlement);

const bypassCo = `portal-6ie-bypass-${Date.now()}`;
await provisionPortal4bDisposableActor({
    companyId: bypassCo,
    password: smokePassword,
    companyName: `Portal 6I-E Policy A ${bypassCo}`,
});
const { runInstallWizard } = await import("../services/platform/marketplaceInstaller.js");
const bypassResult = await runInstallWizard(bypassCo, PAID_PACK, {
    step: "install",
    skipPayment: true,
    installedBy: "6i-e-policy-a",
});
assert.notEqual(bypassResult.requiresPayment, true);
evidence.service.policyABypass = { companyId: bypassCo, skipPayment: true };
step("6_policy_a_skipPayment_bypass_no_entitlement", evidence.service.policyABypass);

const rtbSnap = await db.doc(tenantMarketplaceEntitlementPath(RTB, PAID_PACK)).get();
evidence.firestore.rtbEntitlementDocExists = rtbSnap.exists;
step("rtb_not_used_for_mutations", { testCompany: testCo, rtb: RTB });

if (STRICT_HTTP) {
    assert.equal(evidence.installHttpIntegrationDeployed, true);
    assert.equal(httpEntitlementsLive, true);
    const usedServiceFallback = evidence.limitations.some((l) =>
        /service-layer|service_runInstallWizard/i.test(l)
    );
    assert.equal(usedServiceFallback, false, "STRICT_HTTP must not use service-layer install fallback");
    evidence.acceptanceMode = "production_http_entitlements_and_install";
} else if (httpEntitlementsLive && evidence.installHttpIntegrationDeployed) {
    evidence.acceptanceMode = "production_http_entitlements_and_install";
} else {
    evidence.acceptanceMode = evidence.acceptanceMode || "mixed_http_and_service_layer";
}

evidence.completedAt = new Date().toISOString();
evidence.pass = true;
writeEvidence();

console.log("\nPORTAL-4C-6I-E production acceptance passed");
console.log("evidence:", join(resultsDir, "portal-4c-6i-production-acceptance.json"));
if (evidence.limitations.length) {
    console.log("limitations:", evidence.limitations);
}
