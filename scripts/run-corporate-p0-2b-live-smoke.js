#!/usr/bin/env node
/**
 * Post-deploy smoke for CORPORATE-P0-2b (production).
 */
import assert from "node:assert/strict";
import { bootstrapEnv } from "../services/env/startupEnv.js";
import { PRODUCTION_WEB_CONFIG } from "../app/js/firebase-config.js";

bootstrapEnv();

const BASE = (process.env.CORPORATE_P0_2_BASE_URL || "https://ziricai-production.up.railway.app").replace(/\/$/, "");
const PLATFORM_KEY = process.env.PLATFORM_API_KEY || "";
const SPOOF_UID = "corporate-p0-2-spoof-victim-uid";

async function jsonRequest(method, path, body, bearer, platformKey = false) {
    const headers = { "Content-Type": "application/json" };
    if (platformKey && PLATFORM_KEY) {
        headers["X-Platform-Api-Key"] = PLATFORM_KEY;
    } else if (bearer) {
        headers.Authorization = `Bearer ${bearer}`;
    }
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, data, code: data.code || null };
}

async function firebaseUser() {
    const apiKey = PRODUCTION_WEB_CONFIG.apiKey;
    const email = `p0-2b-smoke-${Date.now()}@ziricai-p0-2b.invalid`;
    const password = `Sm0ke_${Date.now()}_b!`;
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
    return { idToken: payload.idToken, localId: payload.localId, email, password };
}

async function profileForUid(uid, idToken) {
    const projectId = PRODUCTION_WEB_CONFIG.projectId;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const doc = await res.json();
    const fields = doc.fields || {};
    const read = (k) => fields[k]?.stringValue ?? null;
    return { companyId: read("companyId"), role: read("role"), email: read("email") };
}

console.log(`CORPORATE-P0-2b live smoke → ${BASE}\n`);

const user = await firebaseUser();
const companyName = `P0-2b Smoke ${Date.now().toString(36)}`;

console.log("=== Authenticated onboarding/start ===");
const start = await jsonRequest(
    "POST",
    "/api/onboarding/start",
    {
        companyName,
        ownerEmail: user.email,
        ownerName: "P0-2b Smoke Owner",
        uid: SPOOF_UID,
    },
    user.idToken
);
assert.equal(start.status, 201, `start failed: ${start.status} ${start.data?.error || ""}`);
const companyId = start.data.companyId;
assert.ok(companyId, "missing companyId");
console.log(`✓ onboarding/start → 201 (${companyId})`);

console.log("\n=== Spoof resistance (body uid ignored) ===");
assert.notEqual(user.localId, SPOOF_UID);
const teamRes = await jsonRequest("GET", `/api/companies/${encodeURIComponent(companyId)}/team`, undefined, user.idToken);
assert.equal(teamRes.status, 200, `team list failed: ${teamRes.status}`);
const owners = (teamRes.data.items || []).filter((m) => m.role === "owner");
assert.equal(owners.length, 1, "expected one owner membership");
assert.equal(owners[0].uid || owners[0].id, user.localId, "owner must be token uid not spoofed body uid");
assert.notEqual(owners[0].uid || owners[0].id, SPOOF_UID);
console.log("✓ owner membership bound to Firebase token uid");

const profile = await profileForUid(user.localId, user.idToken);
if (profile?.companyId) {
    assert.equal(profile.companyId, companyId, "global profile companyId must match tenant");
    console.log("✓ owner global profile companyId matches tenant");
} else {
    console.log("(owner profile doc not readable — membership binding still verified)");
}

console.log("\n=== Portal hub access (owner) ===");
const hub = await jsonRequest("GET", `/api/portal/hub/${encodeURIComponent(companyId)}`, undefined, user.idToken);
assert.equal(hub.status, 200, `hub expected 200, got ${hub.status} ${hub.code || ""}`);
console.log("✓ GET /api/portal/hub/{companyId} → 200");

console.log("\n=== Idempotent reprovision (platform) ===");
if (!PLATFORM_KEY) {
    console.log("(skipped — set PLATFORM_API_KEY for production reprovision idempotency probe)");
} else {
    const payload = {
        companyId,
        name: companyName,
        ownerUid: user.localId,
        ownerEmail: user.email,
        provision: true,
    };
    const beforeAgents = await jsonRequest(
        "GET",
        `/api/companies/${encodeURIComponent(companyId)}/ai-employees`,
        undefined,
        user.idToken
    );
    const beforeKb = await jsonRequest(
        "GET",
        `/api/companies/${encodeURIComponent(companyId)}/knowledge/documents`,
        undefined,
        user.idToken
    );
    const agentCountBefore = (beforeAgents.data.items || beforeAgents.data.agents || []).length;
    const kbCountBefore = (beforeKb.data.items || beforeKb.data.documents || []).length;

    const p1 = await jsonRequest("POST", "/api/platform/provision/company", payload, null, true);
    const p2 = await jsonRequest("POST", "/api/platform/provision/company", payload, null, true);
    assert.ok([200, 201].includes(p1.status), `provision 1 failed: ${p1.status}`);
    assert.ok([200, 201].includes(p2.status), `provision 2 failed: ${p2.status}`);
    assert.equal(p2.data.alreadyProvisioned, true, "second platform provision should be idempotent");

    const afterAgents = await jsonRequest(
        "GET",
        `/api/companies/${encodeURIComponent(companyId)}/ai-employees`,
        undefined,
        user.idToken
    );
    const afterKb = await jsonRequest(
        "GET",
        `/api/companies/${encodeURIComponent(companyId)}/knowledge/documents`,
        undefined,
        user.idToken
    );
    const agentCountAfter = (afterAgents.data.items || afterAgents.data.agents || []).length;
    const kbCountAfter = (afterKb.data.items || afterKb.data.documents || []).length;
    assert.equal(agentCountAfter, agentCountBefore, "agent count changed after reprovision");
    assert.equal(kbCountAfter, kbCountBefore, "knowledge doc count changed after reprovision");
    console.log(`✓ reprovision idempotent (${agentCountBefore} agents, ${kbCountBefore} kb docs unchanged)`);
}

console.log("\n=== Demo / Sample Lead contamination ===");
const kb = await jsonRequest(
    "GET",
    `/api/companies/${encodeURIComponent(companyId)}/knowledge/documents`,
    undefined,
    user.idToken
);
const titles = (kb.data.items || kb.data.documents || []).map((d) => String(d.title || "").toLowerCase());
const bad = titles.filter((t) => t.includes("sample lead") || t.includes("central motors") || t.includes("demo-central"));
assert.equal(bad.length, 0, `unexpected demo contamination: ${bad.join(", ")}`);
console.log("✓ no Sample Lead / Central Motors kb contamination in new tenant");

console.log("\nAll CORPORATE-P0-2b live smoke checks passed.");
