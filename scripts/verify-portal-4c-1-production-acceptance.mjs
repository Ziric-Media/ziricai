#!/usr/bin/env node
/**
 * PORTAL-4C-1B — Production acceptance (Marketplace update foundation).
 *
 * Run:
 *   npx @railway/cli run node scripts/verify-portal-4c-1-production-acceptance.mjs
 *
 * Requires Firebase Admin + production API. Does NOT touch RTB registry.
 * Does NOT modify production service code.
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
const API_BASE = (process.env.PORTAL_4C1_API_BASE || process.env.PORTAL_4B_API_BASE || "https://ziricai-production.up.railway.app").replace(
    /\/$/,
    ""
);
const UPDATE_KB_ID = "kn-upd-pack-funeral-ai-faq-grief-support-resources";
const UPDATE_WF_ID = "wf-upd-pack-funeral-ai-follow-up-family-support-check-in";

const testCo = process.env.PORTAL_4C1_TEST_COMPANY || `portal-4c1-upd-test-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C1_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C1_TEST_COMPANY = testCo;
process.env.PORTAL_4C1_SMOKE_PASSWORD = smokePassword;

const rtbCredPath = join(ROOT, ".portal-rtb-smoke-credentials.json");
const credPath = join(ROOT, ".portal-4c1-disposable-credentials.json");

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

const evidence = {
    gate: "PORTAL-4C-1B",
    apiBase: API_BASE,
    primaryTenant: testCo,
    steps: {},
    limitations: [],
    http: {},
    firestore: {},
};

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

console.log("verify-portal-4c-1-production-acceptance");
console.log("testCompany", testCo);

const { tenantMarketplaceInstallPath, platformPackVersionPath } = await import("../services/database/schema.js");
const { getAdminFirestore, hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
const { listKnowledgeDocuments } = await import("../services/tenants/knowledgeService.js");
const { listWorkflows } = await import("../services/automation/workflowRegistry.js");
const { getCuratedPackVersions } = await import("../services/platform/marketplacePackVersionCatalog.js");
const { publishCuratedPackVersions } = await import("../services/platform/marketplacePackVersionRepository.js");
const { updateInstalledRecord, getInstall } = await import("../services/platform/marketplaceInstallService.js");
const { getMarketplaceInstallRepository } = await import("../services/platform/marketplaceInstallRepository.js");
const { applyUpdate } = await import("../services/platform/marketplaceVersioning.js");
const { validatePackUpdate } = await import("../services/platform/marketplaceUpdateValidator.js");

assert.ok(hasAdminCredentials(), "Firebase Admin required — run via railway run");
const db = getAdminFirestore();

async function readVersionDoc(version) {
    const path = platformPackVersionPath(PACK, version);
    const snap = await db.doc(path).get();
    return { path, exists: snap.exists, data: snap.exists ? snap.data() : null };
}

// --- Gate 0: Firestore durable version catalog (STOP if missing) ---
for (let i = 0; i < 16; i++) {
    await api("GET", "/api/health").catch(() => ({ status: 0 }));
    const a = await readVersionDoc("1.0.0");
    const b = await readVersionDoc("1.1.0");
    if (a.exists && b.exists) {
        evidence.firestore.versionGate = { "1.0.0": a.path, "1.1.0": b.path, attempts: i + 1 };
        step("gate0_firestore_versions", evidence.firestore.versionGate);
        break;
    }
    if (i === 15) {
        console.error("STOP: missing Firestore version docs", {
            "1.0.0": a,
            "1.1.0": b,
        });
        process.exit(1);
    }
    await sleep(15000);
}

// --- Step 0: disposable actor (4B discipline) ---
const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 4C1 Update Test ${testCo}`,
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

const prePath = tenantMarketplaceInstallPath(testCo, PACK);
assert.equal((await db.doc(prePath).get()).exists, false, "no pre-existing install doc");

let v100 = await readVersionDoc("1.0.0");
let v110 = await readVersionDoc("1.1.0");
assert.ok(v100.exists && v110.exists, "gate0 requires both version docs");
evidence.firestore.versionsAtInstallStart = { "1.0.0": v100.path, "1.1.0": v110.path };

// --- Step 1: Install 1.0.0 via API only ---
const install = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PACK },
});
assert.equal(install.status, 201, `install HTTP ${install.status} ${JSON.stringify(install.data)}`);
evidence.http.install = install.status;

const regSnap = await db.doc(prePath).get();
assert.ok(regSnap.exists);
const reg0 = regSnap.data();
assert.equal(reg0.status, "installed");
assert.equal(reg0.version, "1.0.0");
assert.equal(reg0.companyId, testCo);
assert.equal(reg0.installedBy, uid);
assert.ok(Array.isArray(reg0.knowledgeDocIds) && reg0.knowledgeDocIds.length > 0);
assert.ok(Array.isArray(reg0.workflowIds) && reg0.workflowIds.length > 0);
assert.ok(!JSON.stringify(reg0).includes('"content":'));
for (const id of reg0.knowledgeDocIds) {
    assert.ok((await listKnowledgeDocuments(testCo)).some((d) => d.id === id));
}
for (const id of reg0.workflowIds) {
    assert.ok((await listWorkflows(testCo)).some((w) => w.id === id));
}
step("step1_install_1_0_0", { status: install.status, version: reg0.version, kbIds: reg0.knowledgeDocIds.length, wfIds: reg0.workflowIds.length });

// --- Step 2: No false update from catalog metadata alone ---
const packDetail = await api("GET", `/api/marketplace/pack/${PACK}`);
assert.equal(packDetail.status, 200);
const catalogLatest = packDetail.data?.latestVersion || packDetail.data?.pack?.latestVersion;
evidence.http.packDetailLatestVersion = catalogLatest;

const updatesIfOnlyRepo = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}/updates`, { token });
assert.equal(updatesIfOnlyRepo.status, 200);

if (!v110.exists) {
    assert.equal(
        (updatesIfOnlyRepo.data?.updates || []).length,
        0,
        "updates must be empty when durable 1.1.0 is absent despite catalog latestVersion"
    );
    step("step2_no_false_update", { catalogLatestVersion: catalogLatest, durable110: false, updatesCount: 0 });
} else {
    evidence.limitations.push(
        "step2_negative_repo_only_1_0_0: production startup already published curated 1.1.0; decoupling proven in verify-portal-4c-1 local + catalog latestVersion recorded separately from updates API"
    );
    step("step2_catalog_vs_repo", {
        catalogLatestVersion: catalogLatest,
        durable110: true,
        updatesCount: (updatesIfOnlyRepo.data?.updates || []).length,
        note: "see limitations",
    });
}

// --- Step 3: Publish / verify curated 1.1.0 in Firestore ---
const published = await publishCuratedPackVersions([PACK]);
v100 = await readVersionDoc("1.0.0");
v110 = await readVersionDoc("1.1.0");
assert.ok(v100.exists, "1.0.0 version doc must exist");
assert.ok(v110.exists, "1.1.0 version doc must exist");
const curated110 = getCuratedPackVersions(PACK).find((v) => v.version === "1.1.0");
assert.ok(curated110);
const fs110 = v110.data;
assert.ok(fs110.template?.knowledge?.some((k) => k.title?.includes("Grief Support")));
assert.ok(fs110.template?.workflows?.some((w) => w.name?.includes("Family Support Check-in")));
assert.ok(Array.isArray(fs110.changelog) && fs110.changelog.length >= 2);
assert.doesNotMatch(JSON.stringify(fs110.template), /"version"\s*:\s*"1\.1\.0"[^}]*$/);
step("step3_firestore_1_1_0", {
    paths: [v100.path, v110.path],
    published,
    changelog: fs110.changelog,
    deltaKb: "FAQ — Grief Support Resources",
    deltaWf: "Follow-up — Family Support Check-in",
});

// --- Step 4: Check update ---
const updates = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}/updates`, { token });
assert.equal(updates.status, 200);
assert.equal(updates.data?.updates?.length, 1);
assert.equal(updates.data.updates[0].latestVersion, "1.1.0");
assert.equal(updates.data.updates[0].currentVersion, "1.0.0");
assert.ok(updates.data.updates[0].changelog?.length >= 2);
step("step4_check_updates", updates.data.updates[0]);

// --- Step 5: Apply update via API ---
const kbBefore = (await listKnowledgeDocuments(testCo)).length;
const wfBefore = (await listWorkflows(testCo)).length;
const apply = await api("POST", "/api/marketplace/update", {
    token,
    body: { companyId: testCo, packId: PACK, targetVersion: "1.1.0" },
});
assert.equal(apply.status, 200, `apply failed ${apply.status} ${JSON.stringify(apply.data)}`);
assert.equal(apply.data?.newVersion, "1.1.0");
assert.equal(apply.data?.merged?.knowledgeAdded, 1);
assert.equal(apply.data?.merged?.workflowsAdded, 1);
evidence.http.applyUpdate = { status: apply.status, body: apply.data };

const reg1Snap = await db.doc(prePath).get();
const reg1 = reg1Snap.data();
assert.equal(reg1.version, "1.1.0");
assert.ok(reg1.knowledgeDocIds?.includes(UPDATE_KB_ID));
assert.ok(reg1.workflowIds?.includes(UPDATE_WF_ID));
assert.ok(!JSON.stringify(reg1).includes('"content":'));
const kbAfter = await listKnowledgeDocuments(testCo);
const wfAfter = await listWorkflows(testCo);
assert.equal(kbAfter.length, kbBefore + 1);
assert.equal(wfAfter.length, wfBefore + 1);
assert.ok(kbAfter.some((d) => d.id === UPDATE_KB_ID));
assert.ok(wfAfter.some((w) => w.id === UPDATE_WF_ID));
assert.equal(apply.data?.validation?.valid, true);
step("step5_apply_update", { registryVersion: reg1.version, kbId: UPDATE_KB_ID, wfId: UPDATE_WF_ID });

// --- Step 6: Idempotency ---
const apply2 = await api("POST", "/api/marketplace/update", {
    token,
    body: { companyId: testCo, packId: PACK, targetVersion: "1.1.0" },
});
evidence.http.applyUpdateRepeat = { status: apply2.status, body: apply2.data };
assert.ok(apply2.status === 400 || apply2.status === 409, `repeat update HTTP ${apply2.status}`);
assert.equal((await listKnowledgeDocuments(testCo)).filter((d) => d.id === UPDATE_KB_ID).length, 1);
assert.equal((await listWorkflows(testCo)).filter((w) => w.id === UPDATE_WF_ID).length, 1);
const reg1b = (await db.doc(prePath).get()).data();
assert.equal(reg1b.version, "1.1.0");
step("step6_idempotency", evidence.http.applyUpdateRepeat);

// --- Step 7: Version conflict (stale expectedVersion via service) ---
await assert.rejects(
    () =>
        updateInstalledRecord(testCo, PACK, {
            expectedVersion: "1.0.0",
            patch: { version: "1.1.0" },
        }),
    /Version mismatch/
);
assert.equal((await db.doc(prePath).get()).data().version, "1.1.0");
step("step7_stale_expectedVersion", "registry unchanged at 1.1.0");

// --- Step 8: Concurrent API updates (same Railway service; not multi-replica proof) ---
const concCo = `${testCo}-conc-upd`;
const concActor = await provisionPortal4bDisposableActor({
    companyId: concCo,
    password: smokePassword,
    email: `portal-4c1-conc-${Date.now()}@ziricai.com`,
});
const { idToken: concToken } = await firebaseToken(concActor.email, smokePassword);
const concInstall = await api("POST", "/api/marketplace/install", {
    token: concToken,
    body: { companyId: concCo, packId: PACK },
});
assert.equal(concInstall.status, 201);
const [cA, cB] = await Promise.all([
    api("POST", "/api/marketplace/update", {
        token: concToken,
        body: { companyId: concCo, packId: PACK, targetVersion: "1.1.0" },
    }),
    api("POST", "/api/marketplace/update", {
        token: concToken,
        body: { companyId: concCo, packId: PACK, targetVersion: "1.1.0" },
    }),
]);
const concOk = [cA, cB].filter((r) => r.status === 200);
const concFail = [cA, cB].filter((r) => r.status !== 200);
assert.equal(concOk.length, 1, `concurrent updates: ${JSON.stringify([cA.status, cB.status])}`);
assert.equal(concFail.length, 1);
assert.equal((await db.doc(tenantMarketplaceInstallPath(concCo, PACK)).get()).data().version, "1.1.0");
assert.equal(
    (await listKnowledgeDocuments(concCo)).filter((d) => d.id === UPDATE_KB_ID).length,
    1
);
evidence.limitations.push(
    "step8_concurrency: two parallel HTTP updates against production API (likely single Railway instance / same Node process); NOT distributed multi-replica safety proof"
);
step("step8_concurrent_http", { statuses: [cA.status, cB.status], scope: "same-process/single-instance" });

// --- Steps 9–11: controlled failures ---
const { installIndustryPack } = await import("../services/platform/industryPackService.js");

// Step 9 (API): unknown target version must not advance registry or report success
const failCo9 = `${testCo}-fail-api-ver`;
const failActor9 = await provisionPortal4bDisposableActor({
    companyId: failCo9,
    password: smokePassword,
    email: `portal-4c1-fail9-${Date.now()}@ziricai.com`,
});
const { idToken: fail9Token } = await firebaseToken(failActor9.email, smokePassword);
const fail9Install = await api("POST", "/api/marketplace/install", {
    token: fail9Token,
    body: { companyId: failCo9, packId: PACK },
});
assert.equal(fail9Install.status, 201);
const badTarget = await api("POST", "/api/marketplace/update", {
    token: fail9Token,
    body: { companyId: failCo9, packId: PACK, targetVersion: "9.9.9" },
});
assert.notEqual(badTarget.status, 200);
assert.equal((await db.doc(tenantMarketplaceInstallPath(failCo9, PACK)).get()).data().version, "1.0.0");
step("step9_api_no_false_success", { http: badTarget.status, code: badTarget.data?.code, registryVersion: "1.0.0" });

evidence.failureMatrixLocal = execSync("node scripts/verify-portal-4c-1-marketplace-update.js", {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
assert.match(evidence.failureMatrixLocal, /MARKETPLACE_UPDATE_RESOURCE_FAILED|resource\/validation failures/);
assert.match(evidence.failureMatrixLocal, /registry commit failure is explicit/);
step("step9_10_11_local_matrix", "verify-portal-4c-1 (RESOURCE/VALIDATION/REGISTRY drift codes)");

// Step 11 supplement: registry commit drift on production Firestore (service-level, disposable tenant)
const driftCo = `${testCo}-fail-reg`;
const driftActor = await provisionPortal4bDisposableActor({
    companyId: driftCo,
    password: smokePassword,
    email: `portal-4c1-fail-reg-${Date.now()}@ziricai.com`,
});
await installIndustryPack(driftCo, PACK, {}, { installedBy: driftActor.uid });
const repo = await getMarketplaceInstallRepository();
const origUpdate = repo.updateInstalledRecord.bind(repo);
repo.updateInstalledRecord = async () => {
    throw new Error("controlled registry commit failure");
};
let driftErr = null;
try {
    await applyUpdate(driftCo, PACK, "1.1.0");
} catch (e) {
    driftErr = e;
} finally {
    repo.updateInstalledRecord = origUpdate;
}
assert.ok(driftErr);
assert.equal(driftErr.code, "MARKETPLACE_UPDATE_REGISTRY_COMMIT_FAILED");
assert.equal((await getInstall(driftCo, PACK)).version, "1.0.0");
const driftCheck = await validatePackUpdate(driftCo, {
    knowledgeDocIds: driftErr.applied?.knowledgeDocIds || [],
    workflowIds: driftErr.applied?.workflowIds || [],
});
assert.equal(driftCheck.valid, true);
evidence.limitations.push(
    "step9 MARKETPLACE_UPDATE_RESOURCE_FAILED + step10 MARKETPLACE_UPDATE_VALIDATION_FAILED: proven via local verify-portal-4c-1 (same codebase) in this run; step11 also exercised on production Firestore via harness repo stub"
);
step("step11_registry_commit_failure", {
    code: driftErr.code,
    registryVersion: "1.0.0",
    driftDetectable: driftCheck.valid,
    appliedIds: driftErr.applied,
});

// --- Step 12: Authorization ---
const unauthUpd = await api("POST", "/api/marketplace/update", {
    body: { companyId: testCo, packId: PACK, targetVersion: "1.1.0" },
});
assert.equal(unauthUpd.status, 401);
if (existsSync(rtbCredPath)) {
    const rtbCreds = readJson(rtbCredPath);
    const { idToken: rtbToken } = await firebaseToken(rtbCreds.email, rtbCreds.password);
    const wrongUpd = await api("POST", "/api/marketplace/update", {
        token: rtbToken,
        body: { companyId: testCo, packId: PACK, targetVersion: "1.1.0" },
    });
    assert.equal(wrongUpd.status, 403);
}
step("step12_auth", { unauthenticated: 401, wrongTenant: existsSync(rtbCredPath) ? 403 : "skipped" });

// --- Step 13: Restart durability ---
console.log("… triggering Railway redeploy (step 13)");
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

v110 = await readVersionDoc("1.1.0");
assert.ok(v110.exists);
const regAfter = (await db.doc(prePath).get()).data();
assert.equal(regAfter.version, "1.1.0");
assert.ok((await listKnowledgeDocuments(testCo)).some((d) => d.id === UPDATE_KB_ID));
assert.ok((await listWorkflows(testCo)).some((w) => w.id === UPDATE_WF_ID));
const updatesAfter = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}/updates`, { token });
assert.equal(updatesAfter.status, 200);
assert.equal((updatesAfter.data?.updates || []).length, 0);
step("step13_restart", { versionDoc110: v110.exists, registryVersion: regAfter.version, updatesAfterRestart: updatesAfter.data?.updates?.length ?? 0 });

// --- Step 14: RTB protection ---
const rtbPath = tenantMarketplaceInstallPath(RTB, PACK);
const rtbSnap = await db.doc(rtbPath).get();
evidence.firestore.rtbInstallDocExists = rtbSnap.exists;
if (rtbSnap.exists) {
    assert.notEqual(rtbSnap.data()?.companyId, testCo);
}
for (const suffix of ["", "-conc-upd", "-fail-res", "-fail-val", "-fail-reg"]) {
    const co = suffix ? `${testCo}${suffix}` : testCo;
    assert.notEqual(co, RTB);
}
step("step14_rtb", { rtbPath, rtbTouchedByTest: false, testTenantsPrefix: testCo });

try {
    execSync("node scripts/verify-portal-4a-marketplace-auth.js --live", { cwd: ROOT, stdio: "inherit" });
    execSync("node scripts/verify-portal-4a-r1-marketplace-security.js --live", { cwd: ROOT, stdio: "inherit" });
    evidence.regression4a = "PASS";
} catch (e) {
    evidence.regression4a = `FAIL: ${e.message}`;
    throw e;
}

const outPath = join(ROOT, "test-results", "portal-4c-1-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-1B production acceptance completed");
console.log("EVIDENCE_FILE", outPath);
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
