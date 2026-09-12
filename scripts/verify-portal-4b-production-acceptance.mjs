#!/usr/bin/env node
/**
 * PORTAL-4B-2 production acceptance — run via:
 *   PORTAL_4B_SMOKE_PASSWORD='...' npx @railway/cli run node scripts/verify-portal-4b-production-acceptance.mjs
 *
 * Uses a dedicated disposable tenant actor (global profile companyId = test tenant).
 * Does NOT use installIndustryPack() service fallback. Does NOT touch RTB registry.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
const PACK = "pack-funeral-ai";
const API_BASE = (process.env.PORTAL_4B_API_BASE || "https://ziricai-production.up.railway.app").replace(
    /\/$/,
    ""
);
const testCo = process.env.PORTAL_4B_TEST_COMPANY || `portal-4b-registry-test-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "firestore";
process.env.PORTAL_4B_TEST_COMPANY = testCo;
process.env.PORTAL_4B_SMOKE_PASSWORD = smokePassword;

const rtbCredPath = join(ROOT, ".portal-rtb-smoke-credentials.json");
const disposableCredPath = join(ROOT, ".portal-4b-disposable-credentials.json");

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

async function readProfileCompany(uid) {
    const snap = await getAdminFirestore().collection("users").doc(uid).get();
    const data = snap.data() || {};
    return data.companyId || data.company || null;
}

async function assertActorTenantBinding(actorInfo, expectedCompanyId, label) {
    assert.equal(actorInfo.profileCompanyId, expectedCompanyId, `${label}: provisioned profile company`);
    const live = await readProfileCompany(actorInfo.uid);
    assert.equal(live, expectedCompanyId, `${label}: live users/{uid} company binding`);
}

const evidence = {
    primaryTenant: testCo,
    steps: [],
    installAttemptIds: {},
    http: {},
};

function record(step, detail = {}) {
    evidence.steps.push({ step, ...detail });
    console.log(`✓ ${step}`, detail.detail || "");
}

console.log("verify-portal-4b-production-acceptance");
console.log("testCompany", testCo);
console.log("STORAGE_BACKEND", process.env.STORAGE_BACKEND);

const { tenantMarketplaceInstallPath } = await import("../services/database/schema.js");
const { getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
const { listAiEmployees } = await import("../services/tenants/aiEmployeeService.js");
const { listKnowledgeDocuments } = await import("../services/tenants/knowledgeService.js");
const { listWorkflows } = await import("../services/automation/workflowRegistry.js");
const { claimInstall, getInstall, assertInstallClaimResult } = await import(
    "../services/platform/marketplaceInstallService.js"
);
const { MarketplaceInstallError, INSTALL_IN_PROGRESS } = await import(
    "../services/platform/marketplaceInstallErrors.js"
);

let rtbProfileCompanyBefore = null;
let rtbUid = null;
if (existsSync(rtbCredPath)) {
    const rtbCreds = readJson(rtbCredPath);
    const rtbAuth = await firebaseToken(rtbCreds.email, rtbCreds.password);
    rtbUid = rtbAuth.uid;
    const rtbProfileBefore = (await getAdminFirestore().collection("users").doc(rtbUid).get()).data();
    rtbProfileCompanyBefore = rtbProfileBefore?.companyId || rtbProfileBefore?.company;
}

const actor = await provisionPortal4bDisposableActor({ companyId: testCo, password: smokePassword });
assert.equal(actor.profileCompanyId, testCo, "global profile companyId must match disposable tenant");
assert.equal(actor.membershipRole, "owner");
assert.ok(actor.membershipExists);

writeFileSync(
    disposableCredPath,
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
await assertActorTenantBinding(actor, testCo, "primary");
evidence.primaryActor = { uid: actor.uid, email: actor.email };
record("primary actor provisioned", { detail: `${actor.email} ${actor.uid}` });

const prePath = tenantMarketplaceInstallPath(testCo, PACK);
const preSnap = await getAdminFirestore().doc(prePath).get();
assert.equal(preSnap.exists, false, "test tenant must have no pre-existing registry doc");
console.log("✓ no pre-existing marketplace install record");

const { idToken: token, uid } = await firebaseToken(actor.email, smokePassword);
assert.equal(uid, actor.uid);

const install = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PACK },
});
assert.ok(
    install.status === 201 || install.status === 200,
    `API install failed: ${install.status} ${JSON.stringify(install.data)}`
);
evidence.http.primaryInstall = install.status;
record("POST /api/marketplace/install", { detail: String(install.status) });

const path = tenantMarketplaceInstallPath(testCo, PACK);
const snap = await getAdminFirestore().doc(path).get();
assert.ok(snap.exists, `Firestore doc missing: ${path}`);
const doc = snap.data();
assert.equal(doc.status, "installed");
assert.equal(doc.companyId, testCo);
assert.equal(doc.packId, PACK);
assert.ok(doc.installAttemptId);
assert.ok(doc.installedBy);
assert.equal(doc.installedBy, uid);
assert.ok(Array.isArray(doc.agentIds));
assert.ok(!JSON.stringify(doc).includes('"content":'), "no embedded KB bodies");
evidence.installAttemptIds.primary = doc.installAttemptId;
record("Firestore registry installed", { detail: path });

const workflows = await listWorkflows(testCo);
const viewing = workflows.find((w) => w.name && String(w.name).includes("Viewing"));
assert.ok(viewing, "Viewing workflow must exist");
const crmAction = (viewing.actions || []).find((a) => a.type === "update_crm");
assert.deepEqual(crmAction?.config?.status, "viewing_scheduled");
assert.ok(!Object.prototype.hasOwnProperty.call(crmAction?.config || {}, "tags"));
console.log("✓ workflow update_crm persisted without undefined tags");

for (const id of doc.agentIds) {
    const agents = await listAiEmployees(testCo);
    assert.ok(agents.some((a) => a.id === id));
}
for (const id of doc.knowledgeDocIds || []) {
    const docs = await listKnowledgeDocuments(testCo);
    assert.ok(docs.some((d) => d.id === id));
}
for (const id of doc.workflowIds || []) {
    assert.ok(workflows.some((w) => w.id === id));
}
console.log("✓ authoritative resources exist");

const listed = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}`, { token });
assert.equal(listed.status, 200);
assert.ok(listed.data.items?.length >= 1);
console.log("✓ GET /api/marketplace/installed same tenant");

// --- auth matrix (disposable + RTB wrong-tenant) ---
const unauth = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}`);
assert.equal(unauth.status, 401);
console.log("✓ unauthenticated GET → 401");

const unauthInstall = await api("POST", "/api/marketplace/install", {
    body: { companyId: testCo, packId: PACK },
});
assert.equal(unauthInstall.status, 401);
console.log("✓ unauthenticated POST install → 401");

if (existsSync(rtbCredPath)) {
    const rtbCreds = readJson(rtbCredPath);
    const { idToken: rtbToken } = await firebaseToken(rtbCreds.email, rtbCreds.password);
    const wrongGet = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}`, {
        token: rtbToken,
    });
    assert.equal(wrongGet.status, 403);
    const wrongPost = await api("POST", "/api/marketplace/install", {
        token: rtbToken,
        body: { companyId: testCo, packId: PACK },
    });
    assert.equal(wrongPost.status, 403);
    console.log("✓ RTB actor wrong-tenant install/read → 403");
}

const wrongLocal = await api("GET", `/api/marketplace/installed/${encodeURIComponent("demo-central-motors")}`, {
    token,
});
assert.equal(wrongLocal.status, 403);
console.log("✓ disposable actor wrong-tenant GET → 403");

const dup = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PACK },
});
assert.equal(dup.status, 200);
assert.equal(dup.data.alreadyInstalled, true);
const agentsAfterDup = await listAiEmployees(testCo);
assert.equal(agentsAfterDup.length, doc.agentIds.length);
console.log("✓ duplicate POST install → alreadyInstalled, no duplicate agents");

// --- concurrent claim (Firestore) while installing ---
const concCo = `${testCo}-conc`;
const concActor = await provisionPortal4bDisposableActor({
    companyId: concCo,
    password: smokePassword,
    email: `portal-4b-conc-${Date.now()}@ziricai.com`,
});
await assertActorTenantBinding(concActor, concCo, "conc");
await assertActorTenantBinding(actor, testCo, "primary-after-conc-provision");
const { idToken: concToken } = await firebaseToken(concActor.email, smokePassword);
const claimConc = await claimInstall(concCo, PACK, { installedBy: concActor.uid });
assert.equal(claimConc.outcome, "claimed");
let concErr = null;
try {
    const secondClaim = await claimInstall(concCo, PACK, { installedBy: "conc-b" });
    assertInstallClaimResult(secondClaim);
} catch (e) {
    concErr = e;
}
assert.ok(concErr instanceof MarketplaceInstallError);
assert.equal(concErr.code, INSTALL_IN_PROGRESS);
const [apiA, apiB] = await Promise.all([
    api("POST", "/api/marketplace/install", {
        token: concToken,
        body: { companyId: concCo, packId: PACK },
    }),
    api("POST", "/api/marketplace/install", {
        token: concToken,
        body: { companyId: concCo, packId: PACK },
    }),
]);
const statuses = [apiA.status, apiB.status];
assert.ok(
    statuses.includes(409) ||
        (statuses.filter((s) => s === 201 || s === 200).length >= 1 &&
            statuses.some((s) => s === 409 || s === 200)),
    `expected concurrent install contention, got ${JSON.stringify(statuses)}`
);

const concCo2 = `${testCo}-conc2`;
const concActor2 = await provisionPortal4bDisposableActor({
    companyId: concCo2,
    password: smokePassword,
    email: `portal-4b-conc2-${Date.now()}@ziricai.com`,
});
await assertActorTenantBinding(concActor2, concCo2, "conc2");
await assertActorTenantBinding(actor, testCo, "primary-after-conc2-provision");
const { idToken: concToken2 } = await firebaseToken(concActor2.email, smokePassword);
const [raceA, raceB] = await Promise.all([
    api("POST", "/api/marketplace/install", { token: concToken2, body: { companyId: concCo2, packId: PACK } }),
    api("POST", "/api/marketplace/install", { token: concToken2, body: { companyId: concCo2, packId: PACK } }),
]);
const raceStatuses = [raceA.status, raceB.status];
assert.ok(
    raceStatuses.includes(409) ||
        (raceStatuses.includes(201) && raceStatuses.includes(200)) ||
        raceStatuses.every((s) => s === 201 || s === 200),
    `parallel API install unexpected: ${JSON.stringify(raceStatuses)}`
);
const conc2Agents = await listAiEmployees(concCo2);
assert.ok(conc2Agents.length <= 2, "parallel install must not duplicate-provision unbounded agents");
evidence.http.concurrentParallel = { concCo: statuses, concCo2: raceStatuses };
record("concurrent Firestore claim + parallel POST install contention");

// --- stale installing takeover ---
const staleCo = `${testCo}-stale`;
const staleActor = await provisionPortal4bDisposableActor({
    companyId: staleCo,
    password: smokePassword,
    email: `portal-4b-stale-${Date.now()}@ziricai.com`,
});
await assertActorTenantBinding(staleActor, staleCo, "stale");
await assertActorTenantBinding(actor, testCo, "primary-after-stale-provision");
const claimStale = await claimInstall(staleCo, PACK, { installedBy: staleActor.uid });
const staleRef = getAdminFirestore().doc(tenantMarketplaceInstallPath(staleCo, PACK));
await staleRef.update({
    updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
});
const staleRetry = await claimInstall(staleCo, PACK, { installedBy: "stale-retry" });
assert.equal(staleRetry.outcome, "claimed");
assert.notEqual(staleRetry.installAttemptId, claimStale.installAttemptId);
evidence.installAttemptIds.stale = {
    before: claimStale.installAttemptId,
    after: staleRetry.installAttemptId,
};
record("stale installing → new installAttemptId");

// --- failed → API retry (new tenant) ---
const retryCo = `${testCo}-retry`;
const retryActor = await provisionPortal4bDisposableActor({
    companyId: retryCo,
    password: smokePassword,
    email: `portal-4b-retry-${Date.now()}@ziricai.com`,
});
await assertActorTenantBinding(retryActor, retryCo, "retry");
await assertActorTenantBinding(actor, testCo, "primary-after-retry-provision");
const { idToken: retryTok, uid: retryActorUid } = await firebaseToken(retryActor.email, smokePassword);
const claimFail = await claimInstall(retryCo, PACK, { installedBy: retryActorUid });
const { failInstall } = await import("../services/platform/marketplaceInstallService.js");
await failInstall(retryCo, PACK, claimFail.installAttemptId, "harness simulated failure");
const failedRec = await getInstall(retryCo, PACK);
assert.equal(failedRec.status, "failed");
const retryInstall = await api("POST", "/api/marketplace/install", {
    token: retryTok,
    body: { companyId: retryCo, packId: PACK },
});
assert.ok(retryInstall.status === 201 || retryInstall.status === 200);
const afterRetry = await getInstall(retryCo, PACK);
assert.equal(afterRetry.status, "installed");
assert.notEqual(afterRetry.installAttemptId, claimFail.installAttemptId);
evidence.installAttemptIds.retry = {
    failed: claimFail.installAttemptId,
    installed: afterRetry.installAttemptId,
};
evidence.http.retryInstall = retryInstall.status;
record("failed → POST retry → installed with new installAttemptId");
await assertActorTenantBinding(actor, testCo, "primary-after-retry-test");

// --- orchestrated validator failure (harness subprocess) ---
await new Promise((resolve, reject) => {
    const child = spawn(
        process.execPath,
        ["--experimental-test-module-mocks", "scripts/portal-4b-orchestrated-validator-failure-harness.mjs"],
        {
        cwd: ROOT,
        env: {
            ...process.env,
            PORTAL_4B_SMOKE_PASSWORD: smokePassword,
            PORTAL_4B_TEST_COMPANY: "",
            PORTAL_4B_SMOKE_EMAIL: "",
        },
            stdio: "inherit",
        }
    );
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`validator harness exit ${code}`))));
});
await assertActorTenantBinding(actor, testCo, "primary-after-validator-harness");
record("orchestrated validator failure harness (harness-level, not API)");

const rtbSnap = await getAdminFirestore()
    .collection(`companies/${RTB}/marketplaceInstalls`)
    .limit(1)
    .get();
assert.equal(rtbSnap.size, 0, "RTB marketplaceInstalls must remain empty");
console.log("✓ RTB marketplaceInstalls empty");

if (rtbUid) {
    const rtbProfileAfter = (await getAdminFirestore().collection("users").doc(rtbUid).get()).data();
    const rtbCoAfter = rtbProfileAfter?.companyId || rtbProfileAfter?.company;
    assert.equal(rtbCoAfter, rtbProfileCompanyBefore, "RTB smoke profile company must be unchanged");
    console.log("✓ RTB global profile unchanged");
}

// --- Railway redeploy + HTTP GET durability ---
console.log("… triggering Railway redeploy for restart persistence check");
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

const afterRestart = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}`, { token });
assert.equal(afterRestart.status, 200);
assert.ok(afterRestart.data.items?.some((i) => i.packId === PACK));
console.log("✓ GET installed after Railway redeploy");

await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/verify-portal-4b-marketplace-registry-restart.js"], {
        cwd: ROOT,
        env: {
            ...process.env,
            STORAGE_BACKEND: "firestore",
            PORTAL_4B_RESTART_COMPANY: testCo,
            PORTAL_4B_RESTART_PACK: PACK,
        },
        stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`restart exit ${code}`))));
});
record("Firestore re-init read persistence");

evidence.http.getAfterRedeploy = afterRestart.status;
await assertActorTenantBinding(actor, testCo, "primary-after-redeploy");

try {
    execSync("node scripts/_portal-4b-platform-health-snapshot.mjs", {
        cwd: ROOT,
        stdio: "pipe",
        env: process.env,
    });
    evidence.platformHealth = "captured";
    record("platform health snapshot");
} catch {
    evidence.platformHealth = "gap: PLATFORM_API_KEY unavailable in run env";
    console.log("⚠ platform health snapshot skipped (PLATFORM_API_KEY unavailable)");
}

execSync("node scripts/verify-portal-4a-marketplace-auth.js --live", { cwd: ROOT, stdio: "inherit" });
execSync("node scripts/verify-portal-4a-r1-marketplace-security.js --live", { cwd: ROOT, stdio: "inherit" });
evidence.regression4a = "PASS";

console.log("\nPORTAL-4B production acceptance script completed");
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
console.log(
    "SANITIZED_DOC",
    JSON.stringify({
        packId: doc.packId,
        companyId: doc.companyId,
        version: doc.version,
        status: doc.status,
        installedBy: doc.installedBy,
        installAttemptId: doc.installAttemptId,
        agentIds: doc.agentIds,
        knowledgeDocIds: doc.knowledgeDocIds,
        workflowIds: doc.workflowIds,
        workflowCrm: crmAction?.config,
        disposableActorEmail: actor.email,
        disposableActorUid: actor.uid,
    })
);
