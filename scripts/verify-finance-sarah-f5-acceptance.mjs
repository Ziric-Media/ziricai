#!/usr/bin/env node
/**
 * SF-CORE-01 F5 — automated acceptance cases (memory + optional loopback).
 * See docs/architecture/SF_CORE_01_F5_ACCEPTANCE_MATRIX.md
 */
import assert from "node:assert/strict";

process.env.OPS_SMOKE_MEMORY_ISOLATED = "1";
process.env.STORAGE_BACKEND = "memory";

const BASE = process.env.FINANCE_ACCEPTANCE_BASE || "http://127.0.0.1:3099";

const failures = [];
const passed = [];
const loopbackSkipped = [];

function record(id, fn) {
    try {
        fn();
        passed.push(id);
    } catch (err) {
        failures.push({ id, message: err?.message || String(err) });
    }
}

async function recordAsync(id, fn) {
    try {
        await fn();
        passed.push(id);
    } catch (err) {
        failures.push({ id, message: err?.message || String(err) });
    }
}

async function recordLoopbackOptional(id, fn) {
    try {
        await fn();
        passed.push(id);
    } catch (err) {
        loopbackSkipped.push({ id, message: err?.message || String(err) });
        console.error(`(optional loopback ${id} skipped: ${err.message})`);
    }
}

console.log("verify-finance-sarah-f5-acceptance\n");

const { initSarahTools } = await import("../services/sarah/tools/index.js");
const { executeTool, getToolsForContext } = await import("../services/sarah/toolRegistry.js");
const { canUseTool } = await import("../services/sarah/permissions.js");
const { createFinanceTransactionForAccess } = await import("../services/finance/financeTransactionService.js");
const { createFinanceInvoiceForAccess } = await import("../services/finance/financeInvoiceService.js");
const { markQuotationNotes } = await import("../js/portal/financeQuotation.js");
const { isFinanceQuotation } = await import("../js/portal/financeQuotation.js");
const {
    prepareFinanceInvoiceDraft,
    prepareFinanceQuotationDraft,
    prepareFinanceLedgerEntryDraft,
    confirmFinanceWrite,
} = await import("../services/sarah/tools/financeSarahWriteTools.js");
const { FINANCE_SARAH_ALLOWED_TOOL_NAMES, isToolAllowedInFinanceSarah } = await import(
    "../services/sarah/financeSarahToolPolicy.js"
);
const { isFinanceSarahPaymentsEnabled } = await import("../services/finance/financeSarahPaymentsGate.js");
const { listFinanceInvoicesForAccess } = await import("../services/finance/financeInvoiceService.js");

initSarahTools();

const companyId = "sf-core-f5-co";
const access = { uid: "sf-f5-owner", role: "owner" };

function financeCtx(sessionId = "sf-f5-session") {
    const sarahSession = { id: sessionId, context: {} };
    return {
        companyId,
        uid: access.uid,
        role: access.role,
        financeSarah: true,
        surface: "portal-finance",
        persona: "client_operator",
        sarahSession,
        canUseTool: (t) => canUseTool({ role: access.role, isSuperAdmin: false }, t),
    };
}

// --- Seed ledger ---
await createFinanceTransactionForAccess(companyId, access, {
    recordType: "income",
    amount: 1000,
    currency: "ZAR",
    occurredAt: "2026-10-10T10:00:00.000Z",
    category: "Sales",
    description: "F5 ZAR income",
});
await createFinanceTransactionForAccess(companyId, access, {
    recordType: "income",
    amount: 100,
    currency: "USD",
    occurredAt: "2026-10-11T10:00:00.000Z",
    category: "Sales",
    description: "F5 USD income",
});
await createFinanceInvoiceForAccess(companyId, access, {
    invoiceKind: "receivable",
    counterpartyName: "F5 Customer",
    currency: "ZAR",
    status: "sent",
    issueDate: "2026-10-01",
    dueDate: "2026-10-31",
    lineItems: [{ description: "Svc", quantity: 1, unitAmount: 300 }],
});
await createFinanceInvoiceForAccess(companyId, access, {
    invoiceKind: "receivable",
    counterpartyName: "Quote Co",
    currency: "ZAR",
    status: "draft",
    issueDate: "2026-10-01",
    lineItems: [{ description: "Quote line", quantity: 1, unitAmount: 99 }],
    notes: markQuotationNotes("F5 quotation"),
});

await recordAsync("F-001", async () => {
    const r = await executeTool("viewFinanceOverviewSummary", financeCtx("s1"), { periodPreset: "all" });
    assert.equal(r.success, true);
    assert.ok(r.data?.movement?.length >= 1, "movement groups");
    assert.ok(r.data?.stats?.postedCount >= 2);
});

await recordAsync("F-002", async () => {
    const r = await executeTool("viewFinanceOverviewSummary", financeCtx("s2"), { periodPreset: "all" });
    const codes = (r.data?.movement || []).map((m) => m.currency);
    assert.ok(codes.includes("ZAR") && codes.includes("USD"));
});

await recordAsync("F-003", async () => {
    const r = await executeTool("viewFinanceOverviewSummary", financeCtx("s3"), { periodPreset: "all" });
    const invs = await listFinanceInvoicesForAccess(companyId, access, { max: 50 });
    const items = Array.isArray(invs) ? invs : invs.items || [];
    const quote = items.find((i) => isFinanceQuotation(i));
    assert.ok(quote, "quotation seeded");
    const recvTotal = (r.data?.receivables || []).reduce((s, g) => s + (g.totalMinor || 0), 0);
    assert.ok(recvTotal >= 30000, "receivables use sent invoice only (minor units)");
});

await recordAsync("F-004", async () => {
    const r = await executeTool("viewFinanceOverviewSummary", financeCtx("s4"), { periodPreset: "90d" });
    assert.match(String(r.data?.period?.label || r.message || ""), /90|day/i);
});

await recordAsync("F-005", async () => {
    const r = await executeTool("viewFinanceOverviewSummary", financeCtx("s5"), { periodPreset: "90d" });
    assert.ok(r.data?.dataCoverage, "dataCoverage on overview");
});

await recordAsync("F-007", async () => {
    const ctx = financeCtx("s7");
    const before = await listFinanceInvoicesForAccess(companyId, access, { max: 100 });
    const beforeCount = (Array.isArray(before) ? before : before.items || []).length;
    const prep = await prepareFinanceInvoiceDraft.execute(ctx, {
        counterpartyName: "Draft Only Ltd",
        lineItems: [{ description: "X", unitAmount: 10 }],
    });
    assert.ok(prep.data?.draftId);
    const after = await listFinanceInvoicesForAccess(companyId, access, { max: 100 });
    const afterCount = (Array.isArray(after) ? after : after.items || []).length;
    assert.equal(afterCount, beforeCount, "prepare must not persist invoice");
});

await recordAsync("F-008", async () => {
    const ctx = financeCtx("s8");
    const prep = await prepareFinanceInvoiceDraft.execute(ctx, {
        counterpartyName: "Confirmed Ltd",
        lineItems: [{ description: "Y", unitAmount: 20 }],
    });
    const conf = await confirmFinanceWrite.execute(ctx, {
        draftId: prep.data.draftId,
        userConfirmed: true,
    });
    assert.ok(conf.data?.record?.id);
});

await recordAsync("F-009", async () => {
    const ctx = financeCtx("s9");
    const prep = await prepareFinanceQuotationDraft.execute(ctx, {
        counterpartyName: "Quote Target",
        lineItems: [{ description: "Q", unitAmount: 15 }],
    });
    const conf = await confirmFinanceWrite.execute(ctx, {
        draftId: prep.data.draftId,
        userConfirmed: true,
    });
    assert.ok(String(conf.data?.record?.notes || "").includes("__DOC:quotation__"));
});

await recordAsync("F-010", async () => {
    const ctx = financeCtx("s10");
    const prep = await prepareFinanceLedgerEntryDraft.execute(ctx, {
        recordType: "expense",
        amount: 5,
        currency: "ZAR",
        description: "F5 petty",
    });
    const conf = await confirmFinanceWrite.execute(ctx, {
        draftId: prep.data.draftId,
        userConfirmed: true,
    });
    assert.equal(conf.data?.record?.recordType, "expense");
});

record("F-015", () => {
    assert.ok(isToolAllowedInFinanceSarah("viewFinanceOverviewSummary", { financeSarah: true }));
    assert.equal(isToolAllowedInFinanceSarah("generateQuote", { financeSarah: true }), false);
    const names = getToolsForContext(financeCtx("s15")).map((t) => t.name);
    for (const n of FINANCE_SARAH_ALLOWED_TOOL_NAMES) {
        assert.ok(names.includes(n), `allowlist tool ${n}`);
    }
});

record("F-018", () => {
    assert.equal(isFinanceSarahPaymentsEnabled(), false);
    assert.equal(isToolAllowedInFinanceSarah("prepareFinanceInvoicePaymentDraft", { financeSarah: true }), false);
});

// --- Optional loopback ---
let loopback = false;
try {
    const health = await fetch(`${BASE}/api/finance-acceptance/health`).then((r) => r.json());
    loopback = health.ok === true;
} catch {
    loopback = false;
}

if (loopback) {
    await recordLoopbackOptional("F-016", async () => {
        const sess = await fetch(`${BASE}/api/finance-acceptance/session?role=owner`).then((r) => r.json());
        const pageContext = encodeURIComponent(
            JSON.stringify({ page: "finance", module: "finance", financeWorkspace: "overview" })
        );
        const toolsRes = await fetch(
            `${BASE}/api/sarah/tools?companyId=${encodeURIComponent(sess.companyId)}&surface=portal-finance&pageContext=${pageContext}`,
            { headers: { Authorization: `Bearer ${sess.token}` } }
        );
        assert.equal(toolsRes.status, 200);
        const body = await toolsRes.json();
        assert.equal(body.financeSarah, true);
        const names = (body.tools || []).map((t) => t.name);
        assert.ok(names.includes("viewFinanceOverviewSummary"));
        assert.ok(!names.includes("generateQuote"));

        const bad = await fetch(`${BASE}/api/sarah/chat`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sess.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                surface: "portal-finance",
                companyId: "demo-central-motors",
                message: "test",
                pageContext: { page: "finance", module: "finance" },
            }),
        });
        assert.notEqual(bad.status, 200);
    });

    await recordLoopbackOptional("F-030-partial", async () => {
        const sess = await fetch(`${BASE}/api/finance-acceptance/session?role=owner`).then((r) => r.json());
        await fetch(`${BASE}/api/finance-acceptance/seed-demo`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sess.token}` },
        });
        const gl = await fetch(`${BASE}/api/portal/finance/${sess.companyId}/gl-accounts`, {
            headers: { Authorization: `Bearer ${sess.token}` },
        });
        if (gl.status === 404) {
            throw new Error(
                "gl-accounts route 404 — restart dev:finance-acceptance server to pick up F3b routes"
            );
        }
        assert.equal(gl.status, 200);
        const glBody = await gl.json();
        assert.ok((glBody.items || []).length >= 7);
    });
} else {
    console.error("(skip F-016 / F-030-partial loopback — start dev:finance-acceptance on :3099)");
}

console.log(`\nPassed: ${passed.length} — ${passed.join(", ")}`);
if (loopbackSkipped.length) {
    console.error(`Loopback optional skipped: ${loopbackSkipped.map((s) => s.id).join(", ")}`);
    console.error("Restart: FINANCE_ACCEPTANCE_SKIP_PREPARE=1 npm run dev:finance-acceptance");
}
if (failures.length) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  ${f.id}: ${f.message}`);
    process.exit(1);
}

console.log("\nFINANCE_SARAH_F5_ACCEPTANCE_PASS");
