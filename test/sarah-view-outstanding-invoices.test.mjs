import assert from "node:assert/strict";
import test from "node:test";

import {
    createViewOutstandingInvoicesTool,
    summariseOutstandingInvoices,
} from "../services/sarah/tools/viewOutstandingInvoices.js";
import viewOutstandingInvoices from "../services/sarah/tools/viewOutstandingInvoices.js";
import {
    FINANCE_SARAH_TOOL_DENIED,
    isToolAllowedInFinanceSarah,
} from "../services/sarah/financeSarahToolPolicy.js";
import { executeTool, registerTool } from "../services/sarah/toolRegistry.js";

const now = new Date("2026-10-18T12:00:00.000Z");

test("summarises only outstanding receivables, by currency", () => {
    const result = summariseOutstandingInvoices(
        [
            { invoiceKind: "receivable", status: "sent", currency: "zar", totalMinor: 10000, amountPaidMinor: 0, dueDate: "2026-10-10" },
            { invoiceKind: "receivable", status: "partial", currency: "ZAR", totalMinor: 8000, amountPaidMinor: 3000, dueDate: "2026-10-18" },
            { invoiceKind: "receivable", status: "sent", currency: "USD", totalMinor: 4000, amountPaidMinor: 0, dueDate: null },
            { invoiceKind: "receivable", status: "paid", currency: "ZAR", totalMinor: 5000, amountPaidMinor: 5000 },
            { invoiceKind: "receivable", status: "draft", currency: "ZAR", totalMinor: 5000, amountPaidMinor: 0 },
            { invoiceKind: "receivable", status: "void", currency: "ZAR", totalMinor: 5000, amountPaidMinor: 0 },
            { invoiceKind: "payable", status: "sent", currency: "ZAR", totalMinor: 5000, amountPaidMinor: 0 },
            { invoiceKind: "receivable", status: "partial", currency: "ZAR", totalMinor: 1000, amountPaidMinor: 1000 },
        ],
        { now }
    );

    assert.deepEqual(result, {
        currencies: [
            { currency: "USD", invoiceCount: 1, outstandingMinor: 4000, overdueCount: 0, overdueMinor: 0, earliestDueDate: null },
            { currency: "ZAR", invoiceCount: 2, outstandingMinor: 15000, overdueCount: 1, overdueMinor: 10000, earliestDueDate: "2026-10-10" },
        ],
        invoiceCount: 3,
        overdueCount: 1,
        empty: false,
    });
});

test("returns the required empty summary", () => {
    assert.deepEqual(summariseOutstandingInvoices([], { now }), {
        currencies: [],
        invoiceCount: 0,
        overdueCount: 0,
        empty: true,
    });
});

test("uses authenticated context rather than tool arguments for Finance access", async () => {
    const calls = [];
    const tool = createViewOutstandingInvoicesTool({
        now: () => now,
        listInvoicesPage: async (companyId, access) => {
            calls.push({ companyId, access });
            return { items: [], hasMore: false, nextCursor: null };
        },
    });

    await tool.execute(
        { companyId: "tenant-authenticated", uid: "user-authenticated", role: "finance_manager" },
        { companyId: "tenant-spoofed", uid: "user-spoofed", role: "owner" }
    );

    assert.deepEqual(calls, [{
        companyId: "tenant-authenticated",
        access: { uid: "user-authenticated", role: "finance_manager" },
    }]);
});

test("rejects a missing authenticated Finance actor before invoice access", async () => {
    await assert.rejects(
        () => viewOutstandingInvoices.execute({ companyId: "tenant-a", uid: null, role: "owner" }),
        (error) => error?.code === "UNAUTHORIZED"
    );
});

test("rejects an authenticated caller without Finance view permission before invoice access", async () => {
    await assert.rejects(
        () => viewOutstandingInvoices.execute({ companyId: "tenant-a", uid: "user-a", role: "support" }),
        (error) => error?.code === "PERMISSION_DENIED"
    );
});

test("Finance default-deny applies at tool execution", async () => {
    const deniedName = "unrelatedFinanceToolForTest";
    registerTool({
        name: deniedName,
        description: "test only",
        parameters: { type: "object", properties: {} },
        async execute() {
            throw new Error("must not execute");
        },
    });

    assert.equal(isToolAllowedInFinanceSarah("viewOutstandingInvoices", { financeSarah: true }), true);
    assert.equal(isToolAllowedInFinanceSarah(deniedName, { financeSarah: true }), false);
    const result = await executeTool(deniedName, { financeSarah: true });
    assert.equal(result.code, FINANCE_SARAH_TOOL_DENIED);
});
