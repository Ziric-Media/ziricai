/**
 * Finance Overview summary for Sarah read tools — same rules as portal Overview UI.
 */
import {
    resolveOverviewPeriod,
    filterPostedTransactionsForOverview,
    groupMovementByCurrency,
    groupOutstandingByCurrency,
    buildOverviewDashboardStats,
    OVERVIEW_PRESET_LABELS,
} from "../../js/portal/financeOverviewCalculations.js";
import { isFinanceQuotation } from "../../js/portal/financeQuotation.js";

export const FINANCE_SARAH_READ_LIMITATIONS = [
    "Posted transaction movement is not profit, solvency, or a verified bank balance.",
    "Outstanding receivable and payable figures are current invoice balances, not collected or paid cash.",
    "Net movement excludes void transactions and uses transaction date (occurredAt) for period filters.",
    "No balance sheet, statutory accounts, or audited statements unless a verified general ledger exists.",
];

/**
 * @param {{ preset?: string, customStart?: string, customEnd?: string }} periodInput
 */
export function normaliseOverviewPeriodInput(periodInput = {}) {
    const preset = periodInput.preset || periodInput.periodPreset || "90d";
    return {
        preset,
        customStart: periodInput.customStart || "",
        customEnd: periodInput.customEnd || "",
    };
}

function countQuotations(invoices) {
    return (invoices || []).filter((inv) => isFinanceQuotation(inv) && inv.status !== "void").length;
}

/**
 * @param {{ transactions: object[], invoices: object[], period?: object, nowMs?: number, dataCoverage?: object }} input
 */
export function buildFinanceOverviewSummary(input) {
    const period = normaliseOverviewPeriodInput(input.period);
    const nowMs = input.nowMs ?? Date.now();
    const periodResolved = resolveOverviewPeriod(period, nowMs);

    if (!periodResolved.valid) {
        return {
            ok: false,
            error: periodResolved.error,
            period: periodResolved,
        };
    }

    const scopedTxs = filterPostedTransactionsForOverview(input.transactions || [], periodResolved);
    const invoices = input.invoices || [];
    const receivables = groupOutstandingByCurrency(
        invoices.filter((i) => i.invoiceKind === "receivable"),
        "receivable"
    );
    const payables = groupOutstandingByCurrency(
        invoices.filter((i) => i.invoiceKind === "payable"),
        "payable"
    );
    const movement = groupMovementByCurrency(scopedTxs);
    const stats = buildOverviewDashboardStats(
        scopedTxs,
        receivables,
        payables,
        countQuotations(invoices)
    );

    return {
        ok: true,
        period: {
            preset: periodResolved.preset,
            label: periodResolved.label,
            basis: periodResolved.basis,
            calendarTimezone: periodResolved.calendarTimezone,
            startMs: periodResolved.startMs,
            endMs: periodResolved.endMs,
        },
        movement,
        receivables,
        payables,
        stats: {
            primaryCurrency: stats.primaryCurrency,
            incomeTxCount: stats.incomeTxCount,
            expenseTxCount: stats.expenseTxCount,
            postedCount: stats.postedCount,
            quotationCount: stats.quotationCount,
            recvCount: stats.recvCount,
            payCount: stats.payCount,
        },
        dataCoverage: input.dataCoverage || null,
        limitations: [...FINANCE_SARAH_READ_LIMITATIONS],
    };
}

/**
 * Previous period of equal length immediately before current resolved period.
 * @param {ReturnType<typeof resolveOverviewPeriod>} periodResolved
 * @param {number} nowMs
 */
export function resolvePreviousOverviewPeriod(periodResolved, nowMs = Date.now()) {
    if (!periodResolved?.valid) return null;
    if (periodResolved.preset === "all" || periodResolved.startMs == null || periodResolved.endMs == null) {
        return null;
    }
    const span = periodResolved.endMs - periodResolved.startMs;
    const endMs = periodResolved.startMs - 1;
    const startMs = endMs - span;
    return {
        valid: true,
        preset: "custom",
        label: "Previous period (equal length)",
        startMs,
        endMs,
        basis: periodResolved.basis,
        calendarTimezone: periodResolved.calendarTimezone,
    };
}

export function compareMovementPeriods(currentMovement, previousMovement) {
    const byCurrency = new Map();
    for (const row of currentMovement || []) {
        byCurrency.set(row.currency, { currency: row.currency, current: row, previous: null });
    }
    for (const row of previousMovement || []) {
        const entry = byCurrency.get(row.currency) || {
            currency: row.currency,
            current: null,
            previous: null,
        };
        entry.previous = row;
        byCurrency.set(row.currency, entry);
    }
    return [...byCurrency.values()]
        .sort((a, b) => a.currency.localeCompare(b.currency))
        .map(({ currency, current, previous }) => ({
            currency,
            currentNetMinor: current?.netMinor ?? 0,
            previousNetMinor: previous?.netMinor ?? 0,
            netChangeMinor: (current?.netMinor ?? 0) - (previous?.netMinor ?? 0),
            currentIncomeMinor: current?.incomeMinor ?? 0,
            previousIncomeMinor: previous?.incomeMinor ?? 0,
            currentExpenseMinor: current?.expenseMinor ?? 0,
            previousExpenseMinor: previous?.expenseMinor ?? 0,
        }));
}

export { OVERVIEW_PRESET_LABELS };
