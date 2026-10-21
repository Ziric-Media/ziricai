import assert from "node:assert/strict";
import test from "node:test";

process.env.STORAGE_BACKEND = "memory";

const { createFinanceJournalEntryForAccess, normalizeAndValidateJournalLines } = await import(
    "../services/finance/financeJournalService.js"
);
const { ensureDefaultFinanceGlAccounts } = await import("../services/finance/financeGlAccountService.js");
const { buildTrialBalanceProjection } = await import("../services/finance/financeGlReadService.js");

const access = { uid: "journal-test-user", role: "finance" };
const companyId = "journal-test-co";

test("rejects unbalanced manual journal", async () => {
    await ensureDefaultFinanceGlAccounts(companyId, access);
    await assert.rejects(
        () =>
            normalizeAndValidateJournalLines(companyId, access, [
                { accountCode: "5100", currency: "ZAR", debitAmount: 100 },
                { accountCode: "1100", currency: "ZAR", creditAmount: 50 },
            ]),
        (err) => err?.code === "FINANCE_JOURNAL_UNBALANCED"
    );
});

test("creates balanced journal and reflects in trial balance projection", async () => {
    const entry = await createFinanceJournalEntryForAccess(companyId, access, {
        entryDate: "2026-10-20",
        memo: "Test accrual",
        lines: [
            { accountCode: "5100", currency: "ZAR", debitAmount: 250 },
            { accountCode: "1100", currency: "ZAR", creditAmount: 250 },
        ],
    });
    assert.equal(entry.status, "posted");
    assert.equal(entry.lineCount, 2);
    const tb = buildTrialBalanceProjection([], [], [entry]);
    assert.ok(tb.lines.some((l) => l.code === "5100" && l.debitMinor >= 25000));
});
