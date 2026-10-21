#!/usr/bin/env node
/** Finance Phase 5 — portal shell wiring (static). */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessModule } from "../js/portal/permissions.js";
import { formatMoneyMinor } from "../js/portal/financeDisplay.js";
import {
    applyTransactionFilters,
    TX_FILTER_DEFAULTS,
} from "../js/portal/financeTransactionFilters.js";
import {
    resolveOverviewPeriod,
    filterPostedTransactionsForOverview,
    groupMovementByCurrency,
    groupOutstandingByCurrency,
} from "../js/portal/financeOverviewCalculations.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(ROOT, rel), "utf8");
}

console.log("verify-finance-portal-local\n");

for (const rel of [
    "js/portal/modules/finance.js",
    "app/js/portal/modules/finance.js",
    "js/portal/financeDisplay.js",
    "app/js/portal/financeDisplay.js",
    "js/portal/financeInvoiceUi.js",
    "app/js/portal/financeInvoiceUi.js",
    "js/portal/financeTransactionUi.js",
    "app/js/portal/financeTransactionUi.js",
    "js/portal/financeTransactionFilters.js",
    "app/js/portal/financeTransactionFilters.js",
    "js/portal/financeOverviewCalculations.js",
    "app/js/portal/financeOverviewCalculations.js",
    "js/portal/financeOverviewCalendar.js",
    "app/js/portal/financeOverviewCalendar.js",
    "js/portal/financeOverviewUi.js",
    "app/js/portal/financeOverviewUi.js",
    "js/portal/financeOverviewCharts.js",
    "app/js/portal/financeOverviewCharts.js",
    "js/portal/financeWorkspaceNav.js",
    "app/js/portal/financeWorkspaceNav.js",
    "js/portal/financeWorkspaceShells.js",
    "app/js/portal/financeWorkspaceShells.js",
    "js/portal/financeCreateModals.js",
    "app/js/portal/financeCreateModals.js",
    "js/portal/financeSarahContext.js",
    "app/js/portal/financeSarahContext.js",
    "js/portal/financeSarahPanel.js",
    "app/js/portal/financeSarahPanel.js",
]) {
    assert.ok(existsSync(join(ROOT, rel)), rel);
}
console.log("✓ finance module mirrored under js/ and app/js/");

const lazy = read("js/portal/core/lazyLoader.js");
assert.match(lazy, /'finance'/);
assert.match(lazy, /finance: 'renderFinance'/);
const shell = read("js/portal/core/appShell.js");
assert.match(shell, /id: 'finance'/);
const api = read("js/portal/api.js");
assert.match(api, /\/api\/portal\/finance\//);
assert.match(api, /fetchFinanceTransactions/);
console.log("✓ lazyLoader, appShell, api wired");

const mod = read("js/portal/modules/finance.js");
assert.match(mod, /PAYMENTS_UI_DISABLED\s*=\s*false/);
assert.match(mod, /data-fin-record-pay/);
assert.match(api, /recordFinanceInvoicePayment/);
assert.match(mod, /formatMoneyMinor/);
assert.match(mod, /canViewFinance/);
assert.match(mod, /initFinanceSarah/);
assert.match(mod, /financeSarahPanel/);
assert.match(mod, /financeInvoiceUi\.js/);
assert.match(mod, /openInvoiceEditor/);
assert.match(mod, /financeTransactionUi\.js/);
assert.match(mod, /renderTransactionFiltersBar/);
assert.match(mod, /data-fin-tx-open/);
assert.match(mod, /data-fin-void-tx-open/);
assert.doesNotMatch(mod, /promptNewInvoice/);
assert.doesNotMatch(mod, /data-fin-void-tx=/);
assert.doesNotMatch(mod, /window\.prompt\([^)]*voiding this transaction/i);
assert.match(read("js/portal/financePaymentUi.js"), /recordFinanceInvoicePayment/);
assert.match(mod, /financeOverviewUi\.js/);
assert.match(mod, /renderOverviewPanel/);
assert.match(mod, /overviewPeriod/);
assert.match(mod, /financeWorkspaceNav\.js/);
assert.match(mod, /data-fin-workspace/);
assert.match(mod, /fin\.workspace/);
assert.match(mod, /financeWorkspaceShells\.js/);
assert.match(mod, /renderCollectionsShell/);
assert.match(mod, /renderBankingShell/);
assert.match(mod, /renderReportsShell/);
assert.match(mod, /financeCreateModals\.js/);
assert.match(mod, /openCreateTxModal/);
assert.match(mod, /openCreateCatModal/);
assert.doesNotMatch(mod, /promptNewTransaction/);
assert.doesNotMatch(mod, /promptNewCategory/);
assert.doesNotMatch(mod, /window\.prompt\([^)]*Type: expense, income, or transfer/i);
assert.doesNotMatch(mod, /window\.prompt\([^)]*Category name/i);
assert.match(mod, /window\.prompt\([^)]*voiding this invoice/i);
assert.doesNotMatch(mod, /data-fin-range/);
assert.doesNotMatch(mod, /data-fin-tab/);
console.log("✓ UI uses server minor formatting; invoice + transaction + overview UI wired; invoice payments via recordFinanceInvoicePayment");

for (const rel of [
    "app/js/portal/financeOverviewUi.js",
    "app/js/portal/financeInvoiceUi.js",
    "app/js/portal/financeTransactionUi.js",
]) {
    const src = read(rel);
    assert.doesNotMatch(src, /from ['"]\.\.\/\.\.\/admin\/ui\.js['"]/);
    assert.match(src, /from ['"]\.\.\/admin\/ui\.js['"]/);
}
console.log("✓ app/js/portal finance UI imports ../admin/ui.js (not broken ../../ path)");

const overviewUi = read("js/portal/financeOverviewUi.js");
assert.match(overviewUi, /data-fin-overview-preset/);
assert.match(overviewUi, /not combined across currencies/i);
assert.match(overviewUi, /fin-four-views/);
assert.match(overviewUi, /Cash position/);
assert.match(overviewUi, /Financial alerts/);
assert.match(overviewUi, /Receivables/);
assert.match(overviewUi, /Payables/);
assert.match(overviewUi, /Financial movement/);
assert.match(overviewUi, /fin-overview-dashboard/);
assert.match(overviewUi, /fin-overview-kpi-row/);
assert.match(overviewUi, /fin-dash-charts--quad/);
assert.match(overviewUi, /finChartCurrencyBar/);
assert.match(overviewUi, /finChartTrendLine/);
assert.match(overviewUi, /finChartNetByCurrency/);
assert.match(overviewUi, /data-fin-action="new-quotation"/);
assert.match(overviewUi, /Expenses/);
console.log("✓ overview dashboard, expenses panel, quotations create");

const quot = read("js/portal/financeQuotation.js");
assert.match(quot, /QUOTATION_NOTES_MARKER/);
console.log("✓ quotation marker helper present");

const invUi = read("js/portal/financeInvoiceUi.js");
assert.match(invUi, /data-fin-overlay="editor"/);
assert.match(invUi, /data-fin-overlay="detail"/);
assert.match(invUi, /previewClientInvoiceTotals/);
assert.match(invUi, /data-fin-detail-pay/);
console.log("✓ invoice editor modal, detail drawer, and record-payment action present");

const txUi = read("js/portal/financeTransactionUi.js");
assert.match(txUi, /data-fin-tx-filter/);
assert.match(txUi, /data-fin-overlay="tx-detail"/);
assert.match(txUi, /data-fin-overlay="void-tx"/);
assert.match(txUi, /data-fin-confirm-void-tx/);
assert.match(txUi, /Totals for filtered view \(posted transactions only\)/);
console.log("✓ transaction filters, drawer and void confirmation modal present");

const now = new Date().toISOString();
const filterSample = [
    { id: "1", recordType: "income", status: "posted", amountMinor: 100, occurredAt: now, category: "sales" },
    { id: "2", recordType: "expense", status: "void", amountMinor: 50, occurredAt: now, category: "ops" },
];
assert.equal(
    applyTransactionFilters(filterSample, { ...TX_FILTER_DEFAULTS, status: "posted" }).length,
    1
);
assert.equal(
    applyTransactionFilters(filterSample, { ...TX_FILTER_DEFAULTS, recordType: "expense" }).length,
    1
);
console.log("✓ applyTransactionFilters smoke");

const periodAnchor = Date.parse("2026-06-15T12:00:00.000Z");
const period90 = resolveOverviewPeriod({ preset: "90d" }, periodAnchor);
assert.equal(period90.valid, true);
const movementSample = [
    {
        status: "posted",
        recordType: "income",
        direction: "in",
        amountMinor: 1000,
        currency: "ZAR",
        occurredAt: "2026-06-10T10:00:00.000Z",
    },
    {
        status: "void",
        recordType: "expense",
        amountMinor: 500,
        currency: "ZAR",
        occurredAt: "2026-06-10T11:00:00.000Z",
    },
    {
        status: "posted",
        recordType: "expense",
        direction: "out",
        amountMinor: 200,
        currency: "USD",
        occurredAt: "2026-06-11T10:00:00.000Z",
    },
];
const scopedMovement = filterPostedTransactionsForOverview(movementSample, period90);
assert.equal(scopedMovement.length, 2);
const byCur = groupMovementByCurrency(scopedMovement);
assert.equal(byCur.length, 2);
assert.equal(byCur.find((r) => r.currency === "ZAR")?.incomeMinor, 1000);
assert.equal(byCur.find((r) => r.currency === "USD")?.expenseMinor, 200);
const invSample = [
    { invoiceKind: "receivable", status: "sent", currency: "ZAR", totalMinor: 5000, amountPaidMinor: 1000 },
    { invoiceKind: "payable", status: "sent", currency: "EUR", totalMinor: 3000, amountPaidMinor: 0 },
];
const recv = groupOutstandingByCurrency(invSample, "receivable");
assert.equal(recv[0].currency, "ZAR");
assert.equal(recv[0].totalMinor, 4000);
const invalidCustom = resolveOverviewPeriod({ preset: "custom", customStart: "2026-02-01", customEnd: "2026-01-01" });
assert.equal(invalidCustom.valid, false);
console.log("✓ overview posted-only, void exclusion, per-currency movement and invoice balances");

const portalCss = read("css/company-portal.css");
assert.match(portalCss, /data-page="finance"/);
assert.match(portalCss, /\.fin-workspace-nav/);
assert.match(portalCss, /\.fin-four-views/);
assert.match(portalCss, /\.fin-shell-workspace/);
assert.match(portalCss, /\.fin-report-grid/);
console.log("✓ Finance workspace nav + overview four-view + shell styles");

const wsNav = read("js/portal/financeWorkspaceNav.js");
assert.match(wsNav, /collections:/);
assert.match(wsNav, /banking:/);
assert.match(wsNav, /reports:/);
const shells = read("js/portal/financeWorkspaceShells.js");
assert.match(shells, /Interface preview · not connected/);
assert.match(shells, /Run report/);
assert.match(shells, /fin-report-card-facts/);
assert.match(shells, /fin-shell-banner-head/);
assert.match(portalCss, /\.fin-report-grid--catalog/);
assert.match(shells, /fin-report-grid--catalog/);
assert.doesNotMatch(shells, /fetchFinance/);
console.log("✓ U4–U7 shell workspaces (no finance API in shells)");

const createUi = read("js/portal/financeCreateModals.js");
assert.match(createUi, /data-fin-overlay="create-tx"/);
assert.match(createUi, /data-fin-overlay="create-cat"/);
assert.match(createUi, /createFinanceTransaction/);
assert.match(createUi, /createFinanceCategory/);
assert.doesNotMatch(createUi, /window\.prompt/);
console.log("✓ U8 create modals wired (no prompt for create flows)");

assert.equal(canAccessModule("owner", "finance"), true);
assert.equal(canAccessModule("sales", "finance"), false);
assert.equal(canAccessModule("viewer", "finance"), true);
console.log("✓ module access matches canViewFinance");

assert.match(formatMoneyMinor(10050, "ZAR"), /100\.50|100,50/);
console.log("✓ formatMoneyMinor smoke");

console.log("\nFINANCE_PORTAL_LOCAL_PASS");
