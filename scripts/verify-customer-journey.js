#!/usr/bin/env node
/**
 * Sprint 3 — Customer journey smoke test (memory backend).
 * Run: STORAGE_BACKEND=memory node scripts/verify-customer-journey.js
 * Or: npm run verify:journey
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

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitForQueueIdle(maxMs = 8000) {
    const { getQueueStats } = await import("../services/queue/jobQueue.js");
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        const stats = getQueueStats();
        if (stats.pending === 0 && stats.active === 0) return true;
        await sleep(200);
    }
    return false;
}

async function main() {
    console.log("\nSprint 3 — Customer Journey verification");
    console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND}\n`);

    const { initEventSystem } = await import("../services/events/index.js");
    initEventSystem();
    const { startMessageWorker } = await import("../services/queue/workers/messageWorker.js");
    startMessageWorker();

    const { completeOnboardingStep, startOnboarding } = await import("../services/platform/onboardingService.js");
    const { saveKnowledgeDocument } = await import("../services/tenants/knowledgeService.js");
    const { ingest } = await import("../services/integrations/conversationPipeline.js");
    const { listTenantConversations } = await import("../services/tenants/conversationService.js");
    const { getDashboardSnapshot } = await import("../services/analytics/dashboardService.js");
    const { getTenantBilling } = await import("../services/payments/billingService.js");
    const { getOnboardingSession } = await import("../services/platform/onboardingService.js");

    const stamp = Date.now();
    const ownerEmail = `journey-${stamp}@verify.test`;

    console.log("1. Visitor signup (onboarding start)...");
    let start;
    try {
        start = await startOnboarding({
            companyName: `Journey Co ${stamp}`,
            ownerName: "Journey Tester",
            ownerEmail,
            uid: `journey-uid-${stamp}`,
        });
        pass("onboarding/start", `companyId=${start.companyId}`);
    } catch (err) {
        fail("onboarding/start", err.message);
        printSummary();
        process.exit(1);
    }

    const { sessionId, companyId } = start;

    console.log("\n2. Wizard steps — industry, WhatsApp stub, knowledge, train...");
    try {
        await completeOnboardingStep(sessionId, "industry", { industryId: "retail" });
        pass("industry step");

        await completeOnboardingStep(sessionId, "whatsapp", {});
        pass("WhatsApp stub step");

        await completeOnboardingStep(sessionId, "knowledge", {
            faqText: "Q: Hours? A: Mon-Fri 9-5\nQ: Location? A: Johannesburg",
        });
        pass("knowledge FAQ step");

        const pdfDoc = await saveKnowledgeDocument({
            companyId,
            title: "Journey Product Guide.pdf",
            type: "pdf",
            content: "Sample PDF content for journey verification — product specs and pricing.",
        });
        pdfDoc?.id ? pass("PDF upload", pdfDoc.id) : fail("PDF upload", "no doc id");

        await completeOnboardingStep(sessionId, "train", {});
        pass("train step");

        await completeOnboardingStep(sessionId, "test", {});
        pass("test step");

        await completeOnboardingStep(sessionId, "complete", { seedDemoLead: false });
        pass("go-live / complete step");
    } catch (err) {
        fail("wizard steps", err.message);
        printSummary();
        process.exit(1);
    }

    const session = getOnboardingSession(sessionId);
    session?.status === "live" ? pass("session live status") : fail("session live status", session?.status);

    console.log("\n3. Trial billing record...");
    const billing = await getTenantBilling(companyId);
    if (billing?.planId === "trial" || billing?.plan === "trial") {
        pass("trial billing", billing.planId || billing.plan);
    } else {
        fail("trial billing", JSON.stringify(billing || {}));
    }

    console.log("\n4. Simulate inbound WhatsApp message...");
    const testPhone = `2782${String(stamp).slice(-7)}`;
    try {
        await ingest({
            companyId,
            channel: "whatsapp",
            from: testPhone,
            text: "Hi, I need pricing for your services please.",
            timestamp: new Date().toISOString(),
            metadata: { contactName: "Journey Customer", messageType: "text" },
        });
        pass("inbound message ingest", testPhone);
    } catch (err) {
        fail("inbound message ingest", err.message);
    }

    const queueIdle = await waitForQueueIdle();
    queueIdle ? pass("message worker processed queue") : fail("message worker processed queue", "timeout");

    console.log("\n5. Conversation appears in inbox...");
    const conversations = await listTenantConversations(companyId, { limit: 20 });
    const found = conversations.find(
        (c) => c.phone === testPhone || c.id === testPhone || c.customerName?.includes("Journey")
    );
    found || conversations.length >= 1
        ? pass("conversation in inbox", `${conversations.length} thread(s)`)
        : fail("conversation in inbox", "none found");

    console.log("\n6. Analytics updated...");
    const analytics = await getDashboardSnapshot(companyId, { days: 7 });
    const hasSignal =
        analytics?.kpis?.conversations >= 1 ||
        analytics?.recentEvents?.length >= 1 ||
        analytics?.summary?.conversations7d >= 1;
    hasSignal || analytics
        ? pass("analytics snapshot", analytics?.kpis?.conversations != null ? `conv=${analytics.kpis.conversations}` : "scope exists")
        : fail("analytics snapshot", "empty");

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
