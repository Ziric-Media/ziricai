import { listFinanceTransactionsPageForAccess } from "../../finance/financeTransactionService.js";
import { scanTenantCollectionPages } from "../../finance/financeTenantScan.js";
import {
    filterPostedTransactionsForOverview,
    resolveOverviewPeriod,
} from "../../../js/portal/financeOverviewCalculations.js";
import { normaliseOverviewPeriodInput } from "../../finance/financeOverviewSummary.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

const MAX_TRANSACTION_HISTORY = 20;
const RECORD_TYPES = new Set(["income", "expense", "transfer"]);

function normaliseMinor(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.trunc(amount) : 0;
}

function createCurrencySummary(currency) {
    return {
        currency,
        postedCount: 0,
        voidCount: 0,
        incomeMinor: 0,
        expenseMinor: 0,
        transferMinor: 0,
    };
}

function safeTransaction(transaction) {
    return {
        id: transaction.id || null,
        recordType: transaction.recordType || null,
        direction: transaction.direction || null,
        amountMinor: normaliseMinor(transaction.amountMinor),
        currency: typeof transaction.currency === "string" ? transaction.currency.trim().toUpperCase() : null,
        occurredAt: transaction.occurredAt || null,
        category: transaction.category || null,
        description: transaction.description || "",
        invoiceId: transaction.invoiceId || null,
        status: transaction.status || null,
    };
}

/**
 * Summarise ledger rows. Void records remain visible as a count but never contribute to financial totals.
 */
export function summariseFinanceTransactions(transactions, { historyLimit = MAX_TRANSACTION_HISTORY } = {}) {
    const groups = new Map();
    const history = [];
    let postedCount = 0;
    let voidCount = 0;

    for (const transaction of transactions || []) {
        const currency = typeof transaction?.currency === "string" ? transaction.currency.trim().toUpperCase() : "";
        if (!currency) continue;
        const group = groups.get(currency) || createCurrencySummary(currency);
        const status = transaction.status || "posted";

        if (status === "void") {
            group.voidCount += 1;
            voidCount += 1;
        } else if (status === "posted" && RECORD_TYPES.has(transaction.recordType)) {
            const amountMinor = Math.max(0, normaliseMinor(transaction.amountMinor));
            group.postedCount += 1;
            postedCount += 1;
            if (transaction.recordType === "income") group.incomeMinor += amountMinor;
            if (transaction.recordType === "expense") group.expenseMinor += amountMinor;
            if (transaction.recordType === "transfer") group.transferMinor += amountMinor;
        } else {
            continue;
        }

        if (history.length < historyLimit) history.push(safeTransaction(transaction));
        groups.set(currency, group);
    }

    return {
        currencies: [...groups.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
        transactionCount: postedCount + voidCount,
        postedCount,
        voidCount,
        transactions: history,
        historyTruncated: postedCount + voidCount > history.length,
    };
}

export function createViewFinanceTransactionsTool({
    listTransactionsPage = listFinanceTransactionsPageForAccess,
} = {}) {
    return {
        name: "viewFinanceTransactions",
        description:
            "Read-only posted ledger transactions (income, expense, transfer) for an optional period — use for **cash collected / receipts** (income rows), not unpaid invoices. Totals by currency; voids excluded. Check dataCoverage before full-company claims.",
        parameters: {
            type: "object",
            properties: {
                periodPreset: {
                    type: "string",
                    enum: ["30d", "90d", "365d", "all", "custom"],
                    description: "Filter movement by transaction date (default all).",
                },
                customStart: { type: "string" },
                customEnd: { type: "string" },
            },
            additionalProperties: false,
        },
        requiredPermissions: ["canViewFinance"],
        async execute(ctx, args = {}) {
            const access = financeReadAccessFromCtx(ctx);
            const scan = await scanTenantCollectionPages(
                (companyId, opts) => listTransactionsPage(companyId, access, opts),
                ctx.companyId
            );

            const periodInput = normaliseOverviewPeriodInput({
                preset: args.periodPreset ?? "all",
                customStart: args.customStart,
                customEnd: args.customEnd,
            });
            const periodResolved = resolveOverviewPeriod(periodInput);
            const scoped =
                periodResolved.valid && periodInput.preset !== "all"
                    ? filterPostedTransactionsForOverview(scan.items, periodResolved)
                    : filterPostedTransactionsForOverview(scan.items, {
                          ...periodResolved,
                          valid: true,
                          startMs: null,
                          endMs: null,
                      });

            const summary = summariseFinanceTransactions(scoped);
            const dataCoverage = {
                ...scan.dataCoverage,
                period: periodResolved.valid
                    ? {
                          preset: periodResolved.preset,
                          label: periodResolved.label,
                          basis: periodResolved.basis,
                      }
                    : { error: periodResolved.error },
                includedInTotalsCount: scoped.length,
                historyLimit: MAX_TRANSACTION_HISTORY,
                totalsScope: scan.dataCoverage.complete ? "full_tenant_scan" : "bounded_scan",
            };

            return {
                message: summary.transactionCount
                    ? `${summary.postedCount} posted transaction(s) in scope across ${summary.currencies.length} currency group(s), with ${summary.voidCount} void transaction(s) excluded from totals.`
                    : "There are no posted or void Finance transactions in the selected scope.",
                data: { ...summary, dataCoverage },
                completionType: "read_only",
                limitations: [
                    "Totals reflect scanned tenant transactions only; see dataCoverage.complete.",
                    "Movement is not profit, bank balance, or a balance sheet.",
                ],
            };
        },
    };
}

export { MAX_TRANSACTION_HISTORY };
export default createViewFinanceTransactionsTool();
