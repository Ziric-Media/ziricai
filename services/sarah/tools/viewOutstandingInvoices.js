import { listFinanceInvoicesPageForAccess } from "../../finance/financeInvoiceService.js";
import { scanTenantCollectionPages } from "../../finance/financeTenantScan.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

const OUTSTANDING_STATUSES = new Set(["sent", "partial"]);

function isoDate(value) {
    if (typeof value !== "string") return null;
    const date = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Summarise the current invoice model's outstanding receivables. Amounts remain
 * in minor units and are deliberately never combined across currencies.
 */
export function summariseOutstandingInvoices(invoices, { now = new Date() } = {}) {
    const today = now.toISOString().slice(0, 10);
    const groups = new Map();
    let invoiceCount = 0;
    let overdueCount = 0;

    for (const invoice of invoices || []) {
        if (invoice?.invoiceKind !== "receivable" || !OUTSTANDING_STATUSES.has(invoice.status)) continue;

        const remainingMinor = Math.max(0, Number(invoice.totalMinor) - Number(invoice.amountPaidMinor || 0));
        if (!Number.isFinite(remainingMinor) || remainingMinor <= 0) continue;

        const currency = typeof invoice.currency === "string" ? invoice.currency.trim().toUpperCase() : "";
        if (!currency) continue;

        const dueDate = isoDate(invoice.dueDate);
        const overdue = Boolean(dueDate && dueDate < today);
        const group = groups.get(currency) || {
            currency,
            invoiceCount: 0,
            outstandingMinor: 0,
            overdueCount: 0,
            overdueMinor: 0,
            earliestDueDate: null,
        };

        group.invoiceCount += 1;
        group.outstandingMinor += remainingMinor;
        if (dueDate && (!group.earliestDueDate || dueDate < group.earliestDueDate)) {
            group.earliestDueDate = dueDate;
        }
        if (overdue) {
            group.overdueCount += 1;
            group.overdueMinor += remainingMinor;
            overdueCount += 1;
        }

        groups.set(currency, group);
        invoiceCount += 1;
    }

    return {
        currencies: [...groups.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
        invoiceCount,
        overdueCount,
        empty: invoiceCount === 0,
    };
}

export function createViewOutstandingInvoicesTool({
    listInvoicesPage = listFinanceInvoicesPageForAccess,
    now = () => new Date(),
} = {}) {
    return {
        name: "viewOutstandingInvoices",
        description:
            "Read-only outstanding receivable invoice summary for this authenticated company. Totals remain separated by currency. This reflects the current invoice model and does not account for refunds, credit notes, or write-offs.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
        requiredPermissions: ["canViewFinance"],
        async execute(ctx) {
            const access = financeReadAccessFromCtx(ctx);
            const scan = await scanTenantCollectionPages(
                (companyId, opts) => listInvoicesPage(companyId, access, opts),
                ctx.companyId
            );
            const summary = summariseOutstandingInvoices(scan.items, { now: now() });

            return {
                message: summary.empty
                    ? "There are no outstanding receivable invoices in the current invoice model."
                    : `${summary.invoiceCount} outstanding receivable invoice(s) across ${summary.currencies.length} currency group(s), including ${summary.overdueCount} overdue invoice(s).`,
                data: { ...summary, dataCoverage: scan.dataCoverage },
                completionType: "read_only",
                limitations: [
                    "This summary does not account for refunds, credit notes, or write-offs because the current invoice model does not represent them.",
                ],
            };
        },
    };
}

export default createViewOutstandingInvoicesTool();
