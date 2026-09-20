#!/usr/bin/env node
/**
 * CORPORATE-P0-1 — tenant isolation hardening contract verifier.
 *
 * Local/unit mode (default): deterministic, no production credentials.
 * Live mode (opt-in):
 *   CORPORATE_P0_1_BASE_URL=https://...
 *   CORPORATE_P0_1_TOKEN=<Firebase ID token>
 *   CORPORATE_P0_1_OWN_COMPANY_ID=...
 *   CORPORATE_P0_1_OTHER_COMPANY_ID=...
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    validateProductionTenantScopeEnforcement,
    getEffectiveTenantScopeEnforcement,
    evaluatePlatformStorageHealth,
} from "../services/env/productionSecurityInvariants.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function runTenantContextProbe(enforcement, body) {
    const tenantContextUrl = pathToFileURL(join(ROOT, "services/core/tenantContext.js")).href;
    const script = `
process.env.TENANT_SCOPE_ENFORCEMENT = ${JSON.stringify(enforcement)};
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
const { assertTenantAccess } = await import(${JSON.stringify(tenantContextUrl)});
${body}
`;
    return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: ROOT,
        env: { ...process.env, NODE_ENV: "test" },
        encoding: "utf8",
    });
}

function expectProbeStatus(result, expectedStatus, label) {
    if (result.status !== 0) {
        throw new Error(`${label}: probe exited ${result.status}\n${result.stderr || result.stdout}`);
    }
    const line = (result.stdout || "").trim().split("\n").pop();
    const parsed = JSON.parse(line);
    assert.equal(parsed.status, expectedStatus, `${label}: expected HTTP ${expectedStatus}, got ${parsed.status} (${parsed.code || ""})`);
    if (parsed.code) {
        console.log(`✓ ${label} → ${expectedStatus} ${parsed.code}`);
    } else {
        console.log(`✓ ${label} → ${expectedStatus}`);
    }
}

console.log("verify-corporate-p0-1\n=== Boot guard ===");

assert.deepEqual(validateProductionTenantScopeEnforcement({ NODE_ENV: "production", TENANT_SCOPE_ENFORCEMENT: "strict" }), {
    ok: true,
    mode: "strict",
});
console.log("✓ production + strict → allowed");

assert.deepEqual(validateProductionTenantScopeEnforcement({ NODE_ENV: "production", TENANT_SCOPE_ENFORCEMENT: "STRICT" }), {
    ok: true,
    mode: "strict",
});
console.log("✓ production + STRICT → allowed (normalized)");

assert.throws(
    () => validateProductionTenantScopeEnforcement({ NODE_ENV: "production", TENANT_SCOPE_ENFORCEMENT: "lax" }),
    /Production requires TENANT_SCOPE_ENFORCEMENT=strict/
);
console.log("✓ production + lax → rejected");

assert.throws(
    () => validateProductionTenantScopeEnforcement({ NODE_ENV: "production" }),
    /Production requires TENANT_SCOPE_ENFORCEMENT=strict/
);
console.log("✓ production + missing enforcement → rejected");

assert.equal(getEffectiveTenantScopeEnforcement({ NODE_ENV: "development" }), "lax");
validateProductionTenantScopeEnforcement({ NODE_ENV: "development", TENANT_SCOPE_ENFORCEMENT: "lax" });
console.log("✓ development + lax → preserved");

console.log("\n=== Storage health contract ===");

const healthy = evaluatePlatformStorageHealth({
    nodeEnv: "production",
    adapterName: "firestore",
    storageConfigured: "firestore",
    storageFallback: null,
    firestoreAdmin: true,
});
assert.equal(healthy.storageHealth, "healthy");
assert.equal(healthy.platformStatus, "ok");
console.log("✓ production Firestore + no fallback → healthy");

const degraded = evaluatePlatformStorageHealth({
    nodeEnv: "production",
    adapterName: "memory",
    storageConfigured: "firestore",
    storageFallback: "Firestore probe failed: timeout",
    firestoreAdmin: true,
});
assert.equal(degraded.storageHealth, "degraded");
assert.equal(degraded.platformStatus, "degraded");
assert.ok(degraded.storageDegradedReasons.length >= 2);
console.log("✓ production memory/fallback → degraded");

const devMemory = evaluatePlatformStorageHealth({
    nodeEnv: "development",
    adapterName: "memory",
    storageConfigured: "memory",
    storageFallback: "STORAGE_BACKEND=memory",
    firestoreAdmin: false,
});
assert.equal(devMemory.storageHealth, "healthy");
console.log("✓ non-production memory → not flagged degraded");

console.log("\n=== TENANT_SCOPE_ENFORCEMENT (isolated module load) ===");

expectProbeStatus(
    runTenantContextProbe("strict", `
try {
  await assertTenantAccess({ companyId: "tenant-a", uid: null, isSuperAdmin: false });
  console.log(JSON.stringify({ status: "allow" }));
} catch (e) {
  console.log(JSON.stringify({ status: e.status, code: e.code }));
}
`),
    401,
    "strict + unauthenticated"
);

expectProbeStatus(
    runTenantContextProbe("strict", `
try {
  await assertTenantAccess({
    companyId: "tenant-a",
    uid: "user-1",
    isSuperAdmin: false,
    profile: { companyId: "tenant-b", role: "owner" },
  });
  console.log(JSON.stringify({ status: "allow" }));
} catch (e) {
  console.log(JSON.stringify({ status: e.status, code: e.code }));
}
`),
    403,
    "strict + wrong tenant profile"
);

expectProbeStatus(
    runTenantContextProbe("strict", `
try {
  await assertTenantAccess({
    companyId: "tenant-a",
    uid: "user-1",
    isSuperAdmin: false,
    profile: { companyId: "tenant-a", role: "owner" },
  });
  console.log(JSON.stringify({ status: "allow" }));
} catch (e) {
  console.log(JSON.stringify({ status: e.status, code: e.code }));
}
`),
    403,
    "strict + missing membership"
);

{
    const laxProbe = runTenantContextProbe("lax", `
try {
  await assertTenantAccess({ companyId: "tenant-a", uid: null, isSuperAdmin: false });
  console.log(JSON.stringify({ outcome: "allow" }));
} catch (e) {
  console.log(JSON.stringify({ outcome: "deny", status: e.status, code: e.code }));
}
`);
    if (laxProbe.status !== 0) {
        throw new Error(`lax probe failed: ${laxProbe.stderr || laxProbe.stdout}`);
    }
    const laxParsed = JSON.parse((laxProbe.stdout || "").trim().split("\n").pop());
    assert.equal(laxParsed.outcome, "allow", "lax + unauthenticated must allow companyId-only access");
    console.log("✓ lax + unauthenticated companyId-only (legacy dangerous contract) → allowed");
}

console.log("\n=== Platform auth contract ===");

const platformAuthSrc = read("services/auth/platformAuth.js");
assert.match(platformAuthSrc, /PLATFORM_FORBIDDEN/);
assert.match(platformAuthSrc, /UNAUTHORIZED/);
assert.match(platformAuthSrc, /isSuperAdmin/);

const appJs = read("api/app.js");
assert.match(appJs, /app\.get\("\/api\/operations\/platform-dashboard", requirePlatformAccess\(\)/);
assert.match(appJs, /app\.get\("\/api\/platform\/health", requirePlatformAccess\(\)/);
assert.match(appJs, /evaluatePlatformStorageHealth/);
assert.match(appJs, /storageHealth/);
console.log("✓ platform routes gated; health uses storage degradation helper");

console.log("\n=== Related verifiers (subprocess) ===");

for (const script of ["verify-integration-auth-cases.js", "verify-portal-3a-takeover-auth.js"]) {
    const rel = join("scripts", script);
    const r = spawnSync(process.execPath, [join(ROOT, rel)], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) {
        console.error(r.stderr || r.stdout);
        throw new Error(`${script} failed`);
    }
    console.log(`✓ ${script} passed`);
}

async function runLiveMode() {
    const base = (process.env.CORPORATE_P0_1_BASE_URL || "").replace(/\/$/, "");
    const token = process.env.CORPORATE_P0_1_TOKEN || "";
    const own = process.env.CORPORATE_P0_1_OWN_COMPANY_ID || "";
    const other = process.env.CORPORATE_P0_1_OTHER_COMPANY_ID || "";

    if (!base || !token || !own || !other) {
        console.log("\n(live mode skipped — set CORPORATE_P0_1_BASE_URL, TOKEN, OWN_COMPANY_ID, OTHER_COMPANY_ID)");
        return;
    }

    console.log("\n=== LIVE API mode (read-only GET) ===");

    async function get(path, bearer) {
        const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
        const r = await fetch(`${base}${path}`, { headers });
        let code = null;
        try {
            const j = await r.json();
            code = j.code || null;
        } catch {
            /* empty */
        }
        return { status: r.status, code };
    }

    const cases = [
        ["unauthenticated hub", `/api/portal/hub/${encodeURIComponent(own)}`, null, 401],
        ["correct tenant hub", `/api/portal/hub/${encodeURIComponent(own)}`, token, 200],
        ["wrong tenant hub", `/api/portal/hub/${encodeURIComponent(other)}`, token, 403],
        ["platform dashboard (tenant token)", "/api/operations/platform-dashboard", token, [401, 403]],
    ];

    for (const [label, path, bearer, expected] of cases) {
        const { status, code } = await get(path, bearer);
        const ok = Array.isArray(expected) ? expected.includes(status) : status === expected;
        assert.ok(ok, `${label}: expected ${JSON.stringify(expected)}, got ${status} ${code || ""}`);
        console.log(`✓ live ${label} → ${status}${code ? ` ${code}` : ""}`);
    }
}

await runLiveMode();

console.log("\nAll CORPORATE-P0-1 checks passed.");
