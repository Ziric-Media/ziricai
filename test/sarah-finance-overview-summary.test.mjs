import assert from "node:assert/strict";
import test from "node:test";

import {
    buildFinanceOverviewSummary,
    compareMovementPeriods,
    resolvePreviousOverviewPeriod,
} from "../services/finance/financeOverviewSummary.js";
import { resolveOverviewPeriod } from "../js/portal/financeOverviewCalculations.js";
import { isToolAllowedInFinanceSarah } from "../services/sarah/financeSarahToolPolicy.js";
import { createViewFinanceOverviewSummaryTool } from "../services/sarah/tools/viewFinanceOverviewSummary.js";

test("overview summary excludes void movement and separates receivables", () => {
    const nowMs = Date.parse("2026-10-21T12:00:00.000Z");
    const period = resolveOverviewPeriod({ preset: "all" }, nowMs);
    const result = buildFinanceOverviewSummary({
        transactions: [
            {
                recordType: "income",
                direction: "in",
                amountMinor: 5000,
                currency: "ZAR",
                status: "posted",
                occurredAt: "2026-10-01",
            },
            {
                recordType: "expense",
                direction: "out",
                amountMinor: 1000,
                currency: "ZAR",
                status: "posted",
                occurredAt: "2026-10-02",
            },
            {
                recordType: "income",
                direction: "in",
                amountMinor: 999,
                currency: "ZAR",
                status: "void",
                occurredAt: "2026-10-03",
            },
        ],
        invoices: [
            {
                invoiceKind: "receivable",
                status: "sent",
                totalMinor: 3000,
                amountPaidMinor: 0,
                currency: "ZAR",
                dueDate: "2026-11-01",
            },
        ],
        period: { preset: "all" },
        nowMs,
        dataCoverage: { complete: true, totalsScope: "full_tenant_scan" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.stats.postedCount, 2);
    assert.equal(result.movement[0].netMinor, 4000);
    assert.equal(result.receivables[0].totalMinor, 3000);
    assert.ok(result.limitations.length >= 2);
});

test("period comparison uses equal-length previous window", () => {
    const nowMs = Date.parse("2026-10-21T12:00:00.000Z");
    const current = resolveOverviewPeriod({ preset: "30d" }, nowMs);
    const previous = resolvePreviousOverviewPeriod(current, nowMs);
    assert.ok(previous?.startMs < current.startMs);
    const comparison = compareMovementPeriods(
        [{ currency: "ZAR", incomeMinor: 100, expenseMinor: 40, netMinor: 60 }],
        [{ currency: "ZAR", incomeMinor: 80, expenseMinor: 30, netMinor: 50 }]
    );
    assert.equal(comparison[0].netChangeMinor, 10);
});

test("Finance allowlist includes overview summary and excludes BOS writes", () => {
    assert.equal(isToolAllowedInFinanceSarah("viewFinanceOverviewSummary", { financeSarah: true }), true);
    assert.equal(isToolAllowedInFinanceSarah("applyBosCommercialCycleAction", { financeSarah: true }), false);
});

test("overview tool returns dataCoverage from scan", async () => {
    const tool = createViewFinanceOverviewSummaryTool({
        listTransactionsPage: async () => ({ items: [], hasMore: false, nextCursor: null }),
        listInvoicesPage: async () => ({ items: [], hasMore: false, nextCursor: null }),
    });
    const result = await tool.execute(
        { companyId: "tenant-a", uid: "user-a", role: "owner" },
        { periodPreset: "90d" }
    );
    assert.ok(result.data?.dataCoverage);
});
