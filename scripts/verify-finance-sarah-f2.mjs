#!/usr/bin/env node
/** F-Sarah 2 — confirm-gated Finance writes (static + policy). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSarahTools } from "../services/sarah/tools/index.js";
import {
    FINANCE_SARAH_ALLOWED_TOOL_NAMES,
    FINANCE_SARAH_PROHIBITED_TOOL_EXAMPLES,
    isToolAllowedInFinanceSarah,
} from "../services/sarah/financeSarahToolPolicy.js";
import { executeTool } from "../services/sarah/toolRegistry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("verify-finance-sarah-f2\n");

const writeTools = [
    "prepareFinanceInvoiceDraft",
    "prepareFinanceQuotationDraft",
    "prepareFinanceLedgerEntryDraft",
    "confirmFinanceWrite",
];
for (const name of writeTools) {
    assert.ok(FINANCE_SARAH_ALLOWED_TOOL_NAMES.has(name), `${name} on allowlist`);
}

for (const name of FINANCE_SARAH_PROHIBITED_TOOL_EXAMPLES) {
    assert.equal(isToolAllowedInFinanceSarah(name, { financeSarah: true }), false, `${name} denied`);
}

initSarahTools();
const financeCtx = { financeSarah: true, role: "owner", uid: "u1", companyId: "c1" };
const denied = await executeTool("generateQuote", financeCtx, { customerName: "X", items: [] });
assert.equal(denied.code, "FINANCE_SARAH_TOOL_DENIED");

const src = readFileSync(join(ROOT, "services/sarah/tools/financeSarahWriteTools.js"), "utf8");
assert.match(src, /userConfirmed !== true/, "confirm requires explicit userConfirmed");
assert.match(src, /createFinanceInvoiceForAccess/, "invoice confirm uses ForAccess service");
assert.match(src, /createFinanceTransactionForAccess/, "ledger confirm uses ForAccess service");

const program = readFileSync(join(ROOT, "docs/architecture/SF_CORE_01_FULL_PROGRAM.md"), "utf8");
assert.match(program, /F3/, "full program documents later phases");

console.log("✓ F2 prepare/confirm tools on Finance allowlist");
console.log("✓ Prohibited global tools still denied in Finance Sarah");
console.log("✓ confirmFinanceWrite gated on userConfirmed");
console.log("✓ Writes route through *ForAccess services");
console.log("\nFINANCE_SARAH_F2_PASS");
