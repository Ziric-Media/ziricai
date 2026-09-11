#!/usr/bin/env node
/**
 * PORTAL-3A-B — Takeover / release / human-reply authorization verification.
 * Static + unit matrix (always). Optional live API matrix with --live (no WhatsApp messages).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
    assertAuthenticatedTenantMemberAccess,
    assertIntegrationReadAccess,
} from "../services/core/tenantContext.js";
import { conversationDocId } from "../services/storage/tenantStorage.js";
import { PRODUCTION_WEB_CONFIG } from "../js/firebase-config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const API_BASE = (process.env.PORTAL_3A_API_BASE || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const COMPANY_ID = "central-motors-rtb";
const CANONICAL_ID = conversationDocId("27849000523");
const credPath = join(ROOT, ".portal-rtb-smoke-credentials.json");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

function extractRouteBlock(source, method, path) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route: app.${method}("${path}")`);
    const end = source.indexOf("\n    });", match.index);
    return source.slice(match.index, end > match.index ? end + 8 : match.index + 400);
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

async function postTakeover(token, companyId, enabled) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const path = `/api/companies/${companyId}/conversations/${encodeURIComponent(CANONICAL_ID)}/takeover`;
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ enabled, humanAgent: enabled ? "Auth Test" : undefined }),
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

console.log("verify-portal-3a-takeover-auth");

/* ── Static route wiring ── */
const customerOps = read("services/api/customerOpsRoutes.js");
const tenantContext = read("services/core/tenantContext.js");

const takeoverBlock = extractRouteBlock(
    customerOps,
    "post",
    "/api/companies/:companyId/conversations/:conversationId/takeover"
);
const replyBlock = extractRouteBlock(
    customerOps,
    "post",
    "/api/companies/:companyId/conversations/:conversationId/reply"
);

assert.match(takeoverBlock, /requireAuthenticatedTenantMember\(\)/);
assert.match(takeoverBlock, /takeover["'],\s*requireAuthenticatedTenantMember\(\)/);
console.log("✓ takeover route uses requireAuthenticatedTenantMember()");

assert.match(replyBlock, /requireAuthenticatedTenantMember\(\)/);
assert.match(replyBlock, /reply["'],\s*requireAuthenticatedTenantMember\(\)/);
console.log("✓ reply route uses requireAuthenticatedTenantMember()");

assert.match(tenantContext, /export async function assertAuthenticatedTenantMemberAccess/);
assert.match(tenantContext, /export function requireAuthenticatedTenantMember/);
assert.match(tenantContext, /assertAuthenticatedTenantMemberAccess\(ctx/);
console.log("✓ tenantContext exports authenticated tenant-member access helpers");

const memberFn = tenantContext.slice(
    tenantContext.indexOf("export async function assertAuthenticatedTenantMemberAccess"),
    tenantContext.indexOf("export async function assertIntegrationReadAccess")
);
assert.doesNotMatch(memberFn, /ENFORCEMENT === "strict"/);
assert.match(memberFn, /if \(!ctx\.uid\)/);
console.log("✓ authenticated tenant-member access is independent of TENANT_SCOPE_ENFORCEMENT");

/* ── Unit authorization matrix (assertAuthenticatedTenantMemberAccess) ── */
const membership = async (uid, tenantId) =>
    uid === "rtb-owner" && tenantId === COMPANY_ID ? { uid, companyId: tenantId, role: "owner" } : null;

const allowOwner = await assertAuthenticatedTenantMemberAccess(
    { companyId: COMPANY_ID, uid: "rtb-owner", isSuperAdmin: false, profile: null },
    { getTenantMembership: membership }
);
assert.deepEqual(allowOwner, { via: "tenant" });
console.log("✓ Case 1: RTB owner + membership → ALLOW");

const allowRelease = await assertAuthenticatedTenantMemberAccess(
    {
        companyId: COMPANY_ID,
        uid: "rtb-owner",
        isSuperAdmin: false,
        profile: { companyId: COMPANY_ID, role: "owner" },
    },
    { getTenantMembership: membership }
);
assert.deepEqual(allowRelease, { via: "tenant" });
console.log("✓ Case 2: RTB owner release path (same auth) → ALLOW");

const unauthErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        { companyId: COMPANY_ID, uid: null, isSuperAdmin: false, profile: null },
        { getTenantMembership: membership }
    )
);
assert.equal(unauthErr.status, 401);
assert.equal(unauthErr.code, "UNAUTHORIZED");
console.log("✓ Case 3: unauthenticated → 401");

const wrongTenantErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        {
            companyId: COMPANY_ID,
            uid: "demo-user",
            isSuperAdmin: false,
            profile: { companyId: "demo-central-motors", role: "owner" },
        },
        { getTenantMembership: async () => null }
    )
);
assert.equal(wrongTenantErr.status, 403);
assert.equal(wrongTenantErr.code, "TENANT_FORBIDDEN");
console.log("✓ Case 4: demo/wrong tenant authenticated → 403");

const noMembershipErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        { companyId: COMPANY_ID, uid: "user-no-membership", isSuperAdmin: false, profile: null },
        { getTenantMembership: async () => null }
    )
);
assert.equal(noMembershipErr.status, 403);
assert.equal(noMembershipErr.code, "PROFILE_REQUIRED");
console.log("✓ Case 5: authenticated + no RTB membership → 403");

const urlOverrideErr = await expectAccess(() =>
    assertAuthenticatedTenantMemberAccess(
        {
            companyId: COMPANY_ID,
            uid: "other-tenant-user",
            isSuperAdmin: false,
            profile: { companyId: "other-tenant-abc", role: "owner" },
        },
        { getTenantMembership: async (uid, tenantId) => (tenantId === "other-tenant-abc" ? { uid, companyId: tenantId } : null) }
    )
);
assert.equal(urlOverrideErr.status, 403);
console.log("✓ Case 6: URL companyId cannot override authenticated tenant identity → 403");

/* Integration read auth still works (no regression from refactor) */
const integrationAllow = await assertIntegrationReadAccess(
    { companyId: COMPANY_ID, uid: "rtb-owner", isSuperAdmin: false, profile: null },
    { headers: {} },
    { getTenantMembership: membership }
);
assert.deepEqual(integrationAllow, { via: "tenant" });
console.log("✓ Integration read auth refactor regression: tenant member still ALLOW");

execSync("node scripts/verify-integration-auth-cases.js", { cwd: ROOT, stdio: "inherit" });
execSync("node scripts/verify-portal-3a-takeover.js", { cwd: ROOT, stdio: "inherit" });

if (LIVE) {
    console.log("\n--- Live API authorization matrix (no WhatsApp messages) ---");
    if (!fs.existsSync(credPath)) {
        throw new Error("Missing .portal-rtb-smoke-credentials.json for --live tests");
    }
    const creds = JSON.parse(fs.readFileSync(credPath, "utf8").replace(/^\uFEFF/, ""));
    const token = await firebaseToken(creds.email, creds.password);

    const noHeader = await postTakeover(undefined, COMPANY_ID, true);
    assert.equal(noHeader.status, 401, `expected 401 unauthenticated, got ${noHeader.status}`);
    console.log("✓ Live: no Authorization header → 401");

    const wrongTenant = await postTakeover(token, "wrong-tenant-xyz", true);
    assert.equal(wrongTenant.status, 403, `expected 403 wrong tenant, got ${wrongTenant.status}`);
    console.log("✓ Live: wrong-tenant authenticated → 403");

    const ownerTakeover = await postTakeover(token, COMPANY_ID, true);
    assert.equal(ownerTakeover.status, 200, `expected 200 takeover, got ${ownerTakeover.status}`);
    assert.equal(ownerTakeover.data?.humanTakeover, true);
    console.log("✓ Live: RTB owner takeover=true → 200");

    const ownerRelease = await postTakeover(token, COMPANY_ID, false);
    assert.equal(ownerRelease.status, 200, `expected 200 release, got ${ownerRelease.status}`);
    assert.equal(ownerRelease.data?.humanTakeover, false);
    console.log("✓ Live: RTB owner release=false → 200");
} else {
    console.log("\n(Skipping live API matrix — run with --live after deploy)");
}

console.log("\nAll PORTAL-3A-B authorization checks passed.");
