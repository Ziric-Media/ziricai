import { listFinanceTransactionsPageForAccess } from "../../finance/financeTransactionService.js";
import { listFinanceInvoicesPageForAccess } from "../../finance/financeInvoiceService.js";
import { listFinanceJournalEntriesPageForAccess } from "../../finance/financeJournalService.js";
import { scanTenantCollectionPages } from "../../finance/financeTenantScan.js";
import { buildTrialBalanceProjection } from "../../finance/financeGlReadService.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

export function createViewFinanceTrialBalanceTool({
    listTransactionsPage = listFinanceTransactionsPageForAccess,
    listInvoicesPage = listFinanceInvoicesPageForAccess,
    listJournalEntriesPage = listFinanceJournalEntriesPageForAccess,
} = {}) {
    return {
        name: "viewFinanceTrialBalance",
        description:
            "Read-only trial balance projection from posted transactions and open receivable/payable invoices. Not statutory accounts; check dataCoverage before claiming completeness.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
        requiredPermissions: ["canViewFinance"],
        async execute(ctx) {
            const access = financeReadAccessFromCtx(ctx);
            const companyId = ctx.companyId;
            const [txScan, invScan, journalScan] = await Promise.all([
                scanTenantCollectionPages(
                    (id, opts) => listTransactionsPage(id, access, opts),
                    companyId
                ),
                scanTenantCollectionPages((id, opts) => listInvoicesPage(id, access, opts), companyId),
                scanTenantCollectionPages(
                    (id, opts) => listJournalEntriesPage(id, access, opts),
                    companyId
                ),
            ]);
            const posted = (txScan.items || []).filter((t) => t.status === "posted");
            const balance = buildTrialBalanceProjection(
                posted,
                invScan.items || [],
                journalScan.items || []
            );
            const coverage = {
                transactions: txScan.dataCoverage,
                invoices: invScan.dataCoverage,
                journals: journalScan.dataCoverage,
            };
            return {
                message: `Trial balance projection: ${balance.accountCount} account/currency line(s).`,
                data: { ...balance, dataCoverage: coverage },
                completionType: "read_only",
                limitations: balance.limitations,
            };
        },
    };
}

export default createViewFinanceTrialBalanceTool();
