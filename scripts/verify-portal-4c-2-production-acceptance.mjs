#!/usr/bin/env node
/**
 * PORTAL-4C-2 — Production acceptance (lifecycle API + read-only update visibility).
 *
 * Run:
 *   npx @railway/cli run node scripts/verify-portal-4c-2-production-acceptance.mjs
 *
 * Fresh disposable tenant + actor (do NOT reuse 4C-1 tenant).
 * Does NOT modify production service code during the run.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
const PACK = "pack-funeral-ai";
const API_BASE = (
    process.env.PORTAL_4C2_API_BASE ||
    process.env.PORTAL_4C1_API_BASE ||
    process.env.PORTAL_4B_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");
const PORTAL_ORIGIN = (process.env.PORTAL_4C2_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");

const testCo = process.env.PORTAL_4C2_TEST_COMPANY || `portal-4c2-lc-test-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C2_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C2_TEST_COMPANY = testCo;
process.env.PORTAL_4C2_SMOKE_PASSWORD = smokePassword;

const rtbCredPath = join(ROOT, ".portal-rtb-smoke-credentials.json");
const credPath = join(ROOT, ".portal-4c2-disposable-credentials.json");
const resultsDir = join(ROOT, "test-results");

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
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

async function api(method, path, { token, body } = {}) {
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
        data = { raw: text };
    }
    return { status: res.status, data };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function stop(msg, detail) {
    console.error("STOP:", msg, detail ?? "");
    process.exit(1);
}

const evidence = {
    gate: "PORTAL-4C-2-production-acceptance",
    apiBase: API_BASE,
    portalOrigin: PORTAL_ORIGIN,
    primaryTenant: testCo,
    steps: {},
    http: {},
    firestore: {},
    limitations: [],
};

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

console.log("verify-portal-4c-2-production-acceptance");
console.log("testCompany", testCo);

const { tenantMarketplaceInstallPath, platformPackVersionPath } = await import("../services/database/schema.js");
const { getAdminFirestore, hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
async function readRegistryIds(co) {
    const snap = await db.doc(tenantMarketplaceInstallPath(co, PACK)).get();
    const d = snap.data() || {};
    return {
        agentIds: d.agentIds || [],
        knowledgeDocIds: d.knowledgeDocIds || [],
        workflowIds: d.workflowIds || [],
        status: d.status,
    };
}
const { claimInstall, failInstall, getInstall } = await import("../services/platform/marketplaceInstallService.js");
const { listMarketplaceInstallLifecycle } = await import("../services/platform/marketplaceInstallLifecycle.js");
const { getInstalledPacks } = await import("../services/platform/industryPackService.js");
const { publishCuratedPackVersions } = await import("../services/platform/marketplacePackVersionRepository.js");

assert.ok(hasAdminCredentials(), "Firebase Admin required — run via railway run");
const db = getAdminFirestore();

async function readVersionDoc(version) {
    const path = platformPackVersionPath(PACK, version);
    const snap = await db.doc(path).get();
    return { path, exists: snap.exists, data: snap.exists ? snap.data() : null };
}

// --- Gate 0: API exposes lifecycle + version catalog ---
for (let i = 0; i < 20; i++) {
    const health = await api("GET", "/api/health").catch(() => ({ status: 0 }));
    const probe = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(testCo)}`);
    if (health.status === 200 && probe.status === 401) {
        step("gate0_api_ready", { health: health.status, lifecycleUnauth: probe.status, attempts: i + 1 });
        break;
    }
    if (i === 19) {
        stop("lifecycle endpoint not ready (expected 401 without auth)", { health, probe: probe.status, body: probe.data });
    }
    await sleep(15000);
}

for (let i = 0; i < 8; i++) {
    const a = await readVersionDoc("1.0.0");
    const b = await readVersionDoc("1.1.0");
    if (a.exists && b.exists) {
        evidence.firestore.versionGate = { "1.0.0": a.path, "1.1.0": b.path };
        step("gate0_firestore_versions", evidence.firestore.versionGate);
        break;
    }
    if (i === 7) stop("missing Firestore version docs 1.0.0/1.1.0", { a: a.exists, b: b.exists });
    await sleep(10000);
}

// --- Disposable actor ---
const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 4C2 Lifecycle Test ${testCo}`,
});
assert.equal(actor.profileCompanyId, testCo);
writeFileSync(
    credPath,
    `${JSON.stringify(
        {
            companyId: testCo,
            email: actor.email,
            uid: actor.uid,
            password: smokePassword,
            provisionedAt: new Date().toISOString(),
        },
        null,
        2
    )}\n`,
    "utf8"
);
const { idToken: token, uid } = await firebaseToken(actor.email, smokePassword);
assert.equal(uid, actor.uid);
step("actor", { email: actor.email, uid: actor.uid, companyId: testCo });

// --- A. Authentication / isolation (lifecycle) ---
const unauthLc = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(testCo)}`);
assert.equal(unauthLc.status, 401);
evidence.http.unauthLifecycle = unauthLc.status;

const wrongGet = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent("demo-central-motors")}`, {
    token,
});
assert.equal(wrongGet.status, 403);

let rtbToken = null;
if (existsSync(rtbCredPath)) {
    const rtbCreds = readJson(rtbCredPath);
    rtbToken = (await firebaseToken(rtbCreds.email, rtbCreds.password)).idToken;
    const rtbWrong = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(testCo)}`, {
        token: rtbToken,
    });
    assert.equal(rtbWrong.status, 403);
    evidence.http.rtbWrongTenantLifecycle = rtbWrong.status;
}
step("A_auth_lifecycle", { unauth: 401, disposableWrongTenant: 403, rtbWrongTenant: rtbToken ? 403 : "skipped" });

// --- B. Controlled lifecycle records (sub-tenants) ---
async function provisionSub(suffix, emailTag) {
    const co = `${testCo}-${suffix}`;
    const sub = await provisionPortal4bDisposableActor({
        companyId: co,
        password: smokePassword,
        email: `portal-4c2-${emailTag}-${Date.now()}@ziricai.com`,
    });
    const { idToken: subToken } = await firebaseToken(sub.email, smokePassword);
    return { co, subToken, sub };
}

const fresh = await provisionSub("inst-fresh", "fresh");
const claimFresh = await claimInstall(fresh.co, PACK, { installedBy: fresh.sub.uid });
assert.equal(claimFresh.outcome, "claimed");
const lcFresh = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(fresh.co)}`, {
    token: fresh.subToken,
});
assert.equal(lcFresh.status, 200);
const freshItem = lcFresh.data.items?.find((i) => i.packId === PACK);
assert.equal(freshItem?.status, "installing");
assert.equal(freshItem?.installingStale, false);
assert.ok(freshItem?.installAttemptId);

const stale = await provisionSub("inst-stale", "stale");
const claimStale = await claimInstall(stale.co, PACK, { installedBy: stale.sub.uid });
await db.doc(tenantMarketplaceInstallPath(stale.co, PACK)).update({
    updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
});
const lcStale = await listMarketplaceInstallLifecycle(stale.co);
const staleItem = lcStale.items.find((i) => i.packId === PACK);
assert.equal(staleItem.status, "installing");
assert.equal(staleItem.installingStale, true);

const failedStatic = await provisionSub("failed-static", "failed-static");
const claimFailStatic = await claimInstall(failedStatic.co, PACK, { installedBy: failedStatic.sub.uid });
await failInstall(
    failedStatic.co,
    PACK,
    claimFailStatic.installAttemptId,
    "Acceptance simulated failure (sanitized)"
);
const lcFailed = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(failedStatic.co)}`, {
    token: failedStatic.subToken,
});
const failedItem = lcFailed.data.items?.find((i) => i.packId === PACK);
assert.equal(failedItem?.status, "failed");
assert.match(failedItem?.lastError || "", /Acceptance simulated failure/);
assert.ok(failedItem?.failedAt);
assert.ok(failedItem?.installAttemptId);
assert.doesNotMatch(JSON.stringify(failedItem), /"template"|"knowledge"|"workflows"/);

const installedCo = `${testCo}-installed`;
const installedActor = await provisionPortal4bDisposableActor({
    companyId: installedCo,
    password: smokePassword,
    email: `portal-4c2-installed-${Date.now()}@ziricai.com`,
});
const { idToken: installedToken } = await firebaseToken(installedActor.email, smokePassword);
const instRes = await api("POST", "/api/marketplace/install", {
    token: installedToken,
    body: { companyId: installedCo, packId: PACK },
});
assert.ok(instRes.status === 201 || instRes.status === 200, `install ${instRes.status}`);
const lcInstalled = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(installedCo)}`, {
    token: installedToken,
});
assert.equal(lcInstalled.status, 200);
assert.equal(lcInstalled.data.summary?.installed, 1);
const instItem = lcInstalled.data.items?.find((i) => i.packId === PACK);
assert.equal(instItem?.status, "installed");
assert.equal(instItem?.version, "1.0.0");
assert.ok(instItem?.installedAt || instItem?.installedCompletedAt);

evidence.lifecycleControlled = {
    fresh: { status: freshItem.status, installingStale: freshItem.installingStale },
    stale: { status: staleItem.status, installingStale: staleItem.installingStale },
    failed: { status: failedItem.status, hasLastError: !!failedItem.lastError },
    installed: { version: instItem.version, summary: lcInstalled.data.summary },
};
step("B_lifecycle_visibility", evidence.lifecycleControlled);

if (rtbToken) {
    const rtbPeekFresh = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(fresh.co)}`, {
        token: rtbToken,
    });
    assert.equal(rtbPeekFresh.status, 403);
    const dispPeekRtb = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(RTB)}`, { token });
    assert.equal(dispPeekRtb.status, 403);
    step("A_rtb_isolation_lifecycle", { rtbCannotReadDisposable: 403, disposableCannotReadRtb: 403 });
}

// --- C. Failed → retry (existing install path) ---
const failedRetry = await provisionSub("failed-retry", "failed-retry");
const claimFailRetry = await claimInstall(failedRetry.co, PACK, { installedBy: failedRetry.sub.uid });
await failInstall(failedRetry.co, PACK, claimFailRetry.installAttemptId, "Retry path failure");
const beforeIds = await readRegistryIds(failedRetry.co);
assert.equal(beforeIds.status, "failed");
const retryInstall = await api("POST", "/api/marketplace/install", {
    token: failedRetry.subToken,
    body: { companyId: failedRetry.co, packId: PACK },
});
assert.ok(retryInstall.status === 201 || retryInstall.status === 200, `retry ${retryInstall.status}`);
const afterRetry = await getInstall(failedRetry.co, PACK);
assert.equal(afterRetry.status, "installed");
assert.notEqual(afterRetry.installAttemptId, claimFailRetry.installAttemptId);
const afterIds = await readRegistryIds(failedRetry.co);
assert.ok(afterIds.agentIds.length >= 1);
assert.ok(afterIds.knowledgeDocIds.length >= beforeIds.knowledgeDocIds.length);
assert.ok(afterIds.workflowIds.length >= beforeIds.workflowIds.length);
if (beforeIds.agentIds.length > 0) {
    assert.deepEqual(afterIds.agentIds.sort(), beforeIds.agentIds.sort());
}
step("C_failed_retry", {
    http: retryInstall.status,
    newAttemptId: afterRetry.installAttemptId !== claimFailRetry.installAttemptId,
    agentsDupFree: beforeIds.agentIds.length === 0 || afterIds.agentIds.length === beforeIds.agentIds.length,
});

// --- D. Installing + 409 INSTALL_IN_PROGRESS ---
const conc = await provisionSub("conc", "conc");
const claimConc = await claimInstall(conc.co, PACK, { installedBy: conc.sub.uid });
assert.equal(claimConc.outcome, "claimed");
const visible = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(conc.co)}`, {
    token: conc.subToken,
});
assert.equal(visible.data.items?.[0]?.status, "installing");
const [raceA, raceB] = await Promise.all([
    api("POST", "/api/marketplace/install", {
        token: conc.subToken,
        body: { companyId: conc.co, packId: PACK },
    }),
    api("POST", "/api/marketplace/install", {
        token: conc.subToken,
        body: { companyId: conc.co, packId: PACK },
    }),
]);
const raceStatuses = [raceA.status, raceB.status];
assert.ok(raceStatuses.includes(409), `expected 409 contention, got ${JSON.stringify(raceStatuses)}`);
const conflict = raceA.status === 409 ? raceA : raceB;
assert.equal(conflict.data?.code, "INSTALL_IN_PROGRESS");
evidence.http.installInProgress = { statuses: raceStatuses, code: conflict.data?.code };
step("D_installing_409", evidence.http.installInProgress);

// --- E. Installed + /installed contract ---
const installedOnly = await getInstalledPacks(installedCo);
assert.equal(installedOnly.items.length, 1);
assert.equal(installedOnly.items[0].status, "installed");
const httpInstalled = await api("GET", `/api/marketplace/installed/${encodeURIComponent(installedCo)}`, {
    token: installedToken,
});
assert.equal(httpInstalled.status, 200);
assert.equal(httpInstalled.data.items?.length, 1);
assert.equal(httpInstalled.data.items[0].status, "installed");
assert.ok(!httpInstalled.data.items.some((i) => i.status === "installing" || i.status === "failed"));
const httpFreshInstalled = await api("GET", `/api/marketplace/installed/${encodeURIComponent(fresh.co)}`, {
    token: fresh.subToken,
});
assert.equal(httpFreshInstalled.status, 200);
assert.equal((httpFreshInstalled.data.items || []).length, 0);
step("E_installed_endpoint", {
    lifecycleSummary: lcInstalled.data.summary,
    installedOnlyCount: httpInstalled.data.items.length,
    installingExcludedFromInstalled: httpFreshInstalled.data.items.length === 0,
});

// --- F. Update visibility (API; browser supplement recorded separately) ---
await publishCuratedPackVersions([PACK]);
const updCo = `${testCo}-upd-ro`;
const updActor = await provisionPortal4bDisposableActor({
    companyId: updCo,
    password: smokePassword,
    email: `portal-4c2-upd-ro-${Date.now()}@ziricai.com`,
});
const { idToken: updToken } = await firebaseToken(updActor.email, smokePassword);
const updInstall = await api("POST", "/api/marketplace/install", {
    token: updToken,
    body: { companyId: updCo, packId: PACK },
});
assert.ok(updInstall.status === 201 || updInstall.status === 200);
const updates = await api("GET", `/api/marketplace/installed/${encodeURIComponent(updCo)}/updates`, {
    token: updToken,
});
assert.equal(updates.status, 200);
assert.equal(updates.data.updates?.length, 1);
assert.equal(updates.data.updates[0].latestVersion, "1.1.0");
assert.equal(updates.data.updates[0].currentVersion, "1.0.0");
assert.ok(updates.data.updates[0].changelog?.length >= 2);
const regUpd = (await db.doc(tenantMarketplaceInstallPath(updCo, PACK)).get()).data();
assert.equal(regUpd.version, "1.0.0", "upd-ro tenant must remain at 1.0.0 for read-only visibility");
evidence.http.updatesReadOnlyTenant = {
    latestVersion: updates.data.updates[0].latestVersion,
    changelogLines: updates.data.updates[0].changelog.length,
};
step("F_updates_api", evidence.http.updatesReadOnlyTenant);

// --- G. Deployed Portal assets (catalog / lifecycle wiring) ---
const bust = Date.now();
const mpJs = await fetch(`${PORTAL_ORIGIN}/js/portal/modules/marketplace.js?v=${bust}`);
assert.equal(mpJs.status, 200, `marketplace.js not deployed at ${PORTAL_ORIGIN}`);
const mpSrc = await mpJs.text();
assert.match(mpSrc, /fetchMarketplaceLifecycle/);
assert.doesNotMatch(mpSrc, /\/api\/marketplace\/update/i);
assert.match(mpSrc, /INSTALL_IN_PROGRESS/);
assert.match(mpSrc, /resolveLifecycleForPack|lifecycleByPackId/);
step("G_portal_assets", { marketplaceJs: mpJs.status, hasLifecycle: true, noUpdatePostInPortal: true });

// --- H. Regressions (local memory) ---
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
execSync("node scripts/verify-portal-4c-2-marketplace-lifecycle.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
try {
    execSync("node scripts/verify-portal-4a-marketplace-auth.js --live", { cwd: ROOT, stdio: "pipe" });
    execSync("node scripts/verify-portal-4a-r1-marketplace-security.js --live", { cwd: ROOT, stdio: "pipe" });
    evidence.regression4aLive = "PASS";
} catch (e) {
    stop("4A live regression failed", e.message);
}
step("H_regressions", { local: "4A,4A-R1,4B,4C-1,4C-2 PASS", live4a: evidence.regression4aLive });

const rtbInstallSnap = await db.doc(tenantMarketplaceInstallPath(RTB, PACK)).get();
evidence.firestore.rtbInstallDocExists = rtbInstallSnap.exists;
for (const suffix of [
    "",
    "-inst-fresh",
    "-inst-stale",
    "-failed-static",
    "-failed-retry",
    "-installed",
    "-conc",
    "-upd-ro",
]) {
    const co = suffix ? `${testCo}${suffix}` : testCo;
    assert.notEqual(co, RTB);
}
step("H_rtb_registry", { rtbPath: tenantMarketplaceInstallPath(RTB, PACK), testDidNotUseRtb: true });

// --- I. Restart durability (lifecycle records) ---
await listMarketplaceInstallLifecycle(fresh.co);
await listMarketplaceInstallLifecycle(stale.co);
await listMarketplaceInstallLifecycle(failedStatic.co);
await listMarketplaceInstallLifecycle(installedCo);
console.log("… triggering Railway redeploy (step I)");
await new Promise((resolve, reject) => {
    const child = spawn("npx", ["@railway/cli", "up", "--detach"], {
        cwd: ROOT,
        shell: true,
        stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`railway up exit ${code}`))));
});
for (let i = 0; i < 24; i++) {
    await sleep(15000);
    const health = await api("GET", "/api/health").catch(() => ({ status: 0 }));
    if (health.status === 200) break;
}
await sleep(10000);

const snapshotAfter = {
    fresh: await listMarketplaceInstallLifecycle(fresh.co),
    stale: await listMarketplaceInstallLifecycle(stale.co),
    failedStatic: await listMarketplaceInstallLifecycle(failedStatic.co),
    installed: await listMarketplaceInstallLifecycle(installedCo),
};
assert.equal(snapshotAfter.fresh.items[0]?.status, "installing");
assert.equal(snapshotAfter.stale.items[0]?.installingStale, true);
assert.equal(snapshotAfter.failedStatic.items[0]?.status, "failed");
assert.match(snapshotAfter.failedStatic.items[0]?.lastError || "", /Acceptance simulated failure/);
assert.equal(snapshotAfter.installed.items[0]?.status, "installed");
assert.equal(snapshotAfter.installed.items[0]?.version, "1.0.0");
evidence.restartDurability = {
    freshStatus: snapshotAfter.fresh.items[0]?.status,
    staleFlag: snapshotAfter.stale.items[0]?.installingStale,
    failedStaticStatus: snapshotAfter.failedStatic.items[0]?.status,
    installedVersion: snapshotAfter.installed.items[0]?.version,
};
step("I_restart_durability", evidence.restartDurability);

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-2-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-2 production acceptance (API matrix) completed");
console.log("EVIDENCE_FILE", outPath);
console.log("CREDENTIALS_FILE", credPath);
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
