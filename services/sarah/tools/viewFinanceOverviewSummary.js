import { listFinanceTransactionsPageForAccess } from "../../finance/financeTransactionService.js";
import { listFinanceInvoicesPageForAccess } from "../../finance/financeInvoiceService.js";
import { scanTenantCollectionPages } from "../../finance/financeTenantScan.js";
import {
    buildFinanceOverviewSummary,
    normaliseOverviewPeriodInput,
    resolvePreviousOverviewPeriod,
    compareMovementPeriods,
    FINANCE_SARAH_READ_LIMITATIONS,
} from "../../finance/financeOverviewSummary.js";
import {
    filterPostedTransactionsForOverview,
    groupMovementByCurrency,
    resolveOverviewPeriod,
} from "../../../js/portal/financeOverviewCalculations.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

export function createViewFinanceOverviewSummaryTool({
    listTransactionsPage = listFinanceTransactionsPageForAccess,
    listInvoicesPage = listFinanceInvoicesPageForAccess,
    now = () => Date.now(),
} = {}) {
    return {
        name: "viewFinanceOverviewSummary",
        description:
            "Read-only Finance Overview for this tenant: posted income/expense movement for a reporting period, plus current receivable/payable balances by currency. Uses the same rules as the Finance Overview workspace. Always check dataCoverage.complete before treating totals as full-company figures.",
        parameters: {
            type: "object",
            properties: {
                periodPreset: {
                    type: "string",
                    enum: ["30d", "90d", "365d", "all", "custom"],
                    description: "Reporting period for transaction movement (default 90d).",
                },
                customStart: { type: "string", description: "YYYY-MM-DD when periodPreset is custom." },
                customEnd: { type: "string", description: "YYYY-MM-DD when periodPreset is custom." },
                comparePreviousPeriod: {
                    type: "boolean",
                    description: "When true, include net movement comparison vs the immediately preceding period of equal length.",
                },
            },
            additionalProperties: false,
        },
        requiredPermissions: ["canViewFinance"],
        async execute(ctx, args = {}) {
            const access = financeReadAccessFromCtx(ctx);
            const companyId = ctx.companyId;
            const nowMs = now();

            const [txScan, invScan] = await Promise.all([
                scanTenantCollectionPages(
                    (cid, opts) => listTransactionsPage(cid, access, opts),
                    companyId
                ),
                scanTenantCollectionPages((cid, opts) => listInvoicesPage(cid, access, opts), companyId),
            ]);

            const mergedCoverage = {
                transactions: txScan.dataCoverage,
                invoices: invScan.dataCoverage,
                complete: txScan.dataCoverage.complete && invScan.dataCoverage.complete,
                totalsScope:
                    txScan.dataCoverage.complete && invScan.dataCoverage.complete
                        ? "full_tenant_scan"
                        : "bounded_scan",
            };

            const period = normaliseOverviewPeriodInput({
                preset: args.periodPreset,
                customStart: args.customStart,
                customEnd: args.customEnd,
            });

            const summary = buildFinanceOverviewSummary({
                transactions: txScan.items,
                invoices: invScan.items,
                period,
                nowMs,
                dataCoverage: mergedCoverage,
            });

            if (!summary.ok) {
                return {
                    success: false,
                    message: summary.error,
                    data: { period: summary.period },
                    completionType: "guidance",
                    limitations: FINANCE_SARAH_READ_LIMITATIONS,
                };
            }

            let periodComparison = null;
            if (args.comparePreviousPeriod === true) {
                const periodResolved = resolveOverviewPeriod(period, nowMs);
                const previous = resolvePreviousOverviewPeriod(periodResolved, nowMs);
                if (previous) {
                    const currentScoped = filterPostedTransactionsForOverview(txScan.items, periodResolved);
                    const previousScoped = filterPostedTransactionsForOverview(txScan.items, previous);
                    periodComparison = compareMovementPeriods(
                        groupMovementByCurrency(currentScoped),
                        groupMovementByCurrency(previousScoped)
                    );
                }
            }

            const periodLabel = summary.period.label;
            const coverageNote = mergedCoverage.complete
                ? "Totals use all Finance transactions and invoices loaded for this tenant (within scan limits)."
                : "Totals may be incomplete — dataCoverage.complete is false; do not present as full-company figures without saying so.";

            return {
                message: `Finance overview for ${periodLabel}: ${summary.stats.postedCount} posted transaction(s) in period, ${summary.stats.recvCount} open receivable invoice(s), ${summary.stats.payCount} open payable invoice(s). ${coverageNote}`,
                data: {
                    ...summary,
                    periodComparison,
                },
                completionType: "read_only",
                limitations: summary.limitations,
            };
        },
    };
}

export default createViewFinanceOverviewSummaryTool();
