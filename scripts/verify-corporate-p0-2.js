#!/usr/bin/env node
/**
 * CORPORATE-P0-2 — tenant factory closure (P0-2a scope).
 *
 * Local/unit mode (default): static contracts + in-process HTTP probe (memory storage).
 * Live mode (opt-in):
 *   CORPORATE_P0_2_BASE_URL=https://...
 *   CORPORATE_P0_2_PROBE_COMPANY_ID=corporate-p0-2-factory-probe-live-...
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const appModuleUrl = pathToFileURL(join(ROOT, "api/app.js")).href;
const companyServiceUrl = pathToFileURL(join(ROOT, "services/tenants/companyService.js")).href;

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

function runFactoryHttpProbe() {
    const probeScript = `
process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = "strict";
process.env.PLATFORM_API_KEY = "";

const express = (await import("express")).default;
const { setupApp } = await import(${JSON.stringify(appModuleUrl)});
const { getCompany, listAllCompaniesFromStorage } = await import(${JSON.stringify(companyServiceUrl)});

const app = express();
await setupApp(app);

const listenServer = await new Promise((resolve, reject) => {
  const server = app.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(server)));
});
const { port } = listenServer.address();
const base = \`http://127.0.0.1:\${port}\`;

const probeCompanyId = "corporate-p0-2-factory-probe-" + Date.now().toString(36);

async function jsonPost(path, body) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, code: data.code || null, data };
}

async function assertNoTenant(companyId, label) {
  const company = await getCompany(companyId);
  if (company) {
    throw new Error(\`\${label}: company record created for \${companyId}\`);
  }
}

async function assertCompanyCountUnchanged(before, label) {
  const after = (await listAllCompaniesFromStorage()).length;
  if (after !== before) {
    throw new Error(\`\${label}: company count changed \${before} → \${after}\`);
  }
}

const results = [];

const companiesRes = await jsonPost("/api/companies", {
  companyId: probeCompanyId,
  name: "P0-2 Factory Probe",
  provision: true,
});
if (![401, 403].includes(companiesRes.status)) {
  throw new Error(\`POST /api/companies: expected 401/403, got \${companiesRes.status}\`);
}
await assertNoTenant(probeCompanyId, "POST /api/companies");
results.push({ route: "POST /api/companies", status: companiesRes.status, code: companiesRes.code });

const onboardingBody = {
  companyName: "P0-2 Probe Co " + probeCompanyId,
  ownerEmail: "p0-2-probe@example.invalid",
  ownerName: "Probe Owner",
  uid: "spoof-should-not-matter-without-token",
};

for (const route of [
  ["/api/onboarding/start", onboardingBody],
  ["/api/onboarding/complete", onboardingBody],
  ["/api/onboarding/provision", onboardingBody],
]) {
  const [path, body] = route;
  const countBefore = (await listAllCompaniesFromStorage()).length;
  const res = await jsonPost(path, body);
  if (res.status !== 401) {
    throw new Error(\`\${path}: expected 401, got \${res.status} (\${res.code || ""})\`);
  }
  await assertCompanyCountUnchanged(countBefore, path);
  results.push({ route: \`POST \${path}\`, status: res.status, code: res.code });
}

listenServer.close();
console.log(JSON.stringify({ ok: true, probeCompanyId, results }));
`;

    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probeScript], {
        cwd: ROOT,
        env: { ...process.env, NODE_ENV: "test", STORAGE_BACKEND: "memory" },
        encoding: "utf8",
        timeout: 180_000,
    });

    if (result.status !== 0) {
        throw new Error(`Factory HTTP probe failed (exit ${result.status})\n${result.stderr || result.stdout}`);
    }

    const line = (result.stdout || "").trim().split("\n").pop();
    return JSON.parse(line);
}

console.log("verify-corporate-p0-2\n=== P0-2a static contracts ===");

const requireFirebaseAuthSrc = read("services/auth/requireFirebaseAuth.js");
assert.match(requireFirebaseAuthSrc, /req\.body\.uid = auth\.uid/);
assert.match(requireFirebaseAuthSrc, /tokenVerified/);
assert.match(requireFirebaseAuthSrc, /UNAUTHORIZED/);
console.log("✓ requireFirebaseAuth overwrites body.uid from verified token");

const platformAuthSrc = read("services/auth/platformAuth.js");
assert.match(platformAuthSrc, /requirePlatformAccess/);
assert.match(platformAuthSrc, /PLATFORM_FORBIDDEN/);
console.log("✓ platform routes use requirePlatformAccess contract");

const appJs = read("api/app.js");

function assertMiddlewareBeforeHandler(routePattern, middlewareSnippet, label) {
    const idx = appJs.search(routePattern);
    assert.ok(idx >= 0, `${label}: route not found`);
    const slice = appJs.slice(idx, idx + 1200);
    const mw = slice.indexOf(middlewareSnippet);
    const handler = slice.search(/async \(req, res\)/);
    assert.ok(mw >= 0 && handler >= 0 && mw < handler, `${label}: ${middlewareSnippet} must precede handler`);
}

assert.match(appJs, /app\.post\(\s*\n\s*"\/api\/companies",\s*\n\s*requirePlatformAccess\(\)/);
console.log("✓ POST /api/companies gated with requirePlatformAccess()");

assertMiddlewareBeforeHandler(
    /app\.post\(\s*\n\s*"\/api\/onboarding\/start"/,
    "requireFirebaseAuth()",
    "POST /api/onboarding/start"
);
assertMiddlewareBeforeHandler(
    /app\.post\(\s*\n\s*"\/api\/onboarding\/complete"/,
    "requireFirebaseAuth()",
    "POST /api/onboarding/complete"
);
assertMiddlewareBeforeHandler(
    /app\.post\(\s*\n\s*"\/api\/onboarding\/provision"/,
    "requireFirebaseAuth()",
    "POST /api/onboarding/provision"
);
console.log("✓ onboarding tenant-creation routes require Firebase auth before handlers");

const onboardingApi = read("js/onboarding/api.js");
assert.match(onboardingApi, /withAuthHeaders/);
assert.match(onboardingApi, /\/api\/onboarding\/start/);
console.log("✓ marketing onboarding client sends auth headers on start");

console.log("\n=== A. Factory closure (unauthenticated HTTP + zero tenant) ===");

const probe = runFactoryHttpProbe();
for (const row of probe.results) {
    console.log(`✓ ${row.route} → ${row.status}${row.code ? ` ${row.code}` : ""} (no tenant created)`);
}
console.log(`✓ probe companyId ${probe.probeCompanyId} absent after rejected POST /api/companies`);

console.log("\n=== Related verifiers (subprocess) ===");

const p01 = spawnSync(process.execPath, [join(ROOT, "scripts/verify-corporate-p0-1.js")], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
});
if (p01.status !== 0) {
    console.error(p01.stderr || p01.stdout);
    throw new Error("verify-corporate-p0-1.js failed during P0-2 regression");
}
console.log("✓ verify-corporate-p0-1.js passed (regression)");

async function runLiveMode() {
    const base = (process.env.CORPORATE_P0_2_BASE_URL || "").replace(/\/$/, "");
    const probeId =
        process.env.CORPORATE_P0_2_PROBE_COMPANY_ID ||
        `corporate-p0-2-factory-probe-live-${Date.now().toString(36)}`;

    if (!base) {
        console.log("\n(live mode skipped — set CORPORATE_P0_2_BASE_URL for production factory checks)");
        return;
    }

    console.log("\n=== LIVE API mode (unauthenticated factory probes) ===");

    async function post(path, body) {
        const r = await fetch(`${base}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
        });
        let code = null;
        try {
            const j = await r.json();
            code = j.code || null;
        } catch {
            /* empty */
        }
        return { status: r.status, code };
    }

    const onboardingBody = {
        companyName: "Live P0-2 Probe",
        ownerEmail: "live-p0-2-probe@example.invalid",
        ownerName: "Live Probe",
    };

    const cases = [
        ["POST /api/companies", "/api/companies", { companyId: probeId, name: "Live Probe", provision: true }],
        ["POST /api/onboarding/start", "/api/onboarding/start", onboardingBody],
        ["POST /api/onboarding/complete", "/api/onboarding/complete", onboardingBody],
        ["POST /api/onboarding/provision", "/api/onboarding/provision", onboardingBody],
    ];

    for (const [label, path, body] of cases) {
        const { status, code } = await post(path, body);
        assert.ok([401, 403].includes(status), `${label}: expected 401/403, got ${status} ${code || ""}`);
        console.log(`✓ live ${label} → ${status}${code ? ` ${code}` : ""}`);
    }

    console.log("(live tenant absence: confirm probe companyId not created in platform directory manually or via MC)");
}

await runLiveMode();

console.log("\nAll CORPORATE-P0-2 (P0-2a) checks passed.");
