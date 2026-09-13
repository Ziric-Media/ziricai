#!/usr/bin/env node
/**
 * PORTAL-4C-4B-2 — Production acceptance (POST review + Firestore durability).
 *
 *   npx @railway/cli run node scripts/verify-portal-4c-4b-2-production-acceptance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import crypto from "node:crypto";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
const PACK = "pack-funeral-ai";
const KNOWN_DISPLAY_NAME = process.env.PORTAL_4C4B2_SMOKE_NAME || "Portal 4C4B2 Review Owner";
process.env.PORTAL_4B_SMOKE_NAME = KNOWN_DISPLAY_NAME;
const API_BASE = (
    process.env.PORTAL_4C4B2_API_BASE ||
    process.env.PORTAL_4C2_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");

const testCo = process.env.PORTAL_4C4B2_TEST_COMPANY || `portal-4c4b2-rev-post-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C4B2_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C4B2_TEST_COMPANY = testCo;
process.env.PORTAL_4C4B2_SMOKE_PASSWORD = smokePassword;

const credPath = join(ROOT, ".portal-4c4b2-disposable-credentials.json");
const resultsDir = join(ROOT, "test-results");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function stop(msg, detail) {
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

async function waitForHealthy() {
    for (let i = 0; i < 28; i++) {
        const health = await api("GET", "/api/health").catch(() => ({ status: 0 }));
        if (health.status === 200) return;
        await sleep(15000);
    }
    stop("API health did not recover after deploy");
}

async function railwayDeploy(label) {
    console.log(`… Railway deploy (${label})`);
    await new Promise((resolve, reject) => {
        const child = spawn("npx", ["@railway/cli", "up", "--detach"], {
            cwd: ROOT,
            shell: true,
            stdio: "inherit",
        });
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`railway up exit ${code}`))));
    });
    await waitForHealthy();
    await sleep(8000);
}

const evidence = {
    gate: "PORTAL-4C-4B-2-production-acceptance",
    apiBase: API_BASE,
    primaryTenant: testCo,
    knownDisplayName: KNOWN_DISPLAY_NAME,
    steps: {},
    http: {},
    firestore: {},
    limitations: [],
};

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

console.log("verify-portal-4c-4b-2-production-acceptance");
console.log("testCompany", testCo);

const { provisionPortal4bDisposableActor } = await import("./provision-portal-4b-disposable-acceptance-actor.mjs");

assert.doesNotMatch(read("services/platform/marketplaceInstaller.js"), /saveMarketplaceReview/);
assert.match(read("api/app.js"), /submitMarketplacePackReview/);
step("static_legacy_hooks_absent", true);

await railwayDeploy("4C-4B-2 initial");
step("deploy_initial", { ok: true });

const { getAdminFirestore, hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
const { platformReviewPath, platformRatingPath, tenantMarketplaceInstallPath } = await import(
    "../services/database/schema.js"
);
const { marketplaceReviewDocId } = await import("../services/platform/marketplaceReviewModel.js");
const { installIndustryPack } = await import("../services/platform/industryPackService.js");
const { claimInstall, failInstall } = await import("../services/platform/marketplaceInstallService.js");
const { getMarketplaceInstallRepository } = await import("../services/platform/marketplaceInstallRepository.js");

assert.ok(hasAdminCredentials(), "Firebase Admin required — run via railway run");
const db = getAdminFirestore();

const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 4C4B2 Review POST ${testCo}`,
});
const { idToken: token, uid } = await firebaseToken(actor.email, smokePassword);
writeFileSync(
    credPath,
    `${JSON.stringify(
        {
            companyId: testCo,
            email: actor.email,
            uid,
            password: smokePassword,
            displayName: KNOWN_DISPLAY_NAME,
            provisionedAt: new Date().toISOString(),
        },
        null,
        2
    )}\n`,
    "utf8"
);
assert.equal(actor.uid, uid);
step("actor", { email: actor.email, uid, companyId: testCo });

await installIndustryPack(testCo, PACK, {}, { installedBy: uid });

async function provisionActor(co, label) {
    const actorRow = await provisionPortal4bDisposableActor({
        companyId: co,
        password: smokePassword,
        companyName: `${label} ${co}`,
    });
    const auth = await firebaseToken(actorRow.email, smokePassword);
    return { ...actorRow, token: auth.idToken, authUid: auth.uid };
}

const noInstallCo = `${testCo}-noinstall`;
const noInstallActor = await provisionActor(noInstallCo, "No install");

const installingCo = `${testCo}-installing`;
const installingActor = await provisionActor(installingCo, "Installing");
await claimInstall(installingCo, PACK, { installedBy: installingActor.uid });

const staleCo = `${testCo}-stale`;
const staleActor = await provisionActor(staleCo, "Stale");
await claimInstall(staleCo, PACK, { installedBy: staleActor.uid });
const installRepo = await getMarketplaceInstallRepository();
const staleKey = `${staleCo}::${PACK}`;
const staleRec = installRepo.docs?.get(staleKey) || (await installRepo.getInstall(staleCo, PACK));
if (installRepo.docs) {
    staleRec.updatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    installRepo.docs.set(staleKey, staleRec);
} else {
    const ref = db.doc(tenantMarketplaceInstallPath(staleCo, PACK));
    await ref.set({ ...staleRec, updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() }, { merge: true });
}

const failedCo = `${testCo}-failed`;
const failedActor = await provisionActor(failedCo, "Failed");
const failedClaim = await claimInstall(failedCo, PACK, { installedBy: failedActor.uid });
await failInstall(failedCo, PACK, failedClaim.installAttemptId, "4C-4B-2 acceptance simulated failure");

const concCo = `${testCo}-conc`;
const concActor = await provisionActor(concCo, "Concurrent");
await installIndustryPack(concCo, PACK, {}, { installedBy: concActor.uid });

const unauth = await api("POST", "/api/marketplace/review", {
    body: { companyId: testCo, packId: PACK, rating: 5, title: "x", body: "y" },
});
assert.equal(unauth.status, 401);
evidence.http.unauthenticated = unauth.status;
step("unauthenticated_401", unauth.status);

const wrongTenant = await api("POST", "/api/marketplace/review", {
    token,
    body: { companyId: noInstallCo, packId: PACK, rating: 5, title: "x", body: "y" },
});
assert.equal(wrongTenant.status, 403);
evidence.http.wrongTenant = wrongTenant.status;
step("wrong_tenant_403", wrongTenant.status);

const fakeAuthor = await api("POST", "/api/marketplace/review", {
    token,
    body: {
        companyId: testCo,
        packId: PACK,
        rating: 5,
        title: "Should not persist",
        body: "Fake author attempt",
        author: "Elon Musk",
    },
});
assert.equal(fakeAuthor.status, 400);
assert.equal(fakeAuthor.data?.code, "CLIENT_AUTHOR_FORBIDDEN");
evidence.http.fakeAuthor = { status: fakeAuthor.status, code: fakeAuthor.data?.code };
step("fake_client_author_400", evidence.http.fakeAuthor);

for (const [label, co, actorToken, expected] of [
    ["uninstalled", noInstallCo, noInstallActor.token, 403],
    ["installing", installingCo, installingActor.token, 403],
    ["stale_installing", staleCo, staleActor.token, 403],
    ["failed", failedCo, failedActor.token, 403],
]) {
    const res = await api("POST", "/api/marketplace/review", {
        token: actorToken,
        body: { companyId: co, packId: PACK, rating: 4, title: `${label}`, body: "ineligible" },
    });
    assert.equal(res.status, expected, `${label} expected ${expected}`);
    evidence.http[`ineligible_${label}`] = res.status;
}
step("eligibility_matrix_403", {
    uninstalled: 403,
    installing: 403,
    stale: 403,
    failed: 403,
});

const success = await api("POST", "/api/marketplace/review", {
    token,
    body: {
        companyId: testCo,
        packId: PACK,
        rating: 5,
        title: "Production acceptance review",
        body: "Verified installed-tenant review persistence.",
    },
});
assert.equal(success.status, 201);
assert.equal(success.data?.review?.authorDisplayName, KNOWN_DISPLAY_NAME);
assert.equal(success.data?.review?.companyId, undefined);
assert.equal(success.data?.review?.authorUid, undefined);
evidence.http.success = {
    status: success.status,
    authorDisplayName: success.data?.review?.authorDisplayName,
    reviewId: success.data?.review?.id,
};
step("installed_201", evidence.http.success);

const reviewId = marketplaceReviewDocId(testCo, PACK);
assert.equal(success.data?.review?.id, reviewId);

const reviewSnap = await db.doc(platformReviewPath(reviewId)).get();
assert.ok(reviewSnap.exists, "review doc must exist in Firestore");
const reviewData = reviewSnap.data();
assert.equal(reviewData.authorUid, uid);
assert.equal(reviewData.authorDisplayName, KNOWN_DISPLAY_NAME);
assert.equal(reviewData.companyId, testCo);
assert.equal(reviewData.status, "published");
assert.equal(reviewSnap.ref.path, platformReviewPath(reviewId));
evidence.firestore.reviewPath = reviewSnap.ref.path;

const ratingSnap = await db.doc(platformRatingPath(PACK)).get();
assert.ok(ratingSnap.exists, "rating aggregate must exist");
assert.ok(ratingSnap.data()?.count >= 1);
assert.equal(ratingSnap.ref.path, platformRatingPath(PACK));
evidence.firestore.ratingPath = ratingSnap.ref.path;
evidence.firestore.ratingCount = ratingSnap.data()?.count;
step("firestore_review_and_aggregate", evidence.firestore);

const dup = await api("POST", "/api/marketplace/review", {
    token,
    body: { companyId: testCo, packId: PACK, rating: 4, title: "dup", body: "dup" },
});
assert.equal(dup.status, 409);
assert.equal(dup.data?.code, "DUPLICATE_REVIEW");
evidence.http.duplicate = dup.status;
step("duplicate_409", dup.status);

const concResults = await Promise.all(
    Array.from({ length: 8 }, () =>
        api("POST", "/api/marketplace/review", {
            token: concActor.token,
            body: { companyId: concCo, packId: PACK, rating: 4, title: "race", body: "race" },
        })
    )
);
const conc201 = concResults.filter((r) => r.status === 201);
const conc409 = concResults.filter((r) => r.status === 409);
assert.equal(conc201.length, 1);
assert.equal(conc409.length, 7);
evidence.http.concurrent = { created: conc201.length, duplicate: conc409.length };
step("concurrent_one_201", evidence.http.concurrent);

evidence.limitations.push(
    "REVIEW_PERSISTENCE_FAILED (503) is not injected in production; covered by local verify-portal-4c-4b-2-marketplace-review-post.js"
);

const preRestartReview = { ...reviewSnap.data() };
const preRestartRating = { ...ratingSnap.data() };

await railwayDeploy("4C-4B-2 restart durability");
const reviewAfter = await db.doc(platformReviewPath(reviewId)).get();
const ratingAfter = await db.doc(platformRatingPath(PACK)).get();
assert.ok(reviewAfter.exists);
assert.equal(reviewAfter.data()?.authorUid, preRestartReview.authorUid);
assert.equal(reviewAfter.data()?.authorDisplayName, KNOWN_DISPLAY_NAME);
assert.ok(ratingAfter.exists);
assert.ok(ratingAfter.data()?.count >= preRestartRating.count);
evidence.restartDurability = {
    reviewPersists: reviewAfter.exists,
    ratingPersists: ratingAfter.exists,
    authorUid: reviewAfter.data()?.authorUid,
};
step("restart_firestore_durability", evidence.restartDurability);

assert.notEqual(testCo, RTB);
const rtbSnap = await db.doc(tenantMarketplaceInstallPath(RTB, PACK)).get();
evidence.rtb = { testTenant: testCo, rtbFuneralInstallExists: rtbSnap.exists };
step("rtb_untouched", evidence.rtb);

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
execSync("node scripts/verify-portal-4c-3-marketplace-payment-ux.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4c-4a-marketplace-review-honesty.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4c-4b-1-marketplace-review-foundation.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4c-4b-2-marketplace-review-post.js", {
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
step("regressions", { local: "4A→4C-4B-2 PASS", live4a: evidence.regression4aLive });

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-4b-2-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-4B-2 production acceptance completed");
console.log("EVIDENCE_FILE", outPath);
console.log("CREDENTIALS_FILE", credPath);
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
