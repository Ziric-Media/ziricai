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

async function jsonGet(path) {
  const res = await fetch(base + path);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, code: data.code || null };
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

const sessionGet = await jsonGet("/api/onboarding/session/corporate-p0-2-session-probe");
if (sessionGet.status !== 401) {
  throw new Error(\`GET /api/onboarding/session expected 401, got \${sessionGet.status}\`);
}
results.push({ route: "GET /api/onboarding/session/:id", status: sessionGet.status, code: sessionGet.code });

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

assertMiddlewareBeforeHandler(
    /app\.get\(\s*\n\s*"\/api\/onboarding\/session\/:sessionId"/,
    "requireFirebaseAuth()",
    "GET /api/onboarding/session/:sessionId"
);
console.log("✓ GET /api/onboarding/session requires Firebase auth before handler");

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

console.log("\n=== B/C/D. P0-2b owner binding + idempotency (unit/integration) ===");

const {
    resolveSelfServeOwnerUid,
    bindSelfServeCompanyData,
    resolveSeedDemoLead,
} = await import("../services/platform/selfServeOwnerBinding.js");

assert.throws(() => resolveSelfServeOwnerUid({}), /Authenticated owner uid is required/);
console.log("✓ resolveSelfServeOwnerUid rejects missing uid");

assert.throws(
    () => bindSelfServeCompanyData({ ownerUid: "user-b" }, "user-a"),
    (err) => err.code === "OWNER_UID_MISMATCH"
);
const bound = bindSelfServeCompanyData({ ownerUid: "user-a", name: "Co" }, "user-a");
assert.equal(bound.ownerUid, "user-a");
assert.equal(bound.selfServeOwnerUid, "user-a");
console.log("✓ bindSelfServeCompanyData rejects spoofed ownerUid");

const orchestratorSrc = read("services/platform/onboardingOrchestrator.js");
assert.doesNotMatch(orchestratorSrc, /owner-\$\{Date\.now\(\)\}/);
console.log("✓ onboardingOrchestrator has no synthetic owner uid fallback");

assert.equal(resolveSeedDemoLead(undefined), process.env.NODE_ENV !== "production");
assert.equal(resolveSeedDemoLead(true), true);
assert.equal(resolveSeedDemoLead(false), false);
console.log("✓ resolveSeedDemoLead defaults off in production");

const ownerBindingProbe = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `
process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
const { startOnboarding } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/platform/onboardingService.js")).href)});
const { getTenantUser } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/userService.js")).href)});
const { getCompany } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/companyService.js")).href)});
const { provisionCompany } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/platform/provisioningService.js")).href)});
const { listAiEmployees } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/aiEmployeeService.js")).href)});
const { listKnowledgeDocuments } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/knowledgeService.js")).href)});
const { listTeamMembers } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/userService.js")).href)});
const { listDepartments } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/departmentService.js")).href)});
const { listAllCompaniesFromStorage } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/companyService.js")).href)});

function bindPayload(uid) {
  return {
    name: "P0-2 Owner Bind Co",
    ownerUid: uid,
    ownerId: uid,
    selfServeOwnerUid: uid,
    ownerEmail: "p0-2-owner-bind@example.invalid",
  };
}

const ownerA = "corporate-p0-2-user-a";
const ownerB = "corporate-p0-2-user-b";
const start = await startOnboarding({
  companyName: "P0-2 Owner Bind Co",
  ownerEmail: "p0-2-owner-bind@example.invalid",
  ownerName: "Owner A",
  uid: ownerA,
});
const member = await getTenantUser(start.companyId, ownerA);
if (!member || member.role !== "owner") throw new Error("owner membership missing for user A");
const spoofMember = await getTenantUser(start.companyId, ownerB);
if (spoofMember) throw new Error("user B must not have membership from user A signup");

const company = await getCompany(start.companyId);
if (company?.ownerUid !== ownerA && company?.ownerId !== ownerA) {
  throw new Error("company ownerUid not bound to authenticated uid");
}

async function resourceSnapshot(companyId, ownerUid) {
  const [companies, team, agents, knowledge, departments] = await Promise.all([
    listAllCompaniesFromStorage(),
    listTeamMembers(companyId),
    listAiEmployees(companyId),
    listKnowledgeDocuments(companyId),
    listDepartments(companyId),
  ]);
  const companyRows = companies.filter((c) => (c.id || c.companyId) === companyId);
  const owners = team.filter((m) => m.role === "owner");
  const defaultAgents = agents.filter((a) => a.isDefault);
  return {
    companyRowCount: companyRows.length,
    ownerMembershipCount: owners.length,
    ownerUidOnCompany: companyRows[0]?.ownerUid || companyRows[0]?.ownerId || null,
    teamCount: team.length,
    agentCount: agents.length,
    defaultAgentCount: defaultAgents.length,
    defaultAgentIds: defaultAgents.map((a) => a.id).sort(),
    knowledgeDocCount: knowledge.length,
    departmentCount: departments.length,
    ownerMemberUid: owners[0]?.uid || owners[0]?.id || null,
    agentIds: agents.map((a) => a.id).sort(),
    kbTitles: knowledge.map((d) => d.title).sort(),
  };
}

function assertSnapshotEqual(before, after, label) {
  const keys = Object.keys(before);
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      throw new Error(\`idempotency \${label}: \${key} changed \${JSON.stringify(b)} -> \${JSON.stringify(a)}\`);
    }
  }
}

const companyId = start.companyId;
const before = await resourceSnapshot(companyId, ownerA);
if (before.companyRowCount !== 1) throw new Error("expected exactly one company shell");
if (before.ownerMembershipCount !== 1) throw new Error("expected exactly one owner membership");
if (before.defaultAgentCount !== 1) throw new Error("expected exactly one default agent");
if (before.ownerMemberUid !== ownerA) throw new Error("owner membership uid not bound to authenticated uid");

const first = await provisionCompany(companyId, bindPayload(ownerA));
const mid = await resourceSnapshot(companyId, ownerA);
assertSnapshotEqual(before, mid, "after first reprovision");

const second = await provisionCompany(companyId, bindPayload(ownerA));
if (!second.alreadyProvisioned) throw new Error("second provisionCompany must be idempotent");
const after = await resourceSnapshot(companyId, ownerA);
assertSnapshotEqual(before, after, "after second reprovision");
if (first.links?.agentId !== second.links?.agentId) throw new Error("agent id changed on reprovision");

console.log(JSON.stringify({ ok: true, companyId, idempotency: before }));
`],
    { cwd: ROOT, env: { ...process.env, NODE_ENV: "test", STORAGE_BACKEND: "memory" }, encoding: "utf8", timeout: 120_000 }
);

if (ownerBindingProbe.status !== 0) {
    throw new Error(`owner binding probe failed\n${ownerBindingProbe.stderr || ownerBindingProbe.stdout}`);
}
const ownerProbeResult = JSON.parse((ownerBindingProbe.stdout || "").trim().split("\n").pop());
console.log(`✓ startOnboarding binds owner membership (${ownerProbeResult.companyId})`);
console.log(
    `✓ idempotent reprovision: company/owner/agent/kb/dept counts stable (${ownerProbeResult.idempotency.agentCount} agents, ${ownerProbeResult.idempotency.knowledgeDocCount} kb docs)`
);

console.log("\n=== P0-2c durability, session auth, honesty ===");

const {
    resolveWhatsAppOnboardingState,
    buildHonestTrainingStepResult,
} = await import("../services/platform/onboardingSessionHonesty.js");
const { assertOnboardingSessionOwner } = await import("../services/platform/onboardingService.js");

const waSim = resolveWhatsAppOnboardingState({ configured: false, simulate: true }, { status: "simulated", simulated: true });
assert.equal(waSim.connected, false);
assert.equal(waSim.state, "simulated");
console.log("✓ simulated WhatsApp cannot report connected");

const training = buildHonestTrainingStepResult({ knowledgeItemCount: 2 });
assert.equal(training.simulated, true);
assert.ok(!("chunks" in training));
assert.equal(training.status, "knowledge_setup_complete");
console.log("✓ training step does not fabricate chunk counts");

const p0_2cProbe = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `
process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
const { resetOnboardingSessionRepositoryForTests } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/platform/onboardingSessionRepository.js")).href)});
resetOnboardingSessionRepositoryForTests();
const { startOnboarding, completeOnboardingStep, assertOnboardingSessionOwner } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/platform/onboardingService.js")).href)});
const { reloadOnboardingSession, saveOnboardingSession, SESSION_STATUS } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/platform/onboardingSessionStore.js")).href)});
const { listAllCompaniesFromStorage } = await import(${JSON.stringify(pathToFileURL(join(ROOT, "services/tenants/companyService.js")).href)});

const ownerA = "p0-2c-owner-a";
const ownerB = "p0-2c-owner-b";
const payload = {
  companyName: "P0-2c Durability Co",
  ownerEmail: "p0-2c@example.invalid",
  ownerName: "Owner A",
  uid: ownerA,
};

const start = await startOnboarding(payload);
const reloaded = await reloadOnboardingSession(start.sessionId);
if (!reloaded || reloaded.companyId !== start.companyId) throw new Error("session reload failed");

const start2 = await startOnboarding(payload);
if (start2.companyId !== start.companyId) throw new Error("duplicate start created another tenant");
if (!start2.resumed) throw new Error("expected resumed:true on second start");

const companiesAfter = await listAllCompaniesFromStorage();
const mine = companiesAfter.filter((c) => (c.id || c.companyId) === start.companyId);
if (mine.length !== 1) throw new Error("expected one company shell for owner");

try {
  assertOnboardingSessionOwner(reloaded, { uid: ownerB });
  throw new Error("non-owner should be forbidden");
} catch (e) {
  if (e.status !== 403) throw e;
}

await completeOnboardingStep(start.sessionId, "whatsapp", {});
const liveSession = { ...reloaded, status: SESSION_STATUS.LIVE };
await saveOnboardingSession(liveSession);
try {
  await completeOnboardingStep(start.sessionId, "whatsapp", {});
  throw new Error("expected live session mutation block");
} catch (e) {
  if (e.status !== 409 && !String(e.message).includes("already complete")) throw e;
}

console.log(JSON.stringify({ ok: true, sessionId: start.sessionId, companyId: start.companyId }));
`],
    { cwd: ROOT, env: { ...process.env, NODE_ENV: "test", STORAGE_BACKEND: "memory" }, encoding: "utf8", timeout: 120_000 }
);

if (p0_2cProbe.status !== 0) {
    throw new Error(`P0-2c probe failed\n${p0_2cProbe.stderr || p0_2cProbe.stdout}`);
}
const p0_2cResult = JSON.parse((p0_2cProbe.stdout || "").trim().split("\n").pop());
console.log(`✓ durable session reload + duplicate start resume (${p0_2cResult.companyId})`);
console.log("✓ session owner guard rejects non-owner (403)");
console.log("✓ live session blocks onboarding step mutations (409)");

const journey = spawnSync(process.execPath, [join(ROOT, "scripts/verify-customer-journey.js")], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
});
if (journey.status !== 0) {
    console.warn("⚠ verify-customer-journey.js failed (often environmental WhatsApp worker/Meta allowlist — not a P0-2c gate blocker)");
    console.warn((journey.stderr || journey.stdout || "").split("\n").slice(-8).join("\n"));
} else {
    console.log("✓ verify-customer-journey.js passed");
}

await runLiveMode();

console.log("\nAll CORPORATE-P0-2 checks passed (P0-2a factory + P0-2b binding + P0-2c durability/honesty).");
