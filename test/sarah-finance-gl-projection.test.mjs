import assert from "node:assert/strict";
import test from "node:test";
import { buildTrialBalanceProjection, listDefaultChartOfAccounts } from "../services/finance/financeGlReadService.js";
import { isToolAllowedInFinanceSarah } from "../services/sarah/financeSarahToolPolicy.js";

test("default COA template exposes core account types", () => {
    const accounts = listDefaultChartOfAccounts();
    assert.ok(accounts.some((a) => a.code === "1200" && a.type === "asset"));
    assert.ok(accounts.some((a) => a.code === "4100" && a.type === "income"));
});

test("trial balance projection includes income and AR", () => {
    const result = buildTrialBalanceProjection(
        [
            {
                status: "posted",
                recordType: "income",
                amountMinor: 5000,
                currency: "ZAR",
                category: "Sales",
            },
        ],
        [
            {
                invoiceKind: "receivable",
                status: "sent",
                totalMinor: 2000,
                amountPaidMinor: 0,
                currency: "ZAR",
            },
        ]
    );
    assert.ok(result.lines.some((l) => l.code === "4100" && l.creditMinor >= 5000));
    assert.ok(result.lines.some((l) => l.code === "1200" && l.debitMinor >= 2000));
    assert.ok(result.limitations.length >= 2);
});

test("GL read tools allowed in Finance Sarah mode", () => {
    const ctx = { financeSarah: true };
    assert.equal(isToolAllowedInFinanceSarah("viewFinanceTrialBalance", ctx), true);
    assert.equal(isToolAllowedInFinanceSarah("viewFinanceChartOfAccounts", ctx), true);
    assert.equal(isToolAllowedInFinanceSarah("prepareFinanceInvoicePaymentDraft", ctx), false);
});
