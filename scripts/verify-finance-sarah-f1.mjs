#!/usr/bin/env node
/** F-Sarah 1 — Finance Sarah UI + read-only Sarah integration (static). */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSarahTools, ALL_TOOLS } from "../services/sarah/tools/index.js";
import { buildFinanceSarahPageContext } from "../js/portal/financeSarahContext.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-finance-sarah-f1\n");

for (const rel of [
    "js/portal/financeSarahContext.js",
    "app/js/portal/financeSarahContext.js",
    "js/portal/financeSarahPanel.js",
    "app/js/portal/financeSarahPanel.js",
]) {
    assert.ok(existsSync(join(ROOT, rel)), `missing mirror: ${rel}`);
}

const financeMod = read("js/portal/modules/finance.js");
assert.match(financeMod, /renderFinanceSarahPageShell/);
assert.match(financeMod, /initFinanceSarah/);
assert.match(financeMod, /syncFinanceSarahAfterPaint/);
assert.match(financeMod, /workspace === 'sarah'/);
assert.match(financeMod, /PAYMENTS_UI_DISABLED = false/);
assert.match(financeMod, /financePaymentUi\.js/);

const nav = read("js/portal/financeWorkspaceNav.js");
assert.match(nav, /id: 'sarah'/);

const panel = read("js/portal/financeSarahPanel.js");
assert.match(panel, /portal-sarah-page/);
assert.match(panel, /mode: 'page'/);

const sarahUi = read("js/portal/sarah/sarah-ui.js");
assert.match(sarahUi, /persistenceScope/);
assert.match(sarahUi, /financeSarahSession/);

const ctxHint = read("services/sarah/sarahContext.js");
assert.match(ctxHint, /F-Sarah 1/);

const ctx = buildFinanceSarahPageContext({
    workspace: "overview",
    subTab: "",
    overviewPeriod: { preset: "90d", customStart: "", customEnd: "" },
});
assert.equal(ctx.module, "finance");
assert.equal(ctx.financeWorkspace, "overview");
assert.ok(ctx.financeOverviewPeriod?.label);

const ctxIncome = buildFinanceSarahPageContext({ workspace: "income", subTab: "quotations" });
assert.equal(ctxIncome.financeSubTab, "quotations");
assert.equal(ctxIncome.financeOverviewPeriod, undefined);

initSarahTools();
const financeReadTools = ALL_TOOLS.filter((t) => /^viewFinance|^viewOutstanding|^viewInvoice/.test(t.name)).map(
    (t) => t.name
);
assert.ok(financeReadTools.includes("viewFinanceOverviewSummary"), "F1 overview read tool registered");
assert.ok(financeReadTools.length >= 4, "F1 finance read tools registered");
const financeWriteTools = ALL_TOOLS.filter((t) => /^createFinance|^updateFinance|^voidFinance|^recordFinance/.test(t.name));
assert.equal(financeWriteTools.length, 0, "no finance write tools registered");

const css = read("css/company-portal.css");
assert.match(css, /\.fin-panel-card--sarah/);
assert.match(css, /\.fin-sarah-page/);

console.log("✓ Finance Sarah workspace in left nav");
console.log("✓ Full-page Sarah layout in Finance module");
console.log("✓ Separate finance Sarah session keys");
console.log("✓ Finance pageContext builder");
console.log("✓ Server context hint (read-only boundary)");
console.log("✓ Finance Sarah read tools registered; no write tools");

console.log("\nFINANCE_SARAH_F1_PASS");
