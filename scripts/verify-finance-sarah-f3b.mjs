#!/usr/bin/env node
/** F-Sarah 3b — tenant COA storage + manual journals. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.STORAGE_BACKEND = "memory";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { ensureDefaultFinanceGlAccounts, listFinanceGlAccountsForAccess } = await import(
    "../services/finance/financeGlAccountService.js"
);
const { createFinanceJournalEntryForAccess } = await import("../services/finance/financeJournalService.js");
const { FINANCE_SARAH_ALLOWED_TOOL_NAMES } = await import("../services/sarah/financeSarahToolPolicy.js");

console.log("verify-finance-sarah-f3b\n");

for (const name of ["viewFinanceJournalEntries", "prepareFinanceManualJournalDraft"]) {
    assert.ok(FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(name), name);
}

const schema = readFileSync(join(ROOT, "services/database/schema.js"), "utf8");
assert.match(schema, /FINANCE_GL_ACCOUNTS/);
assert.match(schema, /FINANCE_JOURNAL_ENTRIES/);

const access = { uid: "f3b-verify", role: "owner" };
const companyId = "f3b-verify-co";
const accounts = await ensureDefaultFinanceGlAccounts(companyId, access);
assert.ok(accounts.length >= 7);
const listed = await listFinanceGlAccountsForAccess(companyId, access);
assert.ok((Array.isArray(listed) ? listed : listed.items).length >= 7);

const entry = await createFinanceJournalEntryForAccess(companyId, access, {
    entryDate: "2026-10-21",
    memo: "verify",
    lines: [
        { accountCode: "4100", currency: "ZAR", creditAmount: 10 },
        { accountCode: "1100", currency: "ZAR", debitAmount: 10 },
    ],
});
assert.ok(entry.id);

console.log("✓ Tenant COA seeded and stored");
console.log("✓ Balanced manual journal persisted");
console.log("✓ Sarah F3b tools on allowlist");
console.log("\nFINANCE_SARAH_F3B_PASS");
