#!/usr/bin/env node
/**
 * Phase 2B-1.2 — Mission Control authentication handoff verification.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function read(relPath) {
    return readFileSync(join(root, relPath), "utf8");
}

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
}

async function testFrontendAuthReadyWait() {
    const apiRequest = read("js/shared/apiRequest.js");
    const firebase = read("js/firebase.js");

    assert(firebase.includes("ensureAuthReadyForApi"), "firebase.js must export ensureAuthReadyForApi");
    assert(firebase.includes("auth.authStateReady()"), "ensureAuthReadyForApi must wait for auth state");
    assert(apiRequest.includes("ensureAuthReadyForApi"), "apiRequest must import ensureAuthReadyForApi");
    assert(
        /await\s+ensureAuthReadyForApi\(\)/.test(apiRequest),
        "apiRequest must await Firebase auth before attaching Bearer token"
    );
    assert(apiRequest.includes("Authorization = `Bearer ${token}`"), "apiRequest must attach Bearer token");

    console.log("✓ Frontend waits for Firebase auth before Mission Control API calls");
}

async function testOperationsServiceAuthStates() {
    const opsService = read("js/admin/services/operationsService.js");
    const dashboard = read("js/admin/modules/dashboard.js");

    assert(opsService.includes("authStatus"), "operationsService must expose authStatus");
    assert(opsService.includes("authForbidden"), "operationsService must distinguish 403 unauthorized");
    assert(opsService.includes("apiError"), "operationsService must distinguish API/server failures");
    assert(opsService.includes("crmEmpty"), "operationsService must distinguish empty CRM from auth failures");
    assert(opsService.includes("status === 401"), "401 must map to unauthenticated");
    assert(opsService.includes("status === 403"), "403 must map to unauthorized");
    assert(opsService.includes("central-motors-rtb"), "Production tenant must remain central-motors-rtb");
    assert(!opsService.includes("demo-central-motors"), "operationsService must not use demo-central-motors");

    assert(dashboard.includes("Sign in required for live CRM"), "Dashboard must show sign-in required state");
    assert(
        dashboard.includes("Super Admin authorization required"),
        "Dashboard must show authorization failure state"
    );
    assert(
        dashboard.includes("Live CRM temporarily unavailable"),
        "Dashboard must show API/server failure state"
    );
    assert(dashboard.includes("No CRM data yet"), "Dashboard must show empty CRM state");
    assert(!opsService.includes("DEMO_OPERATIONS"), "operationsService must not fall back to demo KPIs");

    console.log("✓ Frontend distinguishes authentication, authorization, API, and empty CRM states");
}

async function testBackendProfileFallback() {
    const authService = read("services/auth/authService.js");

    assert(authService.includes("getUserProfileViaIdToken"), "authService must load profile via ID token REST fallback");
    assert(authService.includes("verifyIdTokenViaAdmin"), "authService must support Admin SDK token verification");
    assert(authService.includes("isFirebaseTokenVerificationReady"), "authService must expose token verification readiness");
    assert(
        authService.includes("getUserProfileViaIdToken(verified.uid, token)"),
        "resolveAuthFromRequest must fall back to REST profile read"
    );

    const { resolveAuthFromRequest } = await import("../services/auth/authService.js");

    const bad = await resolveAuthFromRequest({ headers: { authorization: "Bearer invalid-token" } });
    assert(!bad.uid, "Invalid token must not resolve uid");
    assert(!bad.isSuperAdmin, "Invalid token must not grant superadmin");

    console.log("✓ Invalid Firebase token is rejected by resolveAuthFromRequest");
}

async function testPlatformAccessResponses() {
    const platformAuthSource = read("services/auth/platformAuth.js");
    assert(platformAuthSource.includes("auth.uid ? 403 : 401"), "Platform auth must return 403 when uid present but not superadmin");
    assert(platformAuthSource.includes("PLATFORM_FORBIDDEN"), "403 responses must use PLATFORM_FORBIDDEN code");

    process.env.PLATFORM_API_KEY = "verify-phase-2b12-platform-key";
    const { requirePlatformAccess } = await import("../services/auth/platformAuth.js");
    const middleware = requirePlatformAccess();

    const unauthReq = { headers: {}, path: "/api/operations/metrics", method: "GET" };
    const unauthRes = mockRes();
    let unauthNext = false;
    await middleware(unauthReq, unauthRes, () => {
        unauthNext = true;
    });
    assert(!unauthNext, "Missing auth must not pass platform middleware");
    assert(unauthRes.statusCode === 401, `Expected 401 without auth, got ${unauthRes.statusCode}`);
    assert(unauthRes.body?.code === "UNAUTHORIZED", "Missing auth must return UNAUTHORIZED");

    const keyReq = {
        headers: { "x-platform-api-key": process.env.PLATFORM_API_KEY },
        path: "/api/operations/metrics",
        method: "GET",
    };
    const keyRes = mockRes();
    let keyNext = false;
    await middleware(keyReq, keyRes, () => {
        keyNext = true;
    });
    assert(keyNext, "Valid platform API key must pass requirePlatformAccess");

    const { isSuperAdminRole } = await import("../services/auth/authService.js");
    assert(isSuperAdminRole("superadmin"), "superadmin role must be recognized");
    assert(!isSuperAdminRole("owner"), "owner role must not pass superadmin gate");

    console.log("✓ requirePlatformAccess returns 401 for missing auth and accepts platform API key");
}

async function main() {
    console.log("\nPhase 2B-1.2 Mission Control authentication handoff verification\n");

    await testFrontendAuthReadyWait();
    await testOperationsServiceAuthStates();
    await testBackendProfileFallback();
    await testPlatformAccessResponses();

    console.log("\nAll Phase 2B-1.2 authentication handoff checks passed.");
}

main().catch((err) => {
    console.error("✗", err.message);
    process.exit(1);
});
