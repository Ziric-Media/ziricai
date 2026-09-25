#!/usr/bin/env node
/**
 * One-shot production smoke for CORPORATE-P0-2a (run after deploy).
 * Reads optional PLATFORM_API_KEY from env / .env via bootstrapEnv.
 * Does not print tokens or API keys.
 */
import assert from "node:assert/strict";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { PRODUCTION_WEB_CONFIG } from "../app/js/firebase-config.js";

bootstrapEnv();

const BASE = (process.env.CORPORATE_P0_2_BASE_URL || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const PLATFORM_KEY = process.env.PLATFORM_API_KEY || "";

const probeCompanyId = `corporate-p0-2-factory-probe-live-${Date.now().toString(36)}`;
const onboardingBody = {
    companyName: `P0-2 Probe ${probeCompanyId}`,
    ownerEmail: "p0-2-factory-probe@example.invalid",
    ownerName: "Factory Probe",
    uid: "must-not-create-without-auth",
};

async function jsonPost(path, body, bearer) {
    const headers = { "Content-Type": "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
    let data = {};
    try {
        data = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, code: data.code || null, data };
}

async function platformCompanyIds() {
    if (!PLATFORM_KEY) return null;
    const res = await fetch(`${BASE}/api/platform/companies`, {
        headers: { "X-Platform-Api-Key": PLATFORM_KEY },
    });
    if (!res.ok) throw new Error(`platform companies list failed: ${res.status}`);
    const data = await res.json();
    const items = data.items || data.companies || [];
    return items.map((c) => c.id || c.companyId).filter(Boolean);
}

async function firebaseIdToken() {
    const apiKey = PRODUCTION_WEB_CONFIG.apiKey;
    const email = `p0-2a-smoke-${Date.now()}@ziricai-p0-2a.invalid`;
    const password = `Sm0ke_${Date.now()}_x!`;
    const signUp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );
    const payload = await signUp.json();
    if (!signUp.ok || !payload.idToken) {
        throw new Error(`Firebase signUp failed: ${payload.error?.message || signUp.status}`);
    }
    return { idToken: payload.idToken, email, password };
}

console.log(`CORPORATE-P0-2a live smoke → ${BASE}\n`);

const idsBefore = await platformCompanyIds();
if (idsBefore) {
    console.log(`Platform tenant count (before): ${idsBefore.length}`);
    assert.ok(!idsBefore.includes(probeCompanyId), "probe companyId must not exist before factory probes");
}

console.log("=== Unauthenticated factory probes ===");

const factoryRoutes = [
    ["/api/companies", { companyId: probeCompanyId, name: "Probe", provision: true }],
    ["/api/onboarding/start", onboardingBody],
    ["/api/onboarding/complete", onboardingBody],
    ["/api/onboarding/provision", onboardingBody],
];

for (const [path, body] of factoryRoutes) {
    const { status, code } = await jsonPost(path, body);
    assert.ok([401, 403].includes(status), `POST ${path}: expected 401/403, got ${status}`);
    console.log(`✓ POST ${path} → ${status}${code ? ` ${code}` : ""}`);
}

const idsAfterReject = await platformCompanyIds();
if (idsBefore && idsAfterReject) {
    assert.equal(idsAfterReject.length, idsBefore.length, "tenant count changed after rejected factory POSTs");
    assert.ok(!idsAfterReject.includes(probeCompanyId), "probe company created despite 401/403");
    console.log(`✓ tenant count unchanged (${idsBefore.length}) after rejected requests`);
} else {
    console.log("(platform API key not set — skipped tenant-count / probe-id registry checks)");
}

console.log("\n=== Authenticated onboarding/start (marketing path) ===");

const auth = await firebaseIdToken();
const smokeCompany = `P0-2a Smoke ${Date.now().toString(36)}`;
const startRes = await jsonPost(
    "/api/onboarding/start",
    {
        companyName: smokeCompany,
        ownerEmail: auth.email,
        ownerName: "P0-2a Smoke",
        uid: "spoof-should-be-overwritten",
    },
    auth.idToken
);

assert.equal(startRes.status, 201, `onboarding/start expected 201, got ${startRes.status} ${startRes.data?.error || ""}`);
assert.ok(startRes.data?.companyId || startRes.data?.sessionId, "start response missing companyId/sessionId");
console.log(`✓ POST /api/onboarding/start (authenticated) → 201 companyId=${startRes.data.companyId || "(session)"}`);

const idsAfterStart = await platformCompanyIds();
if (idsAfterStart && startRes.data.companyId) {
    assert.ok(idsAfterStart.includes(startRes.data.companyId), "new smoke tenant visible in platform registry");
    console.log(`✓ smoke tenant registered (${startRes.data.companyId})`);
}

console.log("\nAll CORPORATE-P0-2a live smoke checks passed.");
