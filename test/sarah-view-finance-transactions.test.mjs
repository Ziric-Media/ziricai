import assert from "node:assert/strict";
import test from "node:test";

import viewFinanceTransactions, {
    createViewFinanceTransactionsTool,
    MAX_TRANSACTION_HISTORY,
    summariseFinanceTransactions,
} from "../services/sarah/tools/viewFinanceTransactions.js";
import {
    FINANCE_SARAH_TOOL_DENIED,
    isToolAllowedInFinanceSarah,
} from "../services/sarah/financeSarahToolPolicy.js";
import { executeTool, registerTool } from "../services/sarah/toolRegistry.js";

test("summarises posted transactions by currency and excludes void amounts", () => {
    const result = summariseFinanceTransactions([
        { id: "income", recordType: "income", direction: "in", amountMinor: 1000, currency: "zar", occurredAt: "2026-10-01", status: "posted" },
        { id: "expense", recordType: "expense", direction: "out", amountMinor: 250, currency: "ZAR", occurredAt: "2026-10-02", status: "posted" },
        { id: "transfer", recordType: "transfer", direction: "out", amountMinor: 300, currency: "ZAR", occurredAt: "2026-10-03", status: "posted" },
        { id: "void", recordType: "income", direction: "in", amountMinor: 9999, currency: "ZAR", occurredAt: "2026-10-04", status: "void" },
        { id: "usd", recordType: "expense", direction: "out", amountMinor: 75, currency: "USD", occurredAt: "2026-10-05", status: "posted" },
    ]);

    assert.deepEqual(result.currencies, [
        { currency: "USD", postedCount: 1, voidCount: 0, incomeMinor: 0, expenseMinor: 75, transferMinor: 0 },
        { currency: "ZAR", postedCount: 3, voidCount: 1, incomeMinor: 1000, expenseMinor: 250, transferMinor: 300 },
    ]);
    assert.equal(result.transactionCount, 5);
    assert.equal(result.postedCount, 4);
    assert.equal(result.voidCount, 1);
    assert.equal(result.historyTruncated, false);
});

test("caps history output without trusting client filters", () => {
    const transactions = Array.from({ length: MAX_TRANSACTION_HISTORY + 1 }, (_, index) => ({
        id: `transaction-${index}`,
        recordType: "income",
        direction: "in",
        amountMinor: 1,
        currency: "ZAR",
        status: "posted",
    }));
    const result = summariseFinanceTransactions(transactions);
    assert.equal(result.transactions.length, MAX_TRANSACTION_HISTORY);
    assert.equal(result.historyTruncated, true);
    assert.equal(result.currencies[0].incomeMinor, MAX_TRANSACTION_HISTORY + 1);
});

test("uses authenticated tenant context rather than tool arguments", async () => {
    const calls = [];
    const tool = createViewFinanceTransactionsTool({
        listTransactionsPage: async (companyId, access) => {
            calls.push({ companyId, access });
            return { items: [], hasMore: false, nextCursor: null };
        },
    });
    await tool.execute(
        { companyId: "tenant-authenticated", uid: "user-authenticated", role: "finance" },
        { companyId: "tenant-spoofed", uid: "user-spoofed", role: "owner" }
    );
    assert.deepEqual(calls, [{
        companyId: "tenant-authenticated",
        access: { uid: "user-authenticated", role: "finance" },
    }]);
});

test("rejects missing actor and denied Finance permission", async () => {
    await assert.rejects(
        () => viewFinanceTransactions.execute({ companyId: "tenant-a", uid: null, role: "owner" }),
        (error) => error?.code === "UNAUTHORIZED"
    );
    await assert.rejects(
        () => viewFinanceTransactions.execute({ companyId: "tenant-a", uid: "user-a", role: "support" }),
        (error) => error?.code === "PERMISSION_DENIED"
    );
});

test("Finance policy allowlists transactions while execution remains default-deny", async () => {
    const deniedName = "unrelatedTransactionToolForTest";
    registerTool({
        name: deniedName,
        description: "test only",
        parameters: { type: "object", properties: {} },
        async execute() {
            throw new Error("must not execute");
        },
    });
    assert.equal(isToolAllowedInFinanceSarah("viewFinanceTransactions", { financeSarah: true }), true);
    assert.equal(isToolAllowedInFinanceSarah(deniedName, { financeSarah: true }), false);
    const result = await executeTool(deniedName, { financeSarah: true });
    assert.equal(result.code, FINANCE_SARAH_TOOL_DENIED);
});
