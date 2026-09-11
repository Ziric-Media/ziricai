#!/usr/bin/env node
/**
 * PORTAL-4A-R1 — demoMode payment bypass + onboarding install side-channel remediation.
 * Static + unit (always). Optional live API matrix with --live.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    resolveMarketplacePaymentBypass,
    allowMarketplacePaymentBypass,
} from "../services/platform/marketplaceAuth.js";
import { hasPermission } from "../services/auth/permissionsService.js";
import { PRODUCTION_WEB_CONFIG } from "../js/firebase-config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const API_BASE = (process.env.PORTAL_4A_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const COMPANY_ID = "central-motors-rtb";
const WRONG_TENANT_ID = "demo-central-motors";
const FREE_PACK_ID = "pack-funeral-ai";
const PAID_PACK_ID = "pack-automotive-ai";
const credPath = join(ROOT, ".portal-rtb-smoke-credentials.json");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

function extractRouteBlock(source, method, pathPattern) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${pathPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route: app.${method}("${pathPattern}")`);
    const end = source.indexOf("\n    });", match.index);
    return source.slice(match.index, end > match.index ? end + 8 : match.index + 900);
}

async function firebaseToken(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Firebase auth failed");
    return data.idToken;
}

async function apiFetch(method, path, { token, body } = {}) {
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

console.log("verify-portal-4a-r1-marketplace-security");

const appJs = read("api/app.js");
const onboardingSvc = read("services/platform/onboardingService.js");
const portalApi = read("js/portal/api.js");
const installBlock = extractRouteBlock(appJs, "post", "/api/marketplace/install");
const onboardingBlock = extractRouteBlock(appJs, "post", "/api/onboarding/complete-step");

assert.match(installBlock, /resolveMarketplacePaymentBypass/);
assert.doesNotMatch(installBlock, /demoMode === true(?!\s*&&)/);
console.log("✓ marketplace install uses resolveMarketplacePaymentBypass");

assert.match(onboardingBlock, /assertOnboardingSessionAccess/);
assert.match(onboardingSvc, /export async function assertOnboardingSessionAccess/);
assert.match(onboardingSvc, /runInstallWizard/);
assert.doesNotMatch(onboardingSvc, /installIndustryPack\(session\.companyId/);
console.log("✓ onboarding complete-step requires session auth; industry install routed through marketplace wizard");

assert.doesNotMatch(portalApi, /demoMode:\s*true/);
console.log("✓ O Portal does not send demoMode:true");

/* Unit: payment bypass not granted to tenant callers */
const tenantReq = { tenant: { isSuperAdmin: false, uid: "u1", role: "owner" }, headers: {} };
assert.equal(allowMarketplacePaymentBypass(tenantReq), false);
assert.deepEqual(resolveMarketplacePaymentBypass(tenantReq, { demoMode: true, skipPayment: true }), {
    demoMode: false,
    skipPayment: false,
});
console.log("✓ tenant request cannot enable demoMode/skipPayment via body");

const superReq = { tenant: { isSuperAdmin: true, uid: "admin" }, headers: {} };
assert.equal(allowMarketplacePaymentBypass(superReq), true);
assert.deepEqual(resolveMarketplacePaymentBypass(superReq, { demoMode: true }), {
    demoMode: true,
    skipPayment: false,
});
console.log("✓ superadmin retains trusted payment bypass");

assert.equal(hasPermission("sales", "canManageStaff"), false);
console.log("✓ G sales role lacks canManageStaff (403 at middleware)");

if (LIVE) {
    console.log("\n--live API matrix");

    const catalog = await apiFetch("GET", "/api/marketplace/catalog");
    assert.equal(catalog.status, 200);
    console.log("✓ H public catalog → 200");

    const packDetail = await apiFetch("GET", `/api/marketplace/pack/${PAID_PACK_ID}`);
    assert.equal(packDetail.status, 200);
    console.log("✓ I public pack detail → 200");

    const unauthInstall = await apiFetch("POST", "/api/marketplace/install", {
        body: { companyId: COMPANY_ID, packId: PAID_PACK_ID, step: "install" },
    });
    assert.equal(unauthInstall.status, 401);
    console.log("✓ E unauthenticated install → 401");

    const unauthOnboarding = await apiFetch("POST", "/api/onboarding/complete-step", {
        body: { sessionId: "fake-session", step: "industry", data: { industryId: "funeral" } },
    });
    assert.equal(unauthOnboarding.status, 401);
    console.log("✓ J unauthenticated onboarding industry step → 401");

    if (!existsSync(credPath)) {
        console.warn("⚠ skipping authenticated live tests — missing credentials file");
    } else {
        const creds = JSON.parse(readFileSync(credPath, "utf8").replace(/^\uFEFF/, ""));
        const ownerToken = await firebaseToken(creds.email, creds.password);

        const wrongTenant = await apiFetch("GET", `/api/marketplace/installed/${WRONG_TENANT_ID}`, { token: ownerToken });
        assert.equal(wrongTenant.status, 403);
        console.log("✓ F wrong-tenant installed read → 403");

        const paidNoDemo = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: { companyId: COMPANY_ID, packId: PAID_PACK_ID, step: "install" },
        });
        assert.equal(paidNoDemo.status, 402);
        console.log("✓ A paid pack + no demoMode → 402");

        const paidDemoFalse = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: { companyId: COMPANY_ID, packId: PAID_PACK_ID, step: "install", demoMode: false },
        });
        assert.equal(paidDemoFalse.status, 402);
        console.log("✓ B paid pack + demoMode:false → 402");

        const paidDemoTrue = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: { companyId: COMPANY_ID, packId: PAID_PACK_ID, step: "install", demoMode: true },
        });
        assert.equal(paidDemoTrue.status, 402, "tenant demoMode:true must NOT bypass payment");
        console.log("✓ C paid pack + demoMode:true from tenant → 402 (no bypass)");

        const freeInstall = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: { companyId: COMPANY_ID, packId: FREE_PACK_ID, step: "preview" },
        });
        assert.equal(freeInstall.status, 200);
        console.log("✓ D free pack preview for authorized owner → 200");
    }
} else {
    console.log("(live API tests skipped — run with --live)");
}

assert.doesNotMatch(appJs, /TENANT_SCOPE_ENFORCEMENT\s*=\s*["']strict["']/);
console.log("✓ N no global TENANT_SCOPE_ENFORCEMENT override");

console.log("\nPORTAL-4A-R1 marketplace security verification passed");
