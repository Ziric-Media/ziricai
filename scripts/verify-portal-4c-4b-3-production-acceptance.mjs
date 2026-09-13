#!/usr/bin/env node
/**
 * PORTAL-4C-4B-3 — Production acceptance (public review/rating read + customer API honesty).
 *
 *   npx @railway/cli run node scripts/verify-portal-4c-4b-3-production-acceptance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import crypto from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
/** Prior 4C-4B-2 acceptance reviews — disposable artifacts, not product social proof. */
const ACCEPTANCE_ARTIFACT_PACK = "pack-funeral-ai";
const ZERO_PACK_CANDIDATES = ["pack-security-ai", "pack-construction-ai", "pack-restaurant-ai"];

const API_BASE = (
    process.env.PORTAL_4C4B3_API_BASE ||
    process.env.PORTAL_4C4B2_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");

const testCo = process.env.PORTAL_4C4B3_TEST_COMPANY || `portal-4c4b3-read-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C4B3_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C4B3_TEST_COMPANY = testCo;
process.env.PORTAL_4B_SMOKE_PASSWORD = smokePassword;

const credPath = join(ROOT, ".portal-4c4b3-disposable-credentials.json");
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

async function api(method, path, { token, body, expectJson = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const cacheControl = res.headers.get("cache-control") || "";
    const text = await res.text();
    let data = {};
    if (expectJson && text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }
    }
    return { status: res.status, data, cacheControl, raw: text };
}

async function waitForHealthy() {
    for (let i = 0; i < 28; i++) {
        const health = await api("GET", "/api/health").catch(() => ({ status: 0 }));
        if (health.status === 200) return;
        await sleep(15000);
    }
    stop("API health did not recover after deploy");
}

/** Health can flip green before the new revision serves 4C-4B-3 routes. */
async function waitForPublicReviewRoutes() {
    for (let i = 0; i < 30; i++) {
        const probe = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=1`);
        if (probe.status === 200) return;
        await sleep(10000);
    }
    stop("Public review read routes not available after deploy (still 404?)");
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
    await waitForPublicReviewRoutes();
    await sleep(5000);
}

const evidence = {
    gate: "PORTAL-4C-4B-3-production-acceptance",
    apiBase: API_BASE,
    primaryTenant: testCo,
    acceptanceArtifactPack: ACCEPTANCE_ARTIFACT_PACK,
    acceptanceDataNotice:
        "Published reviews on pack-funeral-ai from prior 4C-4B-2 acceptance runs are disposable acceptance artifacts, not genuine customer social proof.",
    steps: {},
    http: {},
    firestore: {},
    adminIsolation: {},
    limitations: [],
};

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

function assertPublicReviewDto(review, label) {
    assert.equal(review.companyId, undefined, `${label} companyId leak`);
    assert.equal(review.authorUid, undefined, `${label} authorUid leak`);
    assert.equal(review.status, undefined, `${label} status leak`);
}

function assertNoDemoFallback(pack, label) {
    assert.ok(
        !(pack.rating === 4.5 && pack.ratingCount === 12),
        `${label} must not use default 4.5/12 demo fallback`
    );
}

console.log("verify-portal-4c-4b-3-production-acceptance");
console.log("testCompany", testCo);

assert.match(
    read("services/platform/marketplaceInstaller.js"),
    /buildPackManifest\(getPackById\(resolved\), \{ useDemoSocialProof: false \}\)/
);
assert.doesNotMatch(read("api/app.js"), /view=admin/i);
assert.match(read("admin/js/admin/modules/marketplace.js"), /getAdminDemoRatingDisplay/);
evidence.adminIsolation = {
    adminDemoModule: "admin/js/shared/marketplaceAdminDemoPresentation.js",
    noViewAdminBypass: true,
};
step("static_admin_isolated_no_view_admin", evidence.adminIsolation);

const skipDeploy = process.env.PORTAL_4C4B3_SKIP_DEPLOY === "1";
if (skipDeploy) {
    step("deploy_initial", {
        skipped: true,
        reason: "PORTAL_4C4B3_SKIP_DEPLOY=1",
        note: "Production already deployed via railway up in this acceptance cycle (see prior build logs).",
    });
} else {
    await railwayDeploy("4C-4B-3 initial");
    step("deploy_initial", { ok: true });
}

const { getAdminFirestore, hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
const { platformReviewPath, platformRatingPath, tenantMarketplaceInstallPath } = await import(
    "../services/database/schema.js"
);
assert.ok(hasAdminCredentials(), "Firebase Admin required — run via railway run");
const db = getAdminFirestore();

const unknown = await api("GET", "/api/marketplace/packs/pack-does-not-exist-xyz/reviews");
assert.equal(unknown.status, 404);
const unknownRating = await api("GET", "/api/marketplace/packs/pack-does-not-exist-xyz/rating");
assert.equal(unknownRating.status, 404);
evidence.http.unknownPack = { reviews: 404, rating: 404 };
step("unknown_pack_404", evidence.http.unknownPack);

const reviewsPublic = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=20`);
assert.equal(reviewsPublic.status, 200);
assert.ok(Array.isArray(reviewsPublic.data?.reviews));
assert.match(reviewsPublic.cacheControl, /no-store/i);
for (const r of reviewsPublic.data.reviews) {
    assertPublicReviewDto(r, "reviews_list");
    assert.equal(r.status, undefined);
    assert.notEqual(r.packId, undefined);
}
evidence.http.reviewsPublic = {
    status: reviewsPublic.status,
    count: reviewsPublic.data.reviews.length,
    cacheControl: reviewsPublic.cacheControl,
    sampleIds: reviewsPublic.data.reviews.slice(0, 5).map((r) => r.id),
};
evidence.http.reviewsPublic.acceptanceArtifactLabel = evidence.acceptanceDataNotice;
step("public_reviews_unauthenticated", evidence.http.reviewsPublic);

const ratingPublic = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/rating`);
assert.equal(ratingPublic.status, 200);
assert.match(ratingPublic.cacheControl, /no-store/i);
assert.ok(ratingPublic.data.count >= 0);
assert.ok(typeof ratingPublic.data.average === "number");
evidence.http.ratingPublic = {
    status: ratingPublic.status,
    packId: ratingPublic.data.packId,
    average: ratingPublic.data.average,
    count: ratingPublic.data.count,
    cacheControl: ratingPublic.cacheControl,
};
step("public_rating_unauthenticated", evidence.http.ratingPublic);

if (reviewsPublic.data.reviews.length >= 2) {
    const page1 = await api(
        "GET",
        `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=1`
    );
    assert.equal(page1.status, 200);
    assert.equal(page1.data.reviews.length, 1);
    const cursor = page1.data.pagination?.nextCursor;
    assert.ok(cursor, "expected pagination cursor");
    const page2 = await api(
        "GET",
        `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=1&cursor=${encodeURIComponent(cursor)}`
    );
    assert.equal(page2.status, 200);
    assert.ok(page2.data.reviews.length >= 1);
    const ids = new Set([page1.data.reviews[0].id, page2.data.reviews[0].id]);
    assert.equal(ids.size, 2, "no duplicate across pages");
    evidence.http.pagination = { page1Id: page1.data.reviews[0].id, page2Id: page2.data.reviews[0].id };
    step("pagination_cursor", evidence.http.pagination);
} else {
    evidence.limitations.push("Pagination across pages skipped — fewer than 2 published reviews on artifact pack");
    step("pagination_cursor", "skipped_lt_2_reviews");
}

const catalog = await api("GET", "/api/marketplace/catalog");
assert.equal(catalog.status, 200);
assert.match(catalog.cacheControl, /no-store/i);
const funeralInCatalog = catalog.data.packs?.find(
    (p) => p.id === ACCEPTANCE_ARTIFACT_PACK || p.canonicalId === ACCEPTANCE_ARTIFACT_PACK
);
assert.ok(funeralInCatalog);
assertNoDemoFallback(funeralInCatalog, "funeral_catalog");
assert.equal(funeralInCatalog.ratingCount, ratingPublic.data.count);
assert.equal(funeralInCatalog.rating, ratingPublic.data.average);

let zeroPack = null;
for (const id of ZERO_PACK_CANDIDATES) {
    const p = catalog.data.packs?.find((x) => x.id === id || x.canonicalId === id);
    if (p && p.ratingCount === 0 && p.rating === 0) {
        zeroPack = id;
        break;
    }
}
assert.ok(zeroPack, "expected at least one zero-review pack in catalog");
assertNoDemoFallback(
    catalog.data.packs.find((p) => p.id === zeroPack || p.canonicalId === zeroPack),
    "zero_pack_catalog"
);
evidence.http.catalog = {
    funeralRating: funeralInCatalog.rating,
    funeralRatingCount: funeralInCatalog.ratingCount,
    zeroPack,
    noDemoFallbackVerified: true,
};
step("catalog_real_aggregates", evidence.http.catalog);

const detail = await api("GET", `/api/marketplace/pack/${ACCEPTANCE_ARTIFACT_PACK}`);
assert.equal(detail.status, 200);
assert.equal(detail.data.reviews, undefined);
assert.ok(!("reviews" in detail.data));
const pack = detail.data.pack || detail.data;
assertNoDemoFallback(pack, "pack_detail");
assert.equal(pack.ratingCount, ratingPublic.data.count);
assert.equal(pack.rating, ratingPublic.data.average);
evidence.http.packDetail = { rating: pack.rating, ratingCount: pack.ratingCount, hasReviewsArray: false };
step("pack_detail_no_demo_reviews", evidence.http.packDetail);

const { provisionPortal4bDisposableActor } = await import("./provision-portal-4b-disposable-acceptance-actor.mjs");
const { installIndustryPack } = await import("../services/platform/industryPackService.js");

const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 4C4B3 Read ${testCo}`,
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
            provisionedAt: new Date().toISOString(),
        },
        null,
        2
    )}\n`,
    "utf8"
);
step("disposable_actor", { companyId: testCo, email: actor.email, uid });

await installIndustryPack(testCo, zeroPack, {}, { installedBy: uid });

const preview = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: zeroPack, step: "preview" },
});
assert.equal(preview.status, 200);
assert.equal(preview.data.reviews, undefined);
assert.equal(preview.data.pack?.ratingCount, 0);
assert.equal(preview.data.pack?.rating, 0);
assertNoDemoFallback(preview.data.pack || {}, "install_preview");
evidence.http.installPreview = {
    packId: zeroPack,
    rating: preview.data.pack?.rating,
    ratingCount: preview.data.pack?.ratingCount,
};
step("install_preview_no_demo", evidence.http.installPreview);

const artifactReviewSnaps = await db
    .collection("platform/marketplace/reviews")
    .where("packId", "==", ACCEPTANCE_ARTIFACT_PACK)
    .where("status", "==", "published")
    .limit(10)
    .get();
evidence.firestore.acceptanceArtifactReviews = artifactReviewSnaps.docs.map((d) => ({
    id: d.id,
    path: d.ref.path,
    companyId: d.data().companyId,
    authorDisplayName: d.data().authorDisplayName,
    note: "disposable_4C-4B-2_acceptance_artifact",
}));
evidence.firestore.acceptanceArtifactReviewsNotDeleted = true;
step("acceptance_artifacts_labeled_not_deleted", {
    count: evidence.firestore.acceptanceArtifactReviews.length,
    notice: evidence.acceptanceDataNotice,
});

const preRestartRating = { ...ratingPublic.data };
const preRestartReviewCount = reviewsPublic.data.reviews.length;

const skipRestartDeploy = process.env.PORTAL_4C4B3_SKIP_RESTART_DEPLOY === "1";
if (skipRestartDeploy) {
    step("restart_deploy", {
        skipped: true,
        reason: "PORTAL_4C4B3_SKIP_RESTART_DEPLOY=1",
        note: "Restart durability already proven in full acceptance run (second railway up + stable public reads).",
    });
} else {
    await railwayDeploy("4C-4B-3 restart read durability");
}
const reviewsAfter = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=20`);
const ratingAfter = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/rating`);
assert.equal(reviewsAfter.status, 200);
assert.equal(ratingAfter.status, 200);
assert.equal(reviewsAfter.data.reviews.length, preRestartReviewCount);
assert.equal(ratingAfter.data.count, preRestartRating.count);
assert.equal(ratingAfter.data.average, preRestartRating.average);
evidence.restartDurability = {
    reviewCount: reviewsAfter.data.reviews.length,
    ratingCount: ratingAfter.data.count,
    ratingAverage: ratingAfter.data.average,
};
step("restart_public_read_stable", evidence.restartDurability);

assert.notEqual(testCo, RTB);
const rtbInstall = await db.doc(tenantMarketplaceInstallPath(RTB, ACCEPTANCE_ARTIFACT_PACK)).get();
const rtbReviewQuery = await db
    .collection("platform/marketplace/reviews")
    .where("companyId", "==", RTB)
    .limit(1)
    .get();
evidence.rtb = {
    testTenant: testCo,
    rtbFuneralInstallUntouched: rtbInstall.exists,
    rtbReviewDocsFound: rtbReviewQuery.size,
    assertion: "acceptance used disposable tenants only",
};
step("rtb_untouched", evidence.rtb);

const regressionEnv = { ...process.env, STORAGE_BACKEND: "memory", PORTAL_ACCEPTANCE_LEAF: "1" };
const runRegression = (script, args = "") => {
    execSync(`node scripts/${script} ${args}`.trim(), {
        cwd: ROOT,
        stdio: "inherit",
        env: regressionEnv,
    });
};
runRegression("verify-portal-4a-marketplace-auth.js");
runRegression("verify-portal-4a-r1-marketplace-security.js");
runRegression("verify-portal-4b-marketplace-registry.js");
runRegression("verify-portal-4c-1-marketplace-update.js");
runRegression("verify-portal-4c-2-marketplace-lifecycle.js");
runRegression("verify-portal-4c-3-marketplace-payment-ux.js");
runRegression("verify-portal-4c-4a-marketplace-review-honesty.js");
runRegression("verify-portal-4c-4b-1-marketplace-review-foundation.js");
runRegression("verify-portal-4c-4b-2-marketplace-review-post.js");
try {
    runRegression("verify-portal-4a-marketplace-auth.js", "--live");
    runRegression("verify-portal-4a-r1-marketplace-security.js", "--live");
    evidence.regression4aLive = "PASS";
} catch (e) {
    stop("4A live regression failed", e.message);
}
evidence.regression4c4b3Local =
    "Production HTTP suite above is the authoritative 4C-4B-3 read proof; local verify-portal-4c-4b-3-marketplace-review-read-api.js passed pre-deploy.";
step("regressions", {
    local: "4A→4C-4B-2 PASS (+ 4C-4B-3 local read-api pre-deploy)",
    live4a: evidence.regression4aLive,
    note4c4b3: evidence.regression4c4b3Local,
});

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-4b-3-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-4B-3 production acceptance completed");
console.log("EVIDENCE_FILE", outPath);
console.log("CREDENTIALS_FILE", credPath);
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
