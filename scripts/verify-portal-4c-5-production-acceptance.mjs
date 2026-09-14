#!/usr/bin/env node
/**
 * PORTAL-4C-5E — Production acceptance (pack update UX + authoritative refresh).
 *
 *   node scripts/verify-portal-4c-5-production-acceptance.mjs
 *
 * Uses disposable tenant only (never central-motors-rtb). Same-origin API via app.ziricai.com when PORTAL_4C5_APP_ORIGIN set.
 * Requires Firebase Admin for live provisioning (local .env or railway run).
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "pack-funeral-ai";
const RTB = "central-motors-rtb";
const API_BASE = (process.env.PORTAL_4C5_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const PORTAL_ORIGIN = (process.env.PORTAL_4C5_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");
const USE_PORTAL_PROXY = process.env.PORTAL_4C5_USE_PORTAL_PROXY !== "0";

const testCo = process.env.PORTAL_4C5_TEST_COMPANY || `portal-4c5-upd-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C5_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4B_TEST_COMPANY = testCo;
process.env.PORTAL_4B_SMOKE_PASSWORD = smokePassword;

const evidence = {
    gate: "PORTAL-4C-5E-production-acceptance",
    gitHeadAtRun: null,
    apiBase: API_BASE,
    portalOrigin: PORTAL_ORIGIN,
    sameOriginApi: USE_PORTAL_PROXY,
    testCompany: testCo,
    steps: {},
    http: {},
    portalStatic: {},
    firestore: {},
    limitations: [],
    credentialsFile: null,
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

async function api(method, path, { token, body, origin } = {}) {
    const base = origin ?? (USE_PORTAL_PROXY ? PORTAL_ORIGIN : API_BASE);
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 500) };
    }
    return { status: res.status, data, origin: base };
}

console.log("verify-portal-4c-5-production-acceptance");
console.log("testCompany", testCo);

try {
    const { execSync } = await import("node:child_process");
    evidence.gitHeadAtRun = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
    evidence.worktreeDirty = execSync("git status --porcelain js/portal css/admin-dashboard.css scripts/verify-portal-4c-5*", {
        cwd: ROOT,
        encoding: "utf8",
    }).trim();
} catch {
    evidence.limitations.push("git_state_unavailable");
}

const mp = read("js/portal/modules/marketplace.js");
assert.match(mp, /refreshMarketplaceAuthoritativeState/);
assert.match(mp, /wireInstalledPackUpdateForm/);
assert.match(mp, /applyPackUpdate/);
assert.match(mp, /could not refresh installed data/i);
assert.doesNotMatch(mp, /request\s*\(\s*['"]\/api\/marketplace\/update['"]/);
evidence.portalStatic.localSource = {
    hasRefreshHelper: true,
    hasApplyWire: true,
    noInlineUpdatePost: true,
};
step("local_portal_static_4c5", evidence.portalStatic.localSource);

try {
    const portalJsUrl = `${PORTAL_ORIGIN}/js/portal/modules/marketplace.js`;
    const deployed = await fetch(portalJsUrl, { headers: { "Cache-Control": "no-cache" } });
    const deployedText = await deployed.text();
    evidence.portalStatic.deployedMarketplaceJs = {
        status: deployed.status,
        bytes: deployedText.length,
        hasRefreshHelper: /refreshMarketplaceAuthoritativeState/.test(deployedText),
        hasApplyWire: /wireInstalledPackUpdateForm/.test(deployedText),
        hasReviewWire: /wireInstalledPackReviewForm/.test(deployedText),
    };
    assert.equal(deployed.status, 200);
    assert.ok(evidence.portalStatic.deployedMarketplaceJs.hasRefreshHelper, "deployed bundle must include 4C-5D refresh");
    assert.ok(evidence.portalStatic.deployedMarketplaceJs.hasApplyWire, "deployed bundle must include 4C-5C apply UX");
    assert.ok(evidence.portalStatic.deployedMarketplaceJs.hasReviewWire, "4C-4C-2 review wiring must remain");
    step("deployed_portal_bundle", evidence.portalStatic.deployedMarketplaceJs);
} catch (err) {
    evidence.limitations.push(`deployed_portal_probe_failed: ${err.message}`);
    throw err;
}

const { hasAdminCredentials, getAdminFirestore } = await import("../services/database/firestoreAdmin.js");
const { tenantMarketplaceInstallPath } = await import("../services/database/schema.js");
const { publishCuratedPackVersions } = await import("../services/platform/marketplacePackVersionRepository.js");

if (!hasAdminCredentials()) {
    evidence.limitations.push("NO_ADMIN_CREDENTIALS — skipped live disposable tenant sequence");
    console.log("⚠ Skipping live API sequence (no Admin credentials)");
} else {
    const db = getAdminFirestore();
    assert.notEqual(testCo, RTB);

    const actor = await provisionPortal4bDisposableActor({
        companyId: testCo,
        password: smokePassword,
        companyName: `Portal 4C5 Update ${testCo}`,
    });
    const { idToken: ownerToken, uid: ownerUid } = await firebaseToken(actor.email, smokePassword);
    step("disposable_owner_actor", { email: actor.email, companyId: testCo, uid: ownerUid });

    const credPath = join(ROOT, "test-results", `portal-4c5-disposable-credentials.json`);
    mkdirSync(join(ROOT, "test-results"), { recursive: true });
    writeFileSync(
        credPath,
        `${JSON.stringify(
            {
                companyId: testCo,
                ownerEmail: actor.email,
                ownerPassword: smokePassword,
                provisionedAt: new Date().toISOString(),
                gate: "PORTAL-4C-5E",
                note: "Disposable tenant — not Central Motors",
            },
            null,
            2
        )}\n`,
        "utf8"
    );
    evidence.credentialsFile = credPath;
    step("credentials_written", credPath);

    await publishCuratedPackVersions([PACK]);

    const install = await api("POST", "/api/marketplace/install", {
        token: ownerToken,
        body: { companyId: testCo, packId: PACK },
    });
    assert.equal(install.status, 201, JSON.stringify(install.data));
    const reg0 = (await db.doc(tenantMarketplaceInstallPath(testCo, PACK)).get()).data();
    assert.equal(reg0.version, "1.0.0");
    evidence.http.install = { status: install.status, version: reg0.version, via: install.origin };
    step("install_1_0_0", evidence.http.install);

    const updatesBefore = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}/updates`, {
        token: ownerToken,
    });
    assert.equal(updatesBefore.status, 200);
    const pending = (updatesBefore.data?.updates || []).find((u) => u.packId === PACK);
    assert.ok(pending, "update must be available for funeral pack");
    assert.equal(pending.currentVersion, "1.0.0");
    assert.ok(pending.latestVersion);
    assert.ok(Array.isArray(pending.changelog) && pending.changelog.length >= 1);
    evidence.http.updatesBefore = {
        latestVersion: pending.latestVersion,
        currentVersion: pending.currentVersion,
        changelogLines: pending.changelog.length,
        via: updatesBefore.origin,
    };
    step("updates_available_before_apply", evidence.http.updatesBefore);

    const lifecycleBefore = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(testCo)}`, {
        token: ownerToken,
    });
    assert.equal(lifecycleBefore.status, 200);
    const lcBefore = (lifecycleBefore.data?.items || []).find((i) => i.packId === PACK);
    assert.ok(lcBefore);
    assert.equal(lcBefore.version, "1.0.0");
    step("lifecycle_before_apply", { version: lcBefore.version });

    const apply = await api("POST", "/api/marketplace/update", {
        token: ownerToken,
        body: { companyId: testCo, packId: PACK, targetVersion: pending.latestVersion },
    });
    assert.equal(apply.status, 200, JSON.stringify(apply.data));
    assert.equal(apply.data?.success, true);
    assert.equal(apply.data?.newVersion, pending.latestVersion);
    assert.equal(apply.data?.previousVersion, "1.0.0");
    evidence.http.applySuccess = { status: apply.status, body: apply.data, via: apply.origin };
    step("apply_update_200", {
        newVersion: apply.data.newVersion,
        previousVersion: apply.data.previousVersion,
        via: apply.origin,
    });

    const lifecycleAfter = await api("GET", `/api/marketplace/lifecycle/${encodeURIComponent(testCo)}`, {
        token: ownerToken,
    });
    assert.equal(lifecycleAfter.status, 200);
    const lcAfter = (lifecycleAfter.data?.items || []).find((i) => i.packId === PACK);
    assert.ok(lcAfter);
    assert.equal(lcAfter.version, pending.latestVersion);
    evidence.http.lifecycleAfter = { version: lcAfter.version };
    step("lifecycle_authoritative_after_apply", evidence.http.lifecycleAfter);

    const updatesAfter = await api("GET", `/api/marketplace/installed/${encodeURIComponent(testCo)}/updates`, {
        token: ownerToken,
    });
    assert.equal(updatesAfter.status, 200);
    const stillPending = (updatesAfter.data?.updates || []).find(
        (u) => u.packId === PACK && u.latestVersion === pending.latestVersion
    );
    assert.ok(!stillPending, "update badge target must clear after successful apply");
    evidence.http.updatesAfter = { pendingForPack: stillPending ?? null, count: (updatesAfter.data?.updates || []).length };
    step("updates_cleared_after_apply", evidence.http.updatesAfter);

    const repeat = await api("POST", "/api/marketplace/update", {
        token: ownerToken,
        body: { companyId: testCo, packId: PACK, targetVersion: pending.latestVersion },
    });
    assert.ok(repeat.status === 400 || repeat.status === 409, `repeat apply HTTP ${repeat.status}`);
    evidence.http.repeatApply = { status: repeat.status, code: repeat.data?.code };
    step("repeat_apply_400_or_409", evidence.http.repeatApply);

    const badTarget = await api("POST", "/api/marketplace/update", {
        token: ownerToken,
        body: { companyId: testCo, packId: PACK, targetVersion: "9.9.9" },
    });
    assert.notEqual(badTarget.status, 200);
    assert.ok(badTarget.status === 400 || badTarget.status === 404);
    evidence.http.badTarget = { status: badTarget.status, code: badTarget.data?.code };
    step("bad_target_version_failure", evidence.http.badTarget);

    const unauth = await api("POST", "/api/marketplace/update", {
        body: { companyId: testCo, packId: PACK, targetVersion: pending.latestVersion },
    });
    assert.equal(unauth.status, 401);
    step("unauthenticated_401", unauth.status);

    const rtbCredPath = join(ROOT, ".portal-rtb-smoke-credentials.json");
    if (existsSync(rtbCredPath)) {
        const rtbCreds = JSON.parse(readFileSync(rtbCredPath, "utf8").replace(/^\uFEFF/, ""));
        const { idToken: rtbToken } = await firebaseToken(rtbCreds.email, rtbCreds.password);
        const wrongTenant = await api("POST", "/api/marketplace/update", {
            token: rtbToken,
            body: { companyId: testCo, packId: PACK, targetVersion: pending.latestVersion },
        });
        assert.equal(wrongTenant.status, 403);
        evidence.http.wrongTenant403 = true;
        step("wrong_tenant_403", true);
    } else {
        evidence.limitations.push("RTB creds file absent — skipped cross-tenant 403");
    }

    const viewerCo = testCo;
    const viewerEmail = `portal-4c5-viewer-${Date.now()}@ziricai.com`;
    const admin = (await import("firebase-admin")).default;
    const viewerUser = await admin.auth().createUser({
        email: viewerEmail,
        password: smokePassword,
        emailVerified: true,
    });
    await db
        .collection("companies")
        .doc(viewerCo)
        .collection("users")
        .doc(viewerUser.uid)
        .set({
            email: viewerEmail,
            role: "viewer",
            status: "active",
            companyId: viewerCo,
        });
    await db.collection("users").doc(viewerUser.uid).set({
        email: viewerEmail,
        role: "viewer",
        companyId: viewerCo,
        company: viewerCo,
        status: "active",
    });
    const { idToken: viewerToken } = await firebaseToken(viewerEmail, smokePassword);
    const viewerApply = await api("POST", "/api/marketplace/update", {
        token: viewerToken,
        body: { companyId: viewerCo, packId: PACK, targetVersion: pending.latestVersion },
    });
    assert.equal(viewerApply.status, 403);
    evidence.http.viewerApply403 = viewerApply.data?.code || viewerApply.status;
    step("viewer_role_403", evidence.http.viewerApply403);

    const reviews = await api("GET", `/api/marketplace/packs/${PACK}/reviews?limit=5`);
    assert.equal(reviews.status, 200);
    evidence.http.reviewsRegression = { status: reviews.status, count: (reviews.data?.reviews || []).length };
    step("reviews_get_regression", evidence.http.reviewsRegression);

    const rtbPath = tenantMarketplaceInstallPath(RTB, PACK);
    const rtbSnap = await db.doc(rtbPath).get();
    evidence.firestore.rtb = { path: rtbPath, exists: rtbSnap.exists, companyId: rtbSnap.exists ? rtbSnap.data()?.companyId : null };
    assert.notEqual(testCo, RTB);
    if (rtbSnap.exists) {
        assert.equal(rtbSnap.data()?.companyId, RTB);
    }
    step("central_motors_untouched", evidence.firestore.rtb);

    evidence.limitations.push(
        "UI click-through (Installed → Details → confirm apply) exercised separately in browser acceptance notes",
        "refresh_failure_after_success: not simulated against production API in this harness (5D static + UX copy only)",
        "409 registry commit failure: proven via 4C-1 harness + local verify-portal-4c-1; repeat apply 400/409 covered here"
    );
}

mkdirSync(join(ROOT, "test-results"), { recursive: true });
const outPath = join(ROOT, "test-results", "portal-4c-5-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`\nWrote ${outPath}`);
console.log("\nPORTAL-4C-5E production acceptance completed");
