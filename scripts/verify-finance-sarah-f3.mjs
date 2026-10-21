#!/usr/bin/env node
/** F-Sarah 3 — GL read projection (SF-02 partial). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSarahTools, ALL_TOOLS } from "../services/sarah/tools/index.js";
import {
    FINANCE_SARAH_ALLOWED_TOOL_NAMES,
    isToolAllowedInFinanceSarah,
} from "../services/sarah/financeSarahToolPolicy.js";
import { buildTrialBalanceProjection } from "../services/finance/financeGlReadService.js";
import { isFinanceSarahPaymentsEnabled } from "../services/finance/financeSarahPaymentsGate.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("verify-finance-sarah-f3\n");

for (const name of ["viewFinanceChartOfAccounts", "viewFinanceTrialBalance"]) {
    assert.ok(FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(name), `${name} on allowlist`);
}

initSarahTools();
assert.ok(ALL_TOOLS.some((t) => t.name === "viewFinanceTrialBalance"));

const tb = buildTrialBalanceProjection(
    [{ status: "posted", recordType: "expense", amountMinor: 100, currency: "ZAR", category: "Fuel" }],
    []
);
assert.ok(tb.lines.length >= 2);

assert.equal(
    isToolAllowedInFinanceSarah("prepareFinanceInvoicePaymentDraft", { financeSarah: true }),
    isFinanceSarahPaymentsEnabled()
);

const gateSrc = readFileSync(join(ROOT, "services/finance/financeSarahPaymentsGate.js"), "utf8");
assert.match(gateSrc, /FINANCE_SARAH_PAYMENTS_ENABLED/);

console.log("✓ GL read tools registered and allowlisted");
console.log("✓ Trial balance projection from ledger");
console.log(`✓ Payment Sarah tool gated (enabled=${isFinanceSarahPaymentsEnabled()})`);
console.log("\nFINANCE_SARAH_F3_PASS");
