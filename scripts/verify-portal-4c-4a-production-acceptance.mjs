#!/usr/bin/env node
/**
 * PORTAL-4C-4A — Production acceptance (Marketplace review honesty).
 *
 * Run:
 *   npx @railway/cli run node scripts/verify-portal-4c-4a-production-acceptance.mjs
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
const FREE_PACK = "pack-funeral-ai";
const API_BASE = (
    process.env.PORTAL_4C4A_API_BASE ||
    process.env.PORTAL_4C3_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");
const PORTAL_ORIGIN = (process.env.PORTAL_4C4A_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");

const testCo = process.env.PORTAL_4C4A_TEST_COMPANY || `portal-4c4a-rev-honesty-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C4A_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C4A_TEST_COMPANY = testCo;
process.env.PORTAL_4C4A_SMOKE_PASSWORD = smokePassword;

const credPath = join(ROOT, ".portal-4c4a-disposable-credentials.json");
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

function stop(msg, detail) {
    console.error("STOP:", msg, detail ?? "");
    process.exit(1);
}

const evidence = {
    gate: "PORTAL-4C-4A-production-acceptance",
    apiBase: API_BASE,
    portalOrigin: PORTAL_ORIGIN,
    primaryTenant: testCo,
    steps: {},
    http: {},
    deploymentAssets: {},
};

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

console.log("verify-portal-4c-4a-production-acceptance");
console.log("testCompany", testCo);

const { getAdminFirestore, hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
const { tenantMarketplaceInstallPath } = await import("../services/database/schema.js");

assert.ok(hasAdminCredentials(), "Firebase Admin required — run via railway run");
const db = getAdminFirestore();

// --- A. Live deployment asset proof (customer-facing Portal JS) ---
const bust = Date.now();
const mpUrl = `${PORTAL_ORIGIN}/js/portal/modules/marketplace.js?v=${bust}`;
const mpRes = await fetch(mpUrl);
assert.equal(mpRes.status, 200, `marketplace.js not served from ${PORTAL_ORIGIN}`);
const mpSrc = await mpRes.text();

const assetChecks = {
    emptyStateHelper: mpSrc.includes("renderCustomerReviewsEmptyState"),
    honestCopy: mpSrc.includes("No customer reviews yet"),
    customerReviewsHeading: /Customer reviews/i.test(mpSrc),
    noRenderStars: !mpSrc.includes("function renderStars"),
    noRatingCount: !mpSrc.includes("mp-rating-count"),
    noTopRatedSort: !mpSrc.includes("Top rated"),
    noDemoReviewLoop: !mpSrc.includes("d.reviews"),
    noSubmitPackReview: !mpSrc.includes("submitPackReview"),
    noReviewPost: !/\/api\/marketplace\/review/i.test(mpSrc),
    noWriteReviewUi: !/Write a Review/i.test(mpSrc),
    retains4c3ContactSales: mpSrc.includes("Contact Sales / Request Access"),
};
for (const [k, v] of Object.entries(assetChecks)) {
    assert.ok(v, `deployment asset check failed: ${k}`);
}
evidence.deploymentAssets = { url: mpUrl, status: mpRes.status, ...assetChecks };
step("A_deployment_assets", evidence.deploymentAssets);

// --- B. Source parity (authorized slice only touched Portal marketplace module) ---
const localMp = read("js/portal/modules/marketplace.js");
assert.match(localMp, /renderCustomerReviewsEmptyState/);
assert.doesNotMatch(localMp, /renderStars/);
const scopeFiles = {
    marketplaceInstaller: read("services/platform/marketplaceInstaller.js"),
    apiApp: read("api/app.js"),
    memoryAdapter: read("services/storage/memoryAdapter.js"),
};
assert.match(read("api/app.js"), /submitMarketplacePackReview/);
assert.doesNotMatch(scopeFiles.marketplaceInstaller, /saveMarketplaceReview/);
assert.match(scopeFiles.apiApp, /\/api\/marketplace\/review/);
assert.doesNotMatch(localMp, /submitPackReview/);
evidence.scopeProtection = {
    portalOnlyHonesty: true,
    reviewPostRouteStillBackendOnly: true,
    noPortalReviewSubmit: true,
};
step("B_scope_protection", evidence.scopeProtection);

// --- C. Disposable tenant + preview (API may still return demo fields; Portal must not render them) ---
const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 4C4A Review Honesty ${testCo}`,
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
step("C_actor", { email: actor.email, uid, companyId: testCo });

const preview = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: FREE_PACK, step: "preview" },
});
assert.equal(preview.status, 200);
assert.ok(Array.isArray(preview.data?.reviews) || preview.data?.reviews == null);
evidence.http.preview = {
    status: preview.status,
    apiMayIncludeDemoReviews: Array.isArray(preview.data?.reviews),
    apiRatingFieldPresent: preview.data?.pack?.rating != null,
};
step("D_api_preview_demo_fields_allowed", evidence.http.preview);

const catalog = await api("GET", `/api/marketplace/catalog?companyId=${encodeURIComponent(testCo)}`, { token });
assert.equal(catalog.status, 200);
assert.ok(Array.isArray(catalog.data?.packs));
evidence.http.catalog = { status: catalog.status, packCount: catalog.data.packs.length };
step("E_catalog", evidence.http.catalog);

// --- F. Regressions (local memory) ---
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
try {
    execSync("node scripts/verify-portal-4a-marketplace-auth.js --live", { cwd: ROOT, stdio: "pipe" });
    execSync("node scripts/verify-portal-4a-r1-marketplace-security.js --live", { cwd: ROOT, stdio: "pipe" });
    evidence.regression4aLive = "PASS";
} catch (e) {
    stop("4A live regression failed", e.message);
}
step("F_regressions", { local: "4A,4A-R1,4B,4C-1,4C-2,4C-3,4C-4A PASS", live4a: evidence.regression4aLive });

// --- G. RTB untouched (disposable tenant only) ---
assert.notEqual(testCo, RTB);
const rtbSnap = await db.doc(tenantMarketplaceInstallPath(RTB, FREE_PACK)).get();
evidence.rtb = { testTenant: testCo, rtbFuneralInstallDocExists: rtbSnap.exists };
step("G_rtb_untouched", evidence.rtb);

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-4a-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-4A production acceptance completed");
console.log("EVIDENCE_FILE", outPath);
console.log("CREDENTIALS_FILE", credPath);
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
