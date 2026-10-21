#!/usr/bin/env node
/**
 * F4 readiness — payment Sarah path exists; remains disabled until ops enables env.
 * Does not set FINANCE_SARAH_PAYMENTS_ENABLED in production or enable portal UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isFinanceSarahPaymentsEnabled } from "../services/finance/financeSarahPaymentsGate.js";
import { isToolAllowedInFinanceSarah } from "../services/sarah/financeSarahToolPolicy.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("verify-finance-sarah-f4-readiness\n");

assert.equal(isFinanceSarahPaymentsEnabled(), false, "payments must stay off in default verify env");

const writeSrc = readFileSync(join(ROOT, "services/sarah/tools/financeSarahWriteTools.js"), "utf8");
assert.match(writeSrc, /prepareFinanceInvoicePaymentDraft/);
assert.match(writeSrc, /invoice_payment/);
assert.match(writeSrc, /recordInvoicePaymentForAccess/);

assert.equal(
    isToolAllowedInFinanceSarah("prepareFinanceInvoicePaymentDraft", { financeSarah: true }),
    false,
    "payment prepare not allowlisted until env enabled"
);

process.env.FINANCE_SARAH_PAYMENTS_ENABLED = "1";
assert.equal(isFinanceSarahPaymentsEnabled(), true);
assert.equal(
    isToolAllowedInFinanceSarah("prepareFinanceInvoicePaymentDraft", { financeSarah: true }),
    true,
    "when FINANCE_SARAH_PAYMENTS_ENABLED=1, tool is allowlisted"
);
delete process.env.FINANCE_SARAH_PAYMENTS_ENABLED;

const portal = readFileSync(join(ROOT, "js/portal/modules/finance.js"), "utf8");
assert.match(portal, /PAYMENTS_UI_DISABLED = true/);

console.log("✓ Payment Sarah tools implemented behind env gate");
console.log("✓ Portal payments UI still disabled (default)");
console.log("✓ Enable only after FINANCE_PAYMENT_REMEDIATION sign-off");
console.log("\nFINANCE_SARAH_F4_READINESS_PASS");
