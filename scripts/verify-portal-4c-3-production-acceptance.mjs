#!/usr/bin/env node
/**
 * PORTAL-4C-3 — Production acceptance (paid-pack Contact Sales UX).
 *
 * Run:
 *   npx @railway/cli run node scripts/verify-portal-4c-3-production-acceptance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";
import {
    ZIRIC_SALES_EMAIL,
    buildIndustryPackAccessMailto,
} from "../js/shared/marketplaceSalesContact.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB = "central-motors-rtb";
const FREE_PACK = "pack-funeral-ai";
const PAID_PACK = "pack-automotive-ai";
const API_BASE = (
    process.env.PORTAL_4C3_API_BASE ||
    process.env.PORTAL_4C2_API_BASE ||
    "https://ziricai-production.up.railway.app"
).replace(/\/$/, "");
const PORTAL_ORIGIN = (process.env.PORTAL_4C3_APP_ORIGIN || "https://app.ziricai.com").replace(/\/$/, "");

const testCo = process.env.PORTAL_4C3_TEST_COMPANY || `portal-4c3-pay-test-${Date.now()}`;
const smokePassword =
    process.env.PORTAL_4C3_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4C3_TEST_COMPANY = testCo;
process.env.PORTAL_4C3_SMOKE_PASSWORD = smokePassword;

const rtbCredPath = join(ROOT, ".portal-rtb-smoke-credentials.json");
const credPath = join(ROOT, ".portal-4c3-disposable-credentials.json");
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

function stop(msg, detail) {
    console.error("STOP:", msg, detail ?? "");
    process.exit(1);
}

const evidence = {
    gate: "PORTAL-4C-3-production-acceptance",
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

console.log("verify-portal-4c-3-production-acceptance");
console.log("testCompany", testCo);

const { getAdminFirestore, hasAdminCredentials } = await import("../services/database/firestoreAdmin.js");
const { tenantMarketplaceInstallPath } = await import("../services/database/schema.js");

assert.ok(hasAdminCredentials(), "Firebase Admin required — run via railway run");
const db = getAdminFirestore();

// --- J. Deployment asset proof (live Portal) ---
const bust = Date.now();
const mpRes = await fetch(`${PORTAL_ORIGIN}/js/portal/modules/marketplace.js?v=${bust}`);
assert.equal(mpRes.status, 200, `marketplace.js not served from ${PORTAL_ORIGIN}`);
const mpSrc = await mpRes.text();
const salesRes = await fetch(`${PORTAL_ORIGIN}/js/shared/marketplaceSalesContact.js?v=${bust}`);
assert.equal(salesRes.status, 200, "marketplaceSalesContact.js must be deployed via prepare-sites shared copy");
const salesSrc = await salesRes.text();

const assetChecks = {
    mpContactSales: mpSrc.includes("Contact Sales / Request Access"),
    mpPaidNotice: mpSrc.includes("mp-paid-notice"),
    mpPaymentPanel: mpSrc.includes("mp-payment-required-panel"),
    mpPreviewBtn: mpSrc.includes("mp-preview-btn"),
    mpSalesImport: mpSrc.includes("marketplaceSalesContact"),
    salesEmailConstant: salesSrc.includes(`sales@ziricai.com`) && salesSrc.includes("ZIRIC_SALES_EMAIL"),
    buildMailto: salesSrc.includes("buildIndustryPackAccessMailto"),
    noCheckoutInPortal: !/stripe|payfast|paystack|flutterwave|checkout/i.test(mpSrc),
};
for (const [k, v] of Object.entries(assetChecks)) {
    assert.ok(v, `deployment asset check failed: ${k}`);
}
evidence.deploymentAssets = { marketplaceJs: mpRes.status, salesContactJs: salesRes.status, ...assetChecks };
step("J_deployment_assets", evidence.deploymentAssets);

// --- Disposable actor ---
const actor = await provisionPortal4bDisposableActor({
    companyId: testCo,
    password: smokePassword,
    companyName: `Portal 4C3 Payment UX ${testCo}`,
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
step("actor", { email: actor.email, uid, companyId: testCo });

// --- A. Backend payment boundary ---
const freePreview = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: FREE_PACK, step: "preview" },
});
assert.equal(freePreview.status, 200);
assert.equal(freePreview.data?.pack?.isFree, true);
evidence.http.freePreview = freePreview.status;

const freeInstall = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: FREE_PACK, step: "install" },
});
assert.ok(freeInstall.status === 201 || freeInstall.status === 200, `free install ${freeInstall.status}`);
evidence.http.freeInstall = freeInstall.status;

const paidPreview = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PAID_PACK, step: "preview" },
});
assert.equal(paidPreview.status, 200);
assert.equal(paidPreview.data?.pack?.isPaid, true);
evidence.http.paidPreview = paidPreview.status;

const paidInstall = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PAID_PACK, step: "install" },
});
assert.equal(paidInstall.status, 402);
assert.equal(paidInstall.data?.code, "PAYMENT_REQUIRED");
assert.equal(paidInstall.data?.requiresPayment, true);
assert.equal(paidInstall.data?.contactSales, true);
evidence.http.paidInstall = {
    status: paidInstall.status,
    code: paidInstall.data?.code,
    requiresPayment: paidInstall.data?.requiresPayment,
    contactSales: paidInstall.data?.contactSales,
};

const paidDemo = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PAID_PACK, step: "install", demoMode: true },
});
assert.equal(paidDemo.status, 402, "demoMode:true must not bypass for tenant member");

const paidSkip = await api("POST", "/api/marketplace/install", {
    token,
    body: { companyId: testCo, packId: PAID_PACK, step: "install", skipPayment: true },
});
assert.equal(paidSkip.status, 402, "skipPayment:true must not bypass for tenant member");
step("A_backend_payment_boundary", evidence.http);

// --- C. Contact Sales mailto (production shared module) ---
const mailto = buildIndustryPackAccessMailto({
    packId: PAID_PACK,
    packName: "Automotive AI",
    companyId: testCo,
});
assert.ok(mailto.startsWith(`mailto:${ZIRIC_SALES_EMAIL}`));
assert.match(decodeURIComponent(mailto), /Industry Pack access request/);
assert.match(decodeURIComponent(mailto), /pack-automotive-ai/);
assert.match(decodeURIComponent(mailto), /Automotive AI/);
assert.match(decodeURIComponent(mailto), new RegExp(testCo));
assert.ok(salesSrc.includes(ZIRIC_SALES_EMAIL));
step("C_mailto_helper", { salesEmail: ZIRIC_SALES_EMAIL, packIdInBody: true });

// --- B / D / E / F / G — Portal source parity (served assets = acceptance UI contract) ---
assert.match(mpSrc, /mp-price paid/);
assert.match(mpSrc, /pack\.isPaid/);
assert.doesNotMatch(mpSrc, /sales@ziricai\.com/, "sales email must not be scattered in marketplace.js");
assert.match(mpSrc, /mp-preview-btn/);
assert.match(mpSrc, /Preview pack/);
assert.match(mpSrc, /Continue preview/);
assert.match(mpSrc, /renderPaidPackNotice/);
assert.match(mpSrc, /renderPaymentRequiredPanel/);
assert.match(mpSrc, /mpPaymentClose/);
assert.match(mpSrc, /isPaymentRequiredResult/);
assert.match(mpSrc, /mp-install-btn/);
evidence.portalAssetUx = {
    catalogPaidCta: true,
    detailPreview: true,
    wizardPaidNotice: true,
    panel402: true,
    freeInstallButtonRetained: true,
};
step("B_D_E_F_G_portal_asset_ux", evidence.portalAssetUx);

// --- H. No payment rails ---
const apiApp = readFileSync(join(ROOT, "api/app.js"), "utf8");
assert.doesNotMatch(apiApp, /\/api\/marketplace\/checkout/);
assert.doesNotMatch(mpSrc, /\/api\/marketplace\/update/i);
const paidPath = tenantMarketplaceInstallPath(testCo, PAID_PACK);
assert.equal((await db.doc(paidPath).get()).exists, false, "paid install must not create registry doc");
step("H_no_payment_rails", { paidRegistryDoc: false, noCheckoutRoute: true });

// --- I. Regressions ---
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
try {
    execSync("node scripts/verify-portal-4a-marketplace-auth.js --live", { cwd: ROOT, stdio: "pipe" });
    execSync("node scripts/verify-portal-4a-r1-marketplace-security.js --live", { cwd: ROOT, stdio: "pipe" });
    evidence.regression4aLive = "PASS";
} catch (e) {
    stop("4A live regression failed", e.message);
}
step("I_regressions", { local: "4A,4A-R1,4B,4C-1,4C-2,4C-3 PASS", live4a: evidence.regression4aLive });

const rtbSnap = await db.doc(tenantMarketplaceInstallPath(RTB, PAID_PACK)).get();
evidence.rtb = { paidInstallDocExists: rtbSnap.exists, testTenant: testCo };
assert.notEqual(testCo, RTB);
step("I_rtb_untouched", evidence.rtb);

mkdirSync(resultsDir, { recursive: true });
const outPath = join(resultsDir, "portal-4c-3-production-acceptance.json");
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log("\nPORTAL-4C-3 production acceptance completed");
console.log("EVIDENCE_FILE", outPath);
console.log("CREDENTIALS_FILE", credPath);
console.log("ACCEPTANCE_EVIDENCE", JSON.stringify(evidence, null, 2));
