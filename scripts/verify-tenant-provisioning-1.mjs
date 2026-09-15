#!/usr/bin/env node
/**
 * TENANT-PROVISIONING-1 — read-only tenant provisioning contract verifier.
 *
 * Normal (read-only):
 *   CLIENT2_COMPANY_ID=... CLIENT2_OWNER_UID=... node scripts/verify-tenant-provisioning-1.mjs
 *
 * Controlled idempotency acceptance (runs operator provision twice):
 *   VERIFY_IDEMPOTENCY=true CLIENT2_*=... node scripts/verify-tenant-provisioning-1.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "node:child_process";
import admin from "firebase-admin";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { DEMO_COMPANY_ID } from "../services/core/dataMode.js";
import { isValidCompanyId } from "../services/auth/validateInput.js";
import { hasAdminCredentials, getAdminFirestore } from "../services/database/firestoreAdmin.js";
import { getStorageAdapter } from "../services/storage/storageAdapter.js";
import { getCompany, getProvisioningLinks } from "../services/tenants/companyService.js";
import {
    isCanonicalProvisioningComplete,
} from "../services/platform/provisioningService.js";
import { listAiEmployees, getDefaultAiEmployee } from "../services/tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";
import { getTenantBilling } from "../services/payments/billingService.js";
import { getWhatsAppIntegration } from "../services/tenants/integrationService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const RTB_ID = CENTRAL_MOTORS_RTB_COMPANY_ID;

const results = [];

function pass(name, detail = "") {
    results.push({ name, ok: true, detail });
}

function fail(name, detail = "") {
    results.push({ name, ok: false, detail });
}

function stableJson(value) {
    return JSON.stringify(value, Object.keys(value).sort());
}

/**
 * Read-only Central Motors fingerprint (never writes).
 */
export async function captureRtbFingerprint() {
    if (!hasAdminCredentials()) {
        throw new Error("NO_ADMIN_CREDENTIALS");
    }
    getAdminFirestore();
    const db = getAdminFirestore();

    const companySnap = await db.collection("companies").doc(RTB_ID).get();
    const company = companySnap.exists ? companySnap.data() : null;

    const agentSnap = await db.collection("companies").doc(RTB_ID).collection("aiEmployees").get();
    const agents = agentSnap.docs
        .map((d) => {
            const data = d.data() || {};
            return {
                id: d.id,
                isDefault: Boolean(data.isDefault),
                knowledgeBaseId: data.knowledgeBaseId || null,
                name: data.name || null,
            };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    const provisioning = await getProvisioningLinks(RTB_ID);
    let whatsapp = null;
    try {
        whatsapp = await getWhatsAppIntegration(RTB_ID);
    } catch {
        whatsapp = null;
    }

    return {
        companyId: RTB_ID,
        companyCore: company
            ? {
                  name: company.name || null,
                  plan: company.plan || null,
                  status: company.status || null,
                  industry: company.industry || null,
                  provisionedAt: company.provisionedAt || null,
              }
            : null,
        agents,
        provisioningLinks: provisioning?.links || null,
        provisioningComplete: isCanonicalProvisioningComplete(provisioning),
        whatsapp: whatsapp
            ? {
                  status: whatsapp.status || null,
                  companyId: whatsapp.companyId || null,
                  phoneNumberId: whatsapp.phoneNumberId ? "***" : null,
              }
            : null,
    };
}

export function rtbFingerprintsEqual(before, after) {
    return stableJson(before) === stableJson(after);
}

function expectedKbId(companyId) {
    return `kb-${companyId}`;
}

export async function verifyTenantContract({
    companyId,
    ownerUid,
    expectName,
    expectIndustry = "",
    expectPlan = "trial",
    expectOwnerEmail = null,
}) {
    const checks = [];
    const passCheck = (name, detail = "") => checks.push({ name, ok: true, detail });
    const failCheck = (name, detail = "") => checks.push({ name, ok: false, detail });

    if (!companyId || !isValidCompanyId(companyId)) {
        failCheck("companyId format");
        return { ok: false, results: checks };
    }

    const company = await getCompany(companyId);
    if (!company) {
        failCheck("company exists");
        return { ok: false, results: checks };
    }
    passCheck("company exists");
    passCheck("company id", companyId);
    if (expectName && company.name === expectName) passCheck("company name", company.name);
    else if (expectName) failCheck("company name", `expected ${expectName}, got ${company.name}`);
    else passCheck("company name", company.name || "(any)");

    if ((company.industry || "") === (expectIndustry || "")) passCheck("company industry", company.industry || "");
    else failCheck("company industry", `expected "${expectIndustry}", got "${company.industry || ""}"`);

    if ((company.plan || "") === expectPlan) passCheck("company plan", company.plan);
    else failCheck("company plan", `expected ${expectPlan}, got ${company.plan}`);

    if ((company.status || "active") === "active") passCheck("company status active");
    else failCheck("company status active", company.status);

    const provisioning = await getProvisioningLinks(companyId);
    if (isCanonicalProvisioningComplete(provisioning)) passCheck("canonical provisioning record");
    else failCheck("canonical provisioning record", JSON.stringify(provisioning || {}));

    const links = provisioning?.links || {};
    if (links.agentId) passCheck("provisioning agent link", links.agentId);
    else failCheck("provisioning agent link");

    const kbId = expectedKbId(companyId);
    if (links.knowledgeBaseId === kbId) passCheck("provisioning KB link", kbId);
    else failCheck("provisioning KB link", `expected ${kbId}, got ${links.knowledgeBaseId}`);

    const agents = await listAiEmployees(companyId);
    const defaults = agents.filter((a) => a.isDefault);
    if (defaults.length === 1) passCheck("single default AI employee", defaults[0].id);
    else failCheck("single default AI employee", `count=${defaults.length}`);

    const defaultAgent = (await getDefaultAiEmployee(companyId)) || defaults[0];
    if (defaultAgent?.knowledgeBaseId === kbId) passCheck("default agent KB", kbId);
    else failCheck("default agent KB", defaultAgent?.knowledgeBaseId);

    if (defaultAgent?.knowledgeBaseId !== "rtb-kb-1") passCheck("not RTB KB substitution");
    else failCheck("not RTB KB substitution", "rtb-kb-1");

    const docs = await listKnowledgeDocuments(companyId);
    passCheck("knowledge document count reported", String(docs.length));

    const billing = await getTenantBilling(companyId);
    if (billing?.planId === expectPlan) passCheck("billing plan", billing.planId);
    else failCheck("billing plan", JSON.stringify(billing || {}));

    if (expectPlan === "trial") {
        if (billing?.status === "trialing") passCheck("billing trialing");
        else failCheck("billing trialing", billing?.status);
    } else {
        passCheck("billing status", billing?.status || "(non-trial check skipped)");
    }

    const marketplaceEnabled = company.settings?.marketplace?.enabled === true;
    if (marketplaceEnabled) passCheck("marketplace enabled");
    else failCheck("marketplace enabled", JSON.stringify(company.settings?.marketplace || {}));

    if (ownerUid) {
        getAdminFirestore();
        try {
            await admin.auth().getUser(ownerUid);
            passCheck("owner Auth UID exists");
        } catch {
            failCheck("owner Auth UID exists");
        }

        const db = getAdminFirestore();
        const profileSnap = await db.collection("users").doc(ownerUid).get();
        if (profileSnap.exists) passCheck("global profile exists");
        else failCheck("global profile exists");

        const profile = profileSnap.data() || {};
        const profileCo = profile.companyId || profile.company;
        if (profileCo === companyId) passCheck("profile companyId", companyId);
        else failCheck("profile companyId", profileCo);

        if (expectOwnerEmail && profile.email?.toLowerCase() === expectOwnerEmail.toLowerCase()) {
            passCheck("profile email");
        } else if (expectOwnerEmail) {
            failCheck("profile email", profile.email);
        }

        const memberSnap = await db.collection("companies").doc(companyId).collection("users").doc(ownerUid).get();
        if (memberSnap.exists) passCheck("tenant membership exists");
        else failCheck("tenant membership exists");

        const role = memberSnap.data()?.role;
        if (role === "owner") passCheck("membership role owner");
        else failCheck("membership role owner", role);
    }

    const ok = checks.every((r) => r.ok);
    return { ok, results: checks, snapshot: { agentId: defaultAgent?.id, kbId, docCount: docs.length } };
}

function parseProvisionStdout(stdout) {
    const text = String(stdout || "").trim();
    try {
        return JSON.parse(text);
    } catch {
        const jsonStart = text.lastIndexOf('\n{\n  "ok"');
        if (jsonStart >= 0) {
            return JSON.parse(text.slice(jsonStart + 1));
        }
        const lines = text.split("\n");
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i].trim();
            if (line.startsWith("{")) {
                return JSON.parse(line);
            }
        }
        throw new Error("Invalid JSON stdout");
    }
}

function runProvisionScript(env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(ROOT, "scripts/provision-client-2-tenant.mjs")], {
            env: { ...process.env, ...env, DOTENV_CONFIG_QUIET: "true" },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => {
            stdout += c;
        });
        child.stderr.on("data", (c) => {
            stderr += c;
        });
        child.on("close", (code) => {
            let parsed = null;
            try {
                parsed = parseProvisionStdout(stdout);
            } catch {
                parsed = { ok: false, error: "Invalid JSON stdout", stdout, stderr };
            }
            resolve({ code, parsed, stdout, stderr });
        });
        child.on("error", reject);
    });
}

async function main() {
    const companyId = (process.env.CLIENT2_COMPANY_ID || "").trim();
    const ownerUid = (process.env.CLIENT2_OWNER_UID || "").trim();
    const expectName = (process.env.CLIENT2_COMPANY_NAME || "").trim();
    const expectIndustry = (process.env.CLIENT2_INDUSTRY || "").trim();
    const expectPlan = (process.env.CLIENT2_PLAN || "trial").trim();
    const expectOwnerEmail = (process.env.CLIENT2_OWNER_EMAIL || "").trim().toLowerCase() || null;
    const idempotencyMode = String(process.env.VERIFY_IDEMPOTENCY || "").toLowerCase() === "true";

    if (!hasAdminCredentials()) {
        console.log(JSON.stringify({ ok: false, error: "NO_ADMIN_CREDENTIALS" }, null, 2));
        process.exit(1);
    }

    await getStorageAdapter();

    if (idempotencyMode) {
        if (!companyId || !ownerUid || !expectName || !expectOwnerEmail) {
            console.log(
                JSON.stringify(
                    {
                        ok: false,
                        error: "VERIFY_IDEMPOTENCY requires CLIENT2_COMPANY_ID, CLIENT2_COMPANY_NAME, CLIENT2_OWNER_UID, CLIENT2_OWNER_EMAIL",
                    },
                    null,
                    2
                )
            );
            process.exit(1);
        }

        const fpBefore = await captureRtbFingerprint();
        const run1 = await runProvisionScript({
            CLIENT2_COMPANY_ID: companyId,
            CLIENT2_COMPANY_NAME: expectName,
            CLIENT2_OWNER_UID: ownerUid,
            CLIENT2_OWNER_EMAIL: expectOwnerEmail,
            CLIENT2_INDUSTRY: expectIndustry,
            CLIENT2_PLAN: expectPlan,
        });
        if (run1.code !== 0 || !run1.parsed?.ok) {
            console.log(JSON.stringify({ ok: false, phase: "provision_run_1", ...run1.parsed, stderr: run1.stderr }, null, 2));
            process.exit(1);
        }
        if (run1.parsed.mode !== "created" && run1.parsed.mode !== "alreadyProvisioned") {
            console.log(JSON.stringify({ ok: false, error: "run1 missing mode", parsed: run1.parsed }, null, 2));
            process.exit(1);
        }

        const snap1 = run1.parsed.snapshot || {};
        const run2 = await runProvisionScript({
            CLIENT2_COMPANY_ID: companyId,
            CLIENT2_COMPANY_NAME: expectName,
            CLIENT2_OWNER_UID: ownerUid,
            CLIENT2_OWNER_EMAIL: expectOwnerEmail,
            CLIENT2_INDUSTRY: expectIndustry,
            CLIENT2_PLAN: expectPlan,
        });
        if (run2.code !== 0 || !run2.parsed?.ok) {
            console.log(JSON.stringify({ ok: false, phase: "provision_run_2", ...run2.parsed }, null, 2));
            process.exit(1);
        }
        if (run2.parsed.mode !== "alreadyProvisioned") {
            console.log(
                JSON.stringify({ ok: false, error: "run2 expected alreadyProvisioned", mode: run2.parsed.mode }, null, 2)
            );
            process.exit(1);
        }

        const snap2 = run2.parsed.snapshot || {};
        if (snap1.agentId && snap2.agentId && snap1.agentId === snap2.agentId) {
            pass("idempotency same agent");
        } else {
            fail("idempotency same agent", `${snap1.agentId} vs ${snap2.agentId}`);
        }
        if (snap1.knowledgeBaseId && snap1.knowledgeBaseId === snap2.knowledgeBaseId) {
            pass("idempotency same KB");
        } else {
            fail("idempotency same KB");
        }

        const fpAfter = await captureRtbFingerprint();
        if (rtbFingerprintsEqual(fpBefore, fpAfter)) pass("RTB fingerprint unchanged");
        else fail("RTB fingerprint unchanged");

        const contract = await verifyTenantContract({
            companyId,
            ownerUid,
            expectName,
            expectIndustry,
            expectPlan,
            expectOwnerEmail,
        });
        for (const r of contract.results) {
            if (r.ok) pass(`contract:${r.name}`, r.detail);
            else fail(`contract:${r.name}`, r.detail);
        }

        const ok = results.every((r) => r.ok) && contract.ok;
        console.log(
            JSON.stringify(
                {
                    ok,
                    mode: "idempotency_acceptance",
                    companyId,
                    run1Mode: run1.parsed.mode,
                    run2Mode: run2.parsed.mode,
                    results,
                },
                null,
                2
            )
        );
        process.exit(ok ? 0 : 1);
    }

    if (!companyId) {
        console.log(JSON.stringify({ ok: false, error: "CLIENT2_COMPANY_ID is required" }, null, 2));
        process.exit(1);
    }

    const contract = await verifyTenantContract({
        companyId,
        ownerUid: ownerUid || null,
        expectName: expectName || null,
        expectIndustry,
        expectPlan,
        expectOwnerEmail,
    });

    console.log(
        JSON.stringify(
            {
                ok: contract.ok,
                mode: "read_only",
                companyId,
                results: contract.results,
                snapshot: contract.snapshot,
            },
            null,
            2
        )
    );
    process.exit(contract.ok ? 0 : 1);
}

if (process.argv[1]?.includes("verify-tenant-provisioning-1")) {
    main().catch((err) => {
        console.log(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2));
        process.exit(1);
    });
}
