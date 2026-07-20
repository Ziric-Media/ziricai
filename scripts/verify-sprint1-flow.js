#!/usr/bin/env node
/**
 * Sprint 1 verification — simulates full onboarding and asserts automatic chain.
 * Run: STORAGE_BACKEND=memory node scripts/verify-sprint1-flow.js
 */
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

const results = [];

function pass(name, detail = "") {
    results.push({ name, ok: true, detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
    console.log("\nSprint 1 — Connect Everything verification");
    console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}\n`);

    const { initEventSystem } = await import("../services/events/index.js");
    initEventSystem();

    const { completeOnboarding } = await import("../services/platform/onboardingOrchestrator.js");
    const { getCompany } = await import("../services/tenants/companyService.js");
    const { getTenantBilling } = await import("../services/payments/billingService.js");
    const { listAiEmployees } = await import("../services/tenants/aiEmployeeService.js");
    const { listKnowledgeDocuments } = await import("../services/tenants/knowledgeService.js");
    const { listCustomers } = await import("../services/customerService.js");
    const { listPlatformCompanies, getPlatformRegistryActivity, getPlatformRegistryMetrics } =
        await import("../services/platform/platformRegistry.js");
    const { listEvents } = await import("../services/events/eventStore.js");
    const { getPlatformActivity } = await import("../services/operations/platformOperations.js");
    const { getStorageAdapter } = await import("../services/storage/storageAdapter.js");

    const stamp = Date.now();
    const payload = {
        companyName: `Sprint1 Verify ${stamp}`,
        ownerName: "Verify Owner",
        ownerEmail: `verify-${stamp}@sprint1.test`,
        uid: `verify-uid-${stamp}`,
        industryId: "retail",
        faqText: "Q: Hours? A: Mon-Fri 8-5",
        seedDemoLead: true,
    };

    console.log("1. POST /api/onboarding/complete (simulated)...");
    let outcome;
    try {
        outcome = await completeOnboarding(payload);
        pass("completeOnboarding", `companyId=${outcome.companyId}`);
    } catch (err) {
        fail("completeOnboarding", err.message);
        printSummary();
        process.exit(1);
    }

    const { companyId } = outcome;

    console.log("\n2. Asserting provisioned resources...");

    const company = await getCompany(companyId);
    company ? pass("company record") : fail("company record", "missing");

    const billing = await getTenantBilling(companyId);
    if (billing?.planId === "trial" && billing?.trialEndsAt) {
        pass("subscription/trial billing", `renews ${billing.renewalDate || billing.trialEndsAt}`);
    } else {
        fail("subscription/trial billing", JSON.stringify(billing || {}));
    }

    const agents = await listAiEmployees(companyId);
    agents.length >= 1
        ? pass("default AI employee", agents[0]?.name || agents[0]?.id)
        : fail("default AI employee", "none found");

    const docs = await listKnowledgeDocuments(companyId);
    docs.length >= 1
        ? pass("knowledge base documents", `${docs.length} doc(s)`)
        : fail("knowledge base documents", "empty");

    const customers = await listCustomers({ companyId, limit: 10 });
    customers.length >= 1
        ? pass("CRM workspace / seed lead", `${customers.length} contact(s)`)
        : fail("CRM workspace / seed lead", "no contacts");

    const store = await getStorageAdapter();
    if (store.getAnalytics) {
        const analytics = await store.getAnalytics(companyId);
        analytics ? pass("analytics seed", "scope exists") : fail("analytics seed", "missing");
    } else {
        pass("analytics seed", "adapter hook optional");
    }

    const platformCos = listPlatformCompanies();
    const inRegistry = platformCos.some((c) => c.id === companyId);
    inRegistry ? pass("super-admin platform registry") : fail("super-admin platform registry", "not listed");

    const registryActivity = getPlatformRegistryActivity(5);
    registryActivity.length >= 1
        ? pass("platform activity feed", `${registryActivity.length} item(s)`)
        : fail("platform activity feed", "empty");

    const opsActivity = await getPlatformActivity();
    const hasOnboardEntry = opsActivity.items?.some(
        (i) => i.text?.includes(payload.companyName) || i.detail?.includes("Owner")
    );
    hasOnboardEntry || opsActivity.items?.length >= 1
        ? pass("GET /api/operations/activity visibility")
        : fail("GET /api/operations/activity visibility", "no entries");

    const metrics = getPlatformRegistryMetrics();
    metrics.companiesTotal >= 1
        ? pass("command center company metrics", `total=${metrics.companiesTotal}`)
        : fail("command center company metrics", JSON.stringify(metrics));

    const events = await listEvents(companyId, { limit: 20 });
    const types = new Set(events.items.map((e) => e.type));
    const expected = ["CompanyCreated", "CompanyProvisioned", "SubscriptionStarted", "KnowledgeUploaded"];
    for (const t of expected) {
        types.has(t) ? pass(`event: ${t}`) : fail(`event: ${t}`, "not emitted");
    }
    types.has("LeadCaptured")
        ? pass("event: LeadCaptured (seed)")
        : fail("event: LeadCaptured (seed)", "optional seed missing");

    outcome.workspaceSnapshot?.companyId === companyId
        ? pass("workspace snapshot for portal redirect")
        : fail("workspace snapshot for portal redirect");

    outcome.sarahContext?.companyId === companyId && outcome.sarahContext?.agentCount >= 1
        ? pass("Sarah context bootstrap")
        : fail("Sarah context bootstrap", JSON.stringify(outcome.sarahContext || {}));

    printSummary();
    process.exit(results.every((r) => r.ok) ? 0 : 1);
}

function printSummary() {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log("\n-----------------------------------");
    console.log(`Result: ${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
    console.log("-----------------------------------\n");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
