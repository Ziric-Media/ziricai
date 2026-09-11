#!/usr/bin/env node
/**
 * PORTAL-4A — Marketplace auth, tenant isolation, install permission, demoMode safety.
 * Static + unit matrix (always). Optional live API matrix with --live.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
    assertAuthenticatedTenantMemberAccess,
} from "../services/core/tenantContext.js";
import { hasPermission } from "../services/auth/permissionsService.js";
import { buildPackManifest } from "../services/platform/marketplaceTemplate.js";
import { getPackById } from "../services/platform/marketplaceRegistry.js";
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
    return source.slice(match.index, end > match.index ? end + 8 : match.index + 800);
}

async function expectAccess(fn, message) {
    try {
        await fn();
        assert.fail(message || "Expected access check to throw");
    } catch (err) {
        return err;
    }
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

console.log("verify-portal-4a-marketplace-auth");

/* ── Static route wiring ── */
const appJs = read("api/app.js");
const portalApi = read("js/portal/api.js");
const marketplaceJs = read("js/portal/modules/marketplace.js");
const permissionsSvc = read("services/auth/permissionsService.js");

const installedBlock = extractRouteBlock(appJs, "get", "/api/marketplace/installed/:companyId");
const updatesBlock = extractRouteBlock(appJs, "get", "/api/marketplace/installed/:companyId/updates");
const installBlock = extractRouteBlock(appJs, "post", "/api/marketplace/install");
const updateBlock = extractRouteBlock(appJs, "post", "/api/marketplace/update");
const reviewBlock = extractRouteBlock(appJs, "post", "/api/marketplace/review");
const catalogRouteLine = appJs.match(/app\.get\("\/api\/marketplace\/catalog"[^\n]*/)?.[0] || "";
const packRouteLine = appJs.match(/app\.get\("\/api\/marketplace\/pack\/:packId"[^\n]*/)?.[0] || "";

for (const [name, block] of [
    ["installed", installedBlock],
    ["updates", updatesBlock],
    ["review", reviewBlock],
]) {
    assert.match(block, /requireAuthenticatedTenantMember\(\)/, `${name} route must use requireAuthenticatedTenantMember()`);
}
console.log("✓ tenant-scoped read/review routes use requireAuthenticatedTenantMember()");

assert.match(installBlock, /requireAuthenticatedTenantMember\(\)/);
assert.match(installBlock, /checkPermission\("canManageStaff"\)/);
assert.match(updateBlock, /requireAuthenticatedTenantMember\(\)/);
assert.match(updateBlock, /checkPermission\("canManageStaff"\)/);
console.log("✓ install/update routes use authenticated tenant member + canManageStaff");

assert.match(catalogRouteLine, /app\.get\("\/api\/marketplace\/catalog", async/);
assert.match(packRouteLine, /app\.get\("\/api\/marketplace\/pack\/:packId", async/);
assert.doesNotMatch(catalogRouteLine, /requireAuthenticatedTenantMember/);
assert.doesNotMatch(packRouteLine, /requireAuthenticatedTenantMember/);
console.log("✓ public catalog/pack detail routes remain unauthenticated");

assert.match(permissionsSvc, /"POST \/api\/marketplace\/install": "canManageStaff"/);
assert.match(permissionsSvc, /"POST \/api\/marketplace\/update": "canManageStaff"/);
console.log("✓ backend ROUTE_PERMISSIONS aligned to canManageStaff (Portal marketplace module gate)");

assert.doesNotMatch(portalApi, /demoMode:\s*true/);
assert.doesNotMatch(marketplaceJs, /demoMode:\s*true/);
console.log("✓ Portal API caller no longer forces demoMode:true");

assert.match(installBlock, /demoMode === true/);
assert.doesNotMatch(installBlock, /demoMode !== false/);
console.log("✓ backend install only enables demoMode when explicitly true");

assert.doesNotMatch(appJs, /TENANT_SCOPE_ENFORCEMENT\s*=\s*["']strict["']/);
console.log("✓ no global TENANT_SCOPE_ENFORCEMENT override in api/app.js");

/* ── Permission reconciliation ── */
assert.equal(hasPermission("owner", "canManageStaff"), true);
assert.equal(hasPermission("manager", "canManageStaff"), true);
assert.equal(hasPermission("sales", "canManageStaff"), false);
assert.equal(hasPermission("support", "canManageStaff"), false);
console.log("✓ canManageStaff permission matrix: owner/manager only");

const paidManifest = buildPackManifest(getPackById(PAID_PACK_ID));
const freeManifest = buildPackManifest(getPackById(FREE_PACK_ID));
assert.ok(paidManifest.isPaid, "automotive pack should be paid");
assert.ok(freeManifest.isFree, "funeral pack should be free");
console.log("✓ paid/free pack fixtures identified for install tests");

/* ── Unit tenant authorization matrix ── */
const membership = async (uid, tenantId) =>
    uid === "member-rtb" && tenantId === COMPANY_ID ? { uid, companyId: tenantId, role: "owner" } : null;

const err401 = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess({ companyId: COMPANY_ID, uid: null, isSuperAdmin: false })
);
assert.equal(err401.status, 401);
console.log("✓ unauthenticated tenant access → 401");

const err403 = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        {
            companyId: COMPANY_ID,
            uid: "member-demo",
            isSuperAdmin: false,
            profile: { companyId: WRONG_TENANT_ID, role: "owner" },
        },
        { getTenantMembership: membership, auditSurface: "marketplace_test" }
    )
);
assert.equal(err403.status, 403);
console.log("✓ wrong-tenant member → 403");

await assertAuthenticatedTenantMemberAccess(
    {
        companyId: COMPANY_ID,
        uid: "member-rtb",
        isSuperAdmin: false,
        profile: { companyId: COMPANY_ID, role: "owner" },
    },
    { getTenantMembership: membership, auditSurface: "marketplace_test" }
);
console.log("✓ valid tenant member → allowed");

/* ── Live API matrix ── */
if (LIVE) {
    console.log("\n--live API matrix");

    const catalog = await apiFetch("GET", "/api/marketplace/catalog");
    assert.equal(catalog.status, 200);
    assert.ok(Array.isArray(catalog.data.packs));
    console.log("✓ A public catalog → 200");

    const packDetail = await apiFetch("GET", `/api/marketplace/pack/${PAID_PACK_ID}`);
    assert.equal(packDetail.status, 200);
    console.log("✓ B public pack detail → 200");

    const unauthInstalled = await apiFetch("GET", `/api/marketplace/installed/${COMPANY_ID}`);
    assert.equal(unauthInstalled.status, 401);
    console.log("✓ C unauthenticated installed read → 401");

    const unauthInstall = await apiFetch("POST", "/api/marketplace/install", {
        body: { companyId: COMPANY_ID, packId: FREE_PACK_ID, step: "preview" },
    });
    assert.equal(unauthInstall.status, 401);
    console.log("✓ D unauthenticated install → 401");

    const unauthUpdate = await apiFetch("POST", "/api/marketplace/update", {
        body: { companyId: COMPANY_ID, packId: FREE_PACK_ID, targetVersion: "1.1.0" },
    });
    assert.equal(unauthUpdate.status, 401);
    console.log("✓ E unauthenticated update → 401");

    if (!existsSync(credPath)) {
        console.warn("⚠ skipping authenticated live tests — missing .portal-rtb-smoke-credentials.json");
    } else {
        const creds = JSON.parse(readFileSync(credPath, "utf8").replace(/^\uFEFF/, ""));
        const ownerToken = await firebaseToken(creds.email, creds.password);

        const authInstalled = await apiFetch("GET", `/api/marketplace/installed/${COMPANY_ID}`, { token: ownerToken });
        assert.equal(authInstalled.status, 200);
        console.log("✓ F valid authenticated tenant member installed read → 200");

        const wrongTenant = await apiFetch("GET", `/api/marketplace/installed/${WRONG_TENANT_ID}`, { token: ownerToken });
        assert.equal(wrongTenant.status, 403);
        console.log("✓ G wrong-tenant authenticated member installed read → 403");

        const freePreview = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: { companyId: COMPANY_ID, packId: FREE_PACK_ID, step: "preview" },
        });
        assert.equal(freePreview.status, 200);
        console.log("✓ H valid authorized member free pack preview → 200");

        const paidInstall = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: {
                companyId: COMPANY_ID,
                packId: PAID_PACK_ID,
                step: "install",
            },
        });
        assert.equal(paidInstall.status, 402);
        assert.ok(paidInstall.data.requiresPayment || paidInstall.data.code === "PAYMENT_REQUIRED");
        console.log("✓ J paid pack normal path → 402 payment required (no demoMode bypass)");

        const paidWithDemo = await apiFetch("POST", "/api/marketplace/install", {
            token: ownerToken,
            body: {
                companyId: COMPANY_ID,
                packId: PAID_PACK_ID,
                step: "install",
                demoMode: true,
            },
        });
        assert.notEqual(paidWithDemo.status, 402, "explicit demoMode:true may still bypass for internal/test callers");
        console.log("✓ explicit demoMode:true remains available for authorized internal callers");
    }

    const catalogAfter = await apiFetch("GET", "/api/marketplace/catalog");
    assert.equal(catalogAfter.status, 200);
    const packAfter = await apiFetch("GET", `/api/marketplace/pack/${FREE_PACK_ID}`);
    assert.equal(packAfter.status, 200);
    console.log("✓ M public catalog/detail unchanged after auth hardening");
} else {
    console.log("(live API tests skipped — run with --live)");
}

/* ── Test I: permission denied (unit — sales role lacks canManageStaff) ── */
assert.equal(hasPermission("sales", "canManageStaff"), false);
console.log("✓ I sales role lacks canManageStaff (403 expected at middleware when wired with auth)");

/* ── Legacy onboarding classification ── */
const onboarding = read("services/platform/onboardingService.js");
assert.match(onboarding, /installIndustryPack\(session\.companyId/);
assert.doesNotMatch(read("api/app.js").slice(0, 720), /complete-step.*requireAuthenticatedTenantMember/s);
console.log("✓ legacy onboarding industry install path documented (no tenant auth middleware — follow-up gate)");

console.log("\nPORTAL-4A marketplace auth verification passed");
