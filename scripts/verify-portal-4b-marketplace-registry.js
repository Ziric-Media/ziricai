#!/usr/bin/env node
/**
 * PORTAL-4B — Durable Marketplace install registry verification.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";
process.env.TENANT_SCOPE_ENFORCEMENT = process.env.TENANT_SCOPE_ENFORCEMENT || "strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RTB_ID = "central-motors-rtb";
const PACK_FREE = "pack-funeral-ai";

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-portal-4b-marketplace-registry");
console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}`);

const companyId = process.env.PORTAL_4B_TEST_COMPANY_ID || `portal-4b-registry-${Date.now()}`;

const {
    installIndustryPack,
    getInstalledPacks,
    isPackInstalled,
    convertPackWorkflowToAutomation,
} = await import("../services/platform/industryPackService.js");
const {
    claimInstall,
    getInstall,
    failInstall,
    isInstalled,
    assertInstallClaimResult,
} = await import("../services/platform/marketplaceInstallService.js");
const { MarketplaceInstallError, INSTALL_IN_PROGRESS } = await import(
    "../services/platform/marketplaceInstallErrors.js"
);
const { listAiEmployees } = await import("../services/tenants/aiEmployeeService.js");
const { listKnowledgeDocuments } = await import("../services/tenants/knowledgeService.js");
const { listWorkflows } = await import("../services/automation/workflowRegistry.js");
const { getMarketplaceInstallRepository } = await import(
    "../services/platform/marketplaceInstallRepository.js"
);

assert.doesNotMatch(read("services/platform/industryPackService.js"), /if \(store\.saveInstalledPack\)/);
console.log("✓ install path does not use optional saveInstalledPack");

assert.match(read("services/database/schema.js"), /MARKETPLACE_INSTALLS.*marketplaceInstalls/);
assert.match(read("firestore.rules"), /marketplaceInstalls\/\{packId\}/);
console.log("✓ schema and rules reference marketplaceInstalls");

function assertNoUndefinedDeep(value, label = "value") {
    if (value === undefined) {
        assert.fail(`${label} must not be undefined`);
    }
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoUndefinedDeep(item, `${label}[${i}]`));
        return;
    }
    for (const [key, v] of Object.entries(value)) {
        assertNoUndefinedDeep(v, `${label}.${key}`);
    }
}

const stageOnlyCrm = convertPackWorkflowToAutomation({
    name: "Viewing Appointment Booking",
    nodes: [
        {
            type: "action",
            stepType: "update_crm",
            config: { stage: "viewing_scheduled" },
        },
    ],
}).actions.find((a) => a.type === "update_crm");
assert.ok(stageOnlyCrm);
assert.equal(stageOnlyCrm.config.status, "viewing_scheduled");
assert.ok(!Object.prototype.hasOwnProperty.call(stageOnlyCrm.config, "tags"));
assertNoUndefinedDeep(stageOnlyCrm, "stageOnlyCrm");

const taggedCrm = convertPackWorkflowToAutomation({
    nodes: [
        {
            type: "action",
            stepType: "update_crm",
            config: { stage: "viewing_scheduled", tags: ["example"] },
        },
    ],
}).actions.find((a) => a.type === "update_crm");
assert.deepEqual(taggedCrm.config.tags, ["example"]);
assert.equal(taggedCrm.config.status, "viewing_scheduled");
assertNoUndefinedDeep(taggedCrm, "taggedCrm");

const emptyCrm = convertPackWorkflowToAutomation({
    nodes: [{ type: "action", stepType: "update_crm", config: {} }],
}).actions.find((a) => a.type === "update_crm");
assert.ok(!Object.prototype.hasOwnProperty.call(emptyCrm.config, "status"));
assert.ok(!Object.prototype.hasOwnProperty.call(emptyCrm.config, "tags"));
console.log("✓ workflow update_crm mapper omits undefined optional fields");

// --- memory install → installed ---
const first = await installIndustryPack(companyId, PACK_FREE, {}, { installedBy: "verify-4b" });
assert.equal(first.alreadyInstalled, undefined);
assert.ok(first.validation?.valid, "expected valid install");

const { items } = await getInstalledPacks(companyId);
assert.equal(items.length, 1);
assert.equal(items[0].status, "installed");
assert.equal(items[0].packId, PACK_FREE);
console.log("✓ memory install → installed list");

// --- duplicate install ---
const dup = await installIndustryPack(companyId, PACK_FREE, {}, { installedBy: "verify-4b" });
assert.equal(dup.alreadyInstalled, true);
const agentsAfterDup = await listAiEmployees(companyId);
const agentCountAfterDup = agentsAfterDup.length;
console.log("✓ duplicate install → alreadyInstalled");

// --- registry / resource separation ---
const reg = await getInstall(companyId, PACK_FREE);
assert.ok(Array.isArray(reg.agentIds));
for (const id of reg.agentIds) {
    assert.match(id, /^agent-/, "agentIds should be ids only");
    const agent = agentsAfterDup.find((a) => a.id === id);
    assert.ok(agent, `agent ${id} retrievable from AI Employee service`);
    assert.ok(agent.systemPrompt, "agent body lives in AI Employee service");
}
for (const id of reg.knowledgeDocIds || []) {
    const docs = await listKnowledgeDocuments(companyId);
    assert.ok(docs.some((d) => d.id === id), `knowledge doc ${id} in knowledge service`);
}
for (const id of reg.workflowIds || []) {
    const wfs = await listWorkflows(companyId);
    assert.ok(wfs.some((w) => w.id === id), `workflow ${id} in workflow service`);
}
const regJson = JSON.stringify(reg);
assert.ok(!regJson.includes('"content":'), "registry must not embed knowledge content");
console.log("✓ registry holds references; resources authoritative in tenant services");

// --- concurrent install (second tenant, same pack) ---
const companyB = `${companyId}-b`;
const claimA = await claimInstall(companyB, PACK_FREE, { installedBy: "a" });
assert.equal(claimA.outcome, "claimed");
let concurrentError = null;
try {
    const second = await claimInstall(companyB, PACK_FREE, { installedBy: "b" });
    assertInstallClaimResult(second);
} catch (err) {
    concurrentError = err;
}
assert.ok(concurrentError instanceof MarketplaceInstallError);
assert.equal(concurrentError.code, INSTALL_IN_PROGRESS);
console.log("✓ concurrent claim → INSTALL_IN_PROGRESS");

const repo = await getMarketplaceInstallRepository();

// --- stale installing claim takeover (memory repo) ---
const companyStale = `${companyId}-stale`;
const claimStale = await claimInstall(companyStale, PACK_FREE, { installedBy: "stale-test" });
assert.equal(claimStale.outcome, "claimed");
const staleKey = `${companyStale}::${PACK_FREE}`;
if (repo.docs?.has(staleKey)) {
    const rec = repo.docs.get(staleKey);
    rec.updatedAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    repo.docs.set(staleKey, rec);
}
const staleRetry = await claimInstall(companyStale, PACK_FREE, { installedBy: "stale-retry" });
assert.equal(staleRetry.outcome, "claimed");
assert.notEqual(staleRetry.installAttemptId, claimStale.installAttemptId);
console.log("✓ stale installing claim → new installAttemptId");

// --- failed + retry attempt id ---
const companyFail = `${companyId}-fail`;
const claimF = await claimInstall(companyFail, PACK_FREE, { installedBy: "fail-test" });
await failInstall(companyFail, PACK_FREE, claimF.installAttemptId, "simulated validation failure");
const failedRec = await getInstall(companyFail, PACK_FREE);
assert.equal(failedRec.status, "failed");
assert.ok(failedRec.lastError);
const claimRetry = await claimInstall(companyFail, PACK_FREE, { installedBy: "retry" });
assert.equal(claimRetry.outcome, "claimed");
assert.notEqual(claimRetry.installAttemptId, claimF.installAttemptId);
console.log("✓ failed → retry with new installAttemptId");

// --- getInstall any status vs list installed only ---
const installingOnly = await getInstall(companyB, PACK_FREE);
assert.equal(installingOnly.status, "installing");
const listed = await getInstalledPacks(companyB);
assert.equal(listed.items.length, 0);
assert.equal(await isInstalled(companyB, PACK_FREE), false);
console.log("✓ getInstall(any status) vs listInstalled(installed only)");

// --- RTB untouched ---
if (repo.docs) {
    for (const key of repo.docs.keys()) {
        assert.ok(!key.startsWith(`${RTB_ID}::`), "must not write RTB registry in verify");
    }
}
console.log("✓ RTB registry not written in verify run");

// --- duplicate did not double agents ---
const agentsFinal = await listAiEmployees(companyId);
assert.equal(agentsFinal.length, agentCountAfterDup);
console.log("✓ duplicate install did not duplicate agents");

// --- 4A static regression ---
execSync("node scripts/verify-portal-4a-marketplace-auth.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
execSync("node scripts/verify-portal-4a-r1-marketplace-security.js", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, STORAGE_BACKEND: "memory" },
});
console.log("✓ PORTAL-4A static verify scripts pass");

const firestoreTest = process.argv.includes("--firestore");
if (firestoreTest && process.env.STORAGE_BACKEND === "firestore") {
    const fsCompany = process.env.PORTAL_4B_FIRESTORE_COMPANY || `portal-4b-fs-${Date.now()}`;
    await installIndustryPack(fsCompany, PACK_FREE, {}, { installedBy: "verify-4b-firestore" });
    const before = await getInstalledPacks(fsCompany);
    assert.equal(before.items.length, 1);

    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/verify-portal-4b-marketplace-registry-restart.js"], {
            cwd: ROOT,
            env: {
                ...process.env,
                STORAGE_BACKEND: "firestore",
                PORTAL_4B_RESTART_COMPANY: fsCompany,
                PORTAL_4B_RESTART_PACK: PACK_FREE,
            },
            stdio: "inherit",
        });
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`restart check exit ${code}`))));
    });
    console.log("✓ Firestore restart persistence (child process)");
} else {
    console.log("(Firestore restart test skipped — run with STORAGE_BACKEND=firestore --firestore)");
}

console.log("\nPORTAL-4B marketplace registry verification passed");
