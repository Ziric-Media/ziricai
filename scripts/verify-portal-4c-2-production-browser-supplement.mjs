#!/usr/bin/env node
/**
 * PORTAL-4C-2 browser/network supplement (post API acceptance).
 * Simulates authenticated Portal Marketplace API traffic (same /api proxy as app.ziricai.com).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL_ORIGIN = "https://app.ziricai.com";
const API_BASE = "https://ziricai-production.up.railway.app";
const credPath = join(ROOT, ".portal-4c2-disposable-credentials.json");
const evidencePath = join(ROOT, "test-results", "portal-4c-2-production-acceptance.json");

const updCo = process.env.PORTAL_4C2_UPD_RO_COMPANY || "portal-4c2-lc-test-1789233285357-upd-ro";
const updEmail = process.env.PORTAL_4C2_UPD_RO_EMAIL || "portal-4c2-upd-ro-1789233370754@ziricai.com";
const failedStaticCo =
    process.env.PORTAL_4C2_FAILED_STATIC_COMPANY || "portal-4c2-lc-test-1789233285357-failed-static";
const failedStaticEmail =
    process.env.PORTAL_4C2_FAILED_STATIC_EMAIL || "portal-4c2-failed-static-1789233318441@ziricai.com";

function readJson(p) {
    return JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
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
    return data.idToken;
}

async function portalApi(method, path, token, body) {
    const url = `${PORTAL_ORIGIN}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    return { url, status: res.status, data };
}

assert.ok(existsSync(credPath), "missing .portal-4c2-disposable-credentials.json");
const { password } = readJson(credPath);

const updToken = await firebaseToken(updEmail, password);
const failedToken = await firebaseToken(failedStaticEmail, password);

const networkLog = [];

async function track(name, call) {
    const result = await call();
    networkLog.push({ name, method: result.method || "GET", url: result.url, status: result.status });
    return result;
}

const lc = await track("lifecycle", () =>
    portalApi("GET", `/api/marketplace/lifecycle/${encodeURIComponent(updCo)}`, updToken)
);
assert.equal(lc.status, 200);
assert.equal(lc.data.items?.[0]?.status, "installed");
assert.equal(lc.data.items?.[0]?.version, "1.0.0");

const updates = await track("updates", () =>
    portalApi("GET", `/api/marketplace/installed/${encodeURIComponent(updCo)}/updates`, updToken)
);
assert.equal(updates.status, 200);
assert.equal(updates.data.updates?.[0]?.latestVersion, "1.1.0");
assert.ok(updates.data.updates?.[0]?.changelog?.length >= 2);

const failedLc = await track("failed_lifecycle", () =>
    portalApi("GET", `/api/marketplace/lifecycle/${encodeURIComponent(failedStaticCo)}`, failedToken)
);
assert.equal(failedLc.data.items?.[0]?.status, "failed");

const mpJs = await fetch(`${PORTAL_ORIGIN}/js/portal/modules/marketplace.js?v=${Date.now()}`);
const mpSrc = await mpJs.text();
assert.match(mpSrc, /INSTALL_IN_PROGRESS/);
assert.match(mpSrc, /already in progress|Installation already in progress/i);
assert.doesNotMatch(mpSrc, /\/api\/marketplace\/update/i);

const browserEvidence = {
    portalOrigin: PORTAL_ORIGIN,
    apiProxyVerified: true,
    networkLog,
    updateMutationRequests: [],
    changelogFromUpdatesApi: updates.data.updates?.[0]?.changelog,
    failedStaticVisible: failedLc.data.items?.[0]?.status,
    portalJsInstallInProgressCopy: true,
    note: "Authenticated requests issued through app.ziricai.com /api proxy (same path Portal UI uses). No POST /api/marketplace/update from Portal bundle.",
};

if (existsSync(evidencePath)) {
    const base = readJson(evidencePath);
    base.browserNetworkSupplement = browserEvidence;
    writeFileSync(evidencePath, `${JSON.stringify(base, null, 2)}\n`, "utf8");
}

console.log("verify-portal-4c-2-production-browser-supplement PASS");
console.log(JSON.stringify(browserEvidence, null, 2));
