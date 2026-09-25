#!/usr/bin/env node
/**
 * PORTAL-4C-4C-2 — Production-oriented write/read acceptance (API + Portal static).
 * Read-only gate evidence; disposable tenant. No deploy, no Railway restart.
 *
 *   node scripts/verify-portal-4c-4c-2-production-acceptance.mjs
 *
 * Requires Firebase Admin for live POST/GET (same as 4C-4B-2 acceptance).
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "pack-funeral-ai";
const API_BASE = (process.env.PORTAL_4C4C2_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const PORTAL_ORIGIN = (process.env.PORTAL_4C4C2_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");

const testCo = process.env.PORTAL_4C4C2_TEST_COMPANY || `portal-4c4c2-write-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C4C2_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);
const marker = `4C4C2-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4B_TEST_COMPANY = testCo;
process.env.PORTAL_4B_SMOKE_PASSWORD = smokePassword;

const resultsDir = join(ROOT, "test-results");
const evidence = {
    gate: "PORTAL-4C-4C-2-production-acceptance",
    apiBase: API_BASE,
    portalOrigin: PORTAL_ORIGIN,
    testCompany: testCo,
    marker,
    steps: {},
    http: {},
    portalStatic: {},
    limitations: [],
};

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function step(name, detail) {
    evidence.steps[name] = detail;
    console.log(`✓ ${name}`, typeof detail === "string" ? detail : JSON.stringify(detail));
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
    return { status: res.status, data };
}

console.log("verify-portal-4c-4c-2-production-acceptance");
console.log("testCompany", testCo);

const mp = read("js/portal/modules/marketplace.js");
const catalogStart = mp.indexOf("async function openDetailModal");
const wizardStart = mp.indexOf("function openWizardModal");
const catalogBody = mp.slice(catalogStart, wizardStart);
const installedStart = mp.indexOf("function openInstalledDetailModal");
const installedBody = mp.slice(installedStart, catalogStart);

assert.match(mp, /import[\s\S]*submitPackReview[\s\S]*from\s+['"]\.\.\/api\.js['"]/);
assert.doesNotMatch(mp, /\/api\/marketplace\/review/i);
assert.doesNotMatch(catalogBody, /mp-review-form/);
assert.doesNotMatch(catalogBody, /wireInstalledPackReviewForm/);
assert.match(installedBody, /wireInstalledPackReviewForm/);
assert.match(mp, /res\.data\?\.review/);
assert.match(mp, /openDetailModal\(container,\s*packId\)/);
evidence.portalStatic.catalogReadOnly = true;
evidence.portalStatic.installedWriteWired = true;
step("portal_static_write_surface", { catalogForm: false, installedForm: true });

const wireStart = mp.indexOf("function wireInstalledPackReviewForm");
const wireEnd = mp.indexOf("/** Catalog detail");
assert.doesNotMatch(mp.slice(wireStart, wireEnd), /\bauthor\b/i);
step("portal_no_client_author_in_submit", true);

const { hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
if (!hasAdminCredentials()) {
    evidence.limitations.push("NO_ADMIN_CREDENTIALS — skipped live POST/GET sequence; run with Railway Admin env");
    console.log("⚠ Skipping live API sequence (no Admin credentials in this environment)");
} else {
    const { provisionPortal4bDisposableActor } = await import("./provision-portal-4b-disposable-acceptance-actor.mjs");
    const { installIndustryPack } = await import("../services/platform/industryPackService.js");

    const actor = await provisionPortal4bDisposableActor({
        companyId: testCo,
        password: smokePassword,
        companyName: `Portal 4C4C2 Write ${testCo}`,
    });
    const { idToken: token } = await firebaseToken(actor.email, smokePassword);
    step("disposable_actor", { email: actor.email, companyId: testCo });

    await installIndustryPack(testCo, PACK, {}, { installedBy: actor.uid });

    const noInstallCo = `${testCo}-noinstall`;
    const noInstallActor = await provisionPortal4bDisposableActor({
        companyId: noInstallCo,
        password: smokePassword,
        companyName: `Portal 4C4C2 NoInstall ${noInstallCo}`,
    });
    const noInstallAuth = await firebaseToken(noInstallActor.email, smokePassword);

    const ineligible = await api("POST", "/api/marketplace/review", {
        token: noInstallAuth.idToken,
        body: {
            companyId: noInstallCo,
            packId: PACK,
            rating: 4,
            title: "ineligible",
            body: "should fail",
        },
    });
    assert.equal(ineligible.status, 403);
    assert.equal(ineligible.data?.code, "REVIEW_NOT_ELIGIBLE");
    evidence.http.ineligible403 = ineligible.status;
    step("eligibility_403_uninstalled", ineligible.data?.code);

    const fakeAuthor = await api("POST", "/api/marketplace/review", {
        token,
        body: {
            companyId: testCo,
            packId: PACK,
            rating: 5,
            title: "author probe",
            body: "x",
            author: "Fake Name",
        },
    });
    assert.equal(fakeAuthor.status, 400);
    assert.equal(fakeAuthor.data?.code, "CLIENT_AUTHOR_FORBIDDEN");
    evidence.http.fakeAuthor400 = fakeAuthor.data?.code;
    step("client_author_rejected_400", fakeAuthor.data?.code);

    const title = `Production 4C4C2 ${marker}`;
    const post = await api("POST", "/api/marketplace/review", {
        token,
        body: {
            companyId: testCo,
            packId: PACK,
            rating: 5,
            title,
            body: "Write/read acceptance marker review.",
        },
    });
    assert.equal(post.status, 201);
    assert.ok(post.data?.review?.id);
    assert.equal(post.data.review.title, title);
    assert.equal(post.data.review.companyId, undefined);
    assert.equal(post.data.review.authorUid, undefined);
    evidence.http.post201 = { reviewId: post.data.review.id, title: post.data.review.title };
    step("post_201_public_review", evidence.http.post201);

    const list = await api("GET", `/api/marketplace/packs/${PACK}/reviews?limit=50`);
    assert.equal(list.status, 200);
    const found = (list.data?.reviews || []).find((r) => r.title === title);
    assert.ok(found, "GET reviews must include newly published review");
    assert.equal(found.rating, 5);
    assert.equal(found.companyId, undefined);
    evidence.http.getReviewsAfterPost = { status: list.status, foundId: found.id, matchesPostId: found.id === post.data.review.id };
    step("catalog_get_reviews_sees_published", evidence.http.getReviewsAfterPost);

    const catalog = await api("GET", `/api/marketplace/pack/${PACK}`);
    assert.equal(catalog.status, 200);
    assert.ok(Number(catalog.data?.pack?.ratingCount) >= 1);
    evidence.http.packDetailAggregate = {
        ratingCount: catalog.data?.pack?.ratingCount,
        rating: catalog.data?.pack?.rating,
    };
    step("pack_detail_honest_aggregate", evidence.http.packDetailAggregate);

    const dup = await api("POST", "/api/marketplace/review", {
        token,
        body: { companyId: testCo, packId: PACK, rating: 4, title: "dup", body: "dup" },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data?.code, "DUPLICATE_REVIEW");
    evidence.http.duplicate409 = dup.data?.code;
    step("duplicate_409", dup.data?.code);
}

try {
    const portalJsUrl = `${PORTAL_ORIGIN}/js/portal/modules/marketplace.js`;
    const deployed = await fetch(portalJsUrl, { headers: { "Cache-Control": "no-cache" } });
    const deployedText = await deployed.text();
    evidence.portalStatic.deployedMarketplaceJs = {
        status: deployed.status,
        hasReviewForm: /mp-review-form/.test(deployedText),
        hasWireSubmit: /wireInstalledPackReviewForm/.test(deployedText),
    };
    if (deployed.status === 200 && !/mp-review-form/.test(deployedText)) {
        evidence.limitations.push(
            "app.ziricai.com marketplace.js does not yet include 4C-4C-2 form — UI acceptance requires Netlify deploy after commit"
        );
    }
    step("deployed_portal_bundle_probe", evidence.portalStatic.deployedMarketplaceJs);
} catch (err) {
    evidence.limitations.push(`deployed_portal_probe_failed: ${err.message}`);
}

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-4c-2-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`\nWrote ${outPath}`);
console.log("\nPORTAL-4C-4C-2 production acceptance completed");
