#!/usr/bin/env node
/**
 * PORTAL-4C-4B-4 — Production acceptance (Portal review read on app.ziricai.com + public API).
 *
 * Prerequisites:
 *   - App deployed to Netlify (prepare-sites app + netlify deploy --prod from app/)
 *   - Railway API serving 4C-4B-3 public review routes
 *
 * Run:
 *   node scripts/verify-portal-4c-4b-4-production-acceptance.mjs
 *
 * Optional (disposable tenant + Firestore labels):
 *   npx @railway/cli run node scripts/verify-portal-4c-4b-4-production-acceptance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
const ACCEPTANCE_ARTIFACT_PACK = "pack-funeral-ai";
const ZERO_PACK = "pack-security-ai";

const API_BASE = (
    process.env.PORTAL_4C4B4_API_BASE ||
    process.env.PORTAL_4C4B3_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");
const PORTAL_ORIGIN = (process.env.PORTAL_4C4B4_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");

const testCo = process.env.PORTAL_4C4B4_TEST_COMPANY || `portal-4c4b4-read-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C4B4_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C4B4_TEST_COMPANY = testCo;
process.env.PORTAL_4B_SMOKE_PASSWORD = smokePassword;

const credPath = join(ROOT, ".portal-4c4b4-disposable-credentials.json");
const resultsDir = join(ROOT, "test-results");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
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

async function api(method, path, { token, body, origin = API_BASE } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${origin}${path}`, {
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
    return { status: res.status, data, raw: text };
}

function stop(msg, detail) {
    console.error("STOP:", msg, detail ?? "");
    process.exit(1);
}

const evidence = {
    gate: "PORTAL-4C-4B-4-production-acceptance",
    apiBase: API_BASE,
    portalOrigin: PORTAL_ORIGIN,
    primaryTenant: testCo,
    acceptanceArtifactPack: ACCEPTANCE_ARTIFACT_PACK,
    zeroReviewPack: ZERO_PACK,
    acceptanceDataNotice:
        "Published reviews on pack-funeral-ai from prior 4C-4B-2 acceptance runs are disposable acceptance artifacts, not genuine customer social proof.",
    steps: {},
    http: {},
    deploymentAssets: {},
    cssOwnership: {},
    architecture: {},
    browser: {},
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

console.log("verify-portal-4c-4b-4-production-acceptance");
console.log("testCompany", testCo);

// --- Deployed Portal assets (cache-busted) ---
const bust = Date.now();
const mpUrl = `${PORTAL_ORIGIN}/js/portal/modules/marketplace.js?v=${bust}`;
const apiUrl = `${PORTAL_ORIGIN}/js/portal/api.js?v=${bust}`;
const cssUrl = `${PORTAL_ORIGIN}/css/admin-dashboard.css?v=${bust}`;
const indexUrl = `${PORTAL_ORIGIN}/?v=${bust}`;

const [mpRes, apiRes, cssRes, indexRes] = await Promise.all([
    fetch(mpUrl),
    fetch(apiUrl),
    fetch(cssUrl),
    fetch(indexUrl),
]);
assert.equal(mpRes.status, 200);
assert.equal(apiRes.status, 200);
assert.equal(cssRes.status, 200);
assert.equal(indexRes.status, 200);

const mpSrc = await mpRes.text();
const apiSrc = await apiRes.text();
const cssSrc = await cssRes.text();
const indexHtml = await indexRes.text();

const assetChecks = {
    fetchPackReviewsInModule: mpSrc.includes("fetchPackReviews"),
    loadPackReviewsIntoMount: mpSrc.includes("loadPackReviewsIntoMount"),
    errorDistinctFromEmpty:
        mpSrc.includes("Reviews couldn't be loaded") && mpSrc.includes("No customer reviews yet"),
    noSubmitPackReview: !mpSrc.includes("submitPackReview"),
    noWriteReviewUi: !/Write a Review/i.test(mpSrc),
    noDemoRatings: !mpSrc.includes("PACK_DEMO_RATINGS"),
    noTopRated: !/Top rated/i.test(mpSrc),
    renderStarsFromApi: mpSrc.includes("renderStarsFromApi"),
    apiHelperFetchPackReviews: apiSrc.includes("fetchPackReviews") && apiSrc.includes("/api/marketplace/packs/"),
    noFirestoreInPortalApi: !/platform\/marketplace\/reviews/i.test(apiSrc),
    cssMpReviewsError: cssSrc.includes(".mp-reviews-error"),
    cssMpReviewHead: cssSrc.includes(".mp-review-head"),
    cssMobile640: cssSrc.includes("@media (max-width: 640px)"),
    indexLinksAdminDashboardCss: indexHtml.includes("css/admin-dashboard.css"),
    indexNotAdminOnlyShell: !indexHtml.includes("admin-console") && indexHtml.includes("portal-body"),
};
for (const [k, v] of Object.entries(assetChecks)) {
    assert.ok(v, `deployment asset check failed: ${k}`);
}
evidence.deploymentAssets = { mpUrl, apiUrl, cssUrl, ...assetChecks };
evidence.cssOwnership = {
    note: "Portal index.html loads css/admin-dashboard.css (shared Marketplace styles); not Admin SPA shell.",
    stylesOnPortalOrigin: true,
    mpClassesPresentInCss: assetChecks.cssMpReviewsError && assetChecks.cssMpReviewHead,
};
step("A_deployment_assets_and_css", evidence.cssOwnership);

// --- B. pack-funeral-ai (acceptance artifacts) ---
const reviewsPublic = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=20`);
assert.equal(reviewsPublic.status, 200);
assert.ok(Array.isArray(reviewsPublic.data?.reviews));
for (const r of reviewsPublic.data.reviews) {
    assertPublicReviewDto(r, "funeral_reviews");
    assert.ok(r.authorDisplayName, "authorDisplayName required on public DTO");
    assert.ok(typeof r.rating === "number");
}
const ratingPublic = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/rating`);
assert.equal(ratingPublic.status, 200);

evidence.http.funeral = {
    labeled: evidence.acceptanceDataNotice,
    ratingAverage: ratingPublic.data.average,
    ratingCount: ratingPublic.data.count,
    reviewCount: reviewsPublic.data.reviews.length,
    sampleAuthors: reviewsPublic.data.reviews.slice(0, 3).map((r) => r.authorDisplayName),
};
step("B_funeral_aggregate_and_reviews_api", evidence.http.funeral);

if (reviewsPublic.data.reviews.length >= 2) {
    const page1 = await api("GET", `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=1`);
    const cursor = page1.data.pagination?.nextCursor;
    assert.ok(cursor);
    const page2 = await api(
        "GET",
        `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=1&cursor=${encodeURIComponent(cursor)}`
    );
    assert.equal(page2.status, 200);
    evidence.http.pagination = {
        page1Id: page1.data.reviews[0]?.id,
        page2Id: page2.data.reviews[0]?.id,
    };
    step("B_pagination_cursor", evidence.http.pagination);
} else {
    evidence.limitations.push("Load-more UI not API-proven — fewer than 2 published reviews on artifact pack");
}

// --- C. pack-security-ai zero state ---
const zeroRating = await api("GET", `/api/marketplace/packs/${ZERO_PACK}/rating`);
assert.equal(zeroRating.status, 200);
assert.equal(zeroRating.data.count, 0);
assert.equal(zeroRating.data.average, 0);
const zeroReviews = await api("GET", `/api/marketplace/packs/${ZERO_PACK}/reviews?limit=5`);
assert.equal(zeroReviews.status, 200);
assert.equal(zeroReviews.data.reviews.length, 0);

const catalog = await api("GET", "/api/marketplace/catalog");
const funeralInCatalog = catalog.data.packs?.find(
    (p) => p.id === ACCEPTANCE_ARTIFACT_PACK || p.canonicalId === ACCEPTANCE_ARTIFACT_PACK
);
const securityInCatalog = catalog.data.packs?.find((p) => p.id === ZERO_PACK || p.canonicalId === ZERO_PACK);
assert.ok(funeralInCatalog);
assert.ok(securityInCatalog);
assertNoDemoFallback(funeralInCatalog, "funeral_catalog");
assertNoDemoFallback(securityInCatalog, "security_catalog");
assert.equal(securityInCatalog.ratingCount, 0);
assert.equal(securityInCatalog.rating, 0);

evidence.http.zeroPack = {
    packId: ZERO_PACK,
    catalogRating: securityInCatalog.rating,
    catalogRatingCount: securityInCatalog.ratingCount,
    reviewsLength: zeroReviews.data.reviews.length,
};
step("C_zero_review_pack_api", evidence.http.zeroPack);

// --- Portal proxy path (same-origin as browser) ---
const proxyReviews = await api(
    "GET",
    `/api/marketplace/packs/${ACCEPTANCE_ARTIFACT_PACK}/reviews?limit=1`,
    { origin: PORTAL_ORIGIN }
);
assert.equal(proxyReviews.status, 200, "app.ziricai.com /api proxy must reach review read route");
evidence.http.portalProxy = { status: proxyReviews.status, path: "/api/marketplace/packs/:packId/reviews" };
step("F_architecture_portal_proxy", evidence.http.portalProxy);

evidence.architecture = {
    portalCallsPublicReviewsGet: true,
    noFirestoreInDeployedPortalApi: assetChecks.noFirestoreInPortalApi,
    noReviewPostInPortalModule: assetChecks.noSubmitPackReview,
    noDemoRatingSourceInPortalModule: assetChecks.noDemoRatings,
    errorVsEmptyInSource: assetChecks.errorDistinctFromEmpty,
};
step("F_architecture_static", evidence.architecture);

// --- Disposable tenant (optional Firestore labeling) ---
let token = null;
try {
    const { hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
    if (hasAdminCredentials()) {
        const actor = await provisionPortal4bDisposableActor({
            companyId: testCo,
            password: smokePassword,
            companyName: `Portal 4C4B4 Read ${testCo}`,
        });
        ({ idToken: token } = await firebaseToken(actor.email, smokePassword));
        writeFileSync(
            credPath,
            `${JSON.stringify(
                {
                    companyId: testCo,
                    email: actor.email,
                    password: smokePassword,
                    provisionedAt: new Date().toISOString(),
                },
                null,
                2
            )}\n`,
            "utf8"
        );
        step("disposable_actor", { companyId: testCo, email: actor.email });

        const { getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
        const db = getAdminFirestore();
        const artifactReviewSnaps = await db
            .collection("platform/marketplace/reviews")
            .where("packId", "==", ACCEPTANCE_ARTIFACT_PACK)
            .where("status", "==", "published")
            .limit(10)
            .get();
        evidence.firestore = {
            acceptanceArtifactReviews: artifactReviewSnaps.docs.map((d) => ({
                id: d.id,
                authorDisplayName: d.data().authorDisplayName,
                note: "disposable_4C-4B-2_acceptance_artifact",
            })),
        };
        step("acceptance_artifacts_labeled", {
            count: evidence.firestore.acceptanceArtifactReviews.length,
            notice: evidence.acceptanceDataNotice,
        });
    } else {
        evidence.limitations.push("Firebase Admin unavailable — skipped disposable tenant + Firestore artifact labels");
    }
} catch (e) {
    evidence.limitations.push(`Disposable actor skipped: ${e.message}`);
}

if (token) {
    const authedCatalog = await api("GET", `/api/marketplace/catalog?companyId=${encodeURIComponent(testCo)}`, {
        token,
    });
    assert.equal(authedCatalog.status, 200);
    const preview = await api("POST", "/api/marketplace/install", {
        token,
        body: { companyId: testCo, packId: ZERO_PACK, step: "preview" },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.pack?.ratingCount, 0);
    evidence.http.authedSmoke = { catalog: authedCatalog.status, preview: preview.status };
    step("D_marketplace_regression_api_smoke", evidence.http.authedSmoke);
}

// --- Local regressions ---
const regressionEnv = { ...process.env, STORAGE_BACKEND: "memory", PORTAL_ACCEPTANCE_LEAF: "1" };
const runRegression = (script) => {
    execSync(`node scripts/${script}`, { cwd: ROOT, stdio: "inherit", env: regressionEnv });
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
runRegression("verify-portal-4c-4b-3-marketplace-review-read-api.js");
runRegression("verify-portal-4c-4b-4-portal-marketplace-review-read.js");
step("E_regressions_local", "4A→4C-4B-4 PASS");

evidence.browser = {
    note: "Browser matrix (failure state, mobile, live UI) recorded in portal-4c-4b-4-production-browser-evidence.json when supplement script runs.",
    mandatoryManualOrSupplement: [
        "pack-funeral-ai detail reviews visible",
        "pack-security-ai No reviews yet on card",
        "blocked reviews GET shows error not empty",
        "no console module errors",
        "640px layout",
    ],
};

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-4b-4-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-4B-4 production acceptance (automated) completed");
console.log("EVIDENCE_FILE", outPath);
console.log("CREDENTIALS_FILE", credPath);
console.log("NEXT", "Run browser supplement + attach evidence to portal-4c-4b-4-production-browser-evidence.json");
