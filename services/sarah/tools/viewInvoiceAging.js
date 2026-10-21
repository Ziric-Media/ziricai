import { listFinanceInvoicesPageForAccess } from "../../finance/financeInvoiceService.js";
import { scanTenantCollectionPages } from "../../finance/financeTenantScan.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

const OUTSTANDING_STATUSES = new Set(["sent", "partial"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(value) {
    if (typeof value !== "string") return null;
    const date = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function createCurrencyGroup(currency) {
    return {
        currency,
        invoiceCount: 0,
        outstandingMinor: 0,
        notYetDueMinor: 0,
        days1To30Minor: 0,
        days31To60Minor: 0,
        days61To90Minor: 0,
        over90DaysMinor: 0,
        undatedCount: 0,
        undatedMinor: 0,
    };
}

/**
 * Collections aging by days overdue. Invoices without a due date are retained
 * separately in `undated*`; they are not treated as current/not-yet-due.
 */
export function summariseInvoiceAging(invoices, { now = new Date() } = {}) {
    const today = now.toISOString().slice(0, 10);
    const todayMs = Date.parse(`${today}T00:00:00.000Z`);
    const groups = new Map();
    let invoiceCount = 0;
    let undatedCount = 0;

    for (const invoice of invoices || []) {
        if (invoice?.invoiceKind !== "receivable" || !OUTSTANDING_STATUSES.has(invoice.status)) continue;

        const remainingMinor = Math.max(0, Number(invoice.totalMinor) - Number(invoice.amountPaidMinor || 0));
        if (!Number.isFinite(remainingMinor) || remainingMinor <= 0) continue;

        const currency = typeof invoice.currency === "string" ? invoice.currency.trim().toUpperCase() : "";
        if (!currency) continue;

        const group = groups.get(currency) || createCurrencyGroup(currency);
        const dueDate = isoDate(invoice.dueDate);
        group.invoiceCount += 1;
        group.outstandingMinor += remainingMinor;

        if (!dueDate) {
            group.undatedCount += 1;
            group.undatedMinor += remainingMinor;
            undatedCount += 1;
        } else {
            const daysOverdue = Math.floor((todayMs - Date.parse(`${dueDate}T00:00:00.000Z`)) / DAY_MS);
            if (daysOverdue <= 0) group.notYetDueMinor += remainingMinor;
            else if (daysOverdue <= 30) group.days1To30Minor += remainingMinor;
            else if (daysOverdue <= 60) group.days31To60Minor += remainingMinor;
            else if (daysOverdue <= 90) group.days61To90Minor += remainingMinor;
            else group.over90DaysMinor += remainingMinor;
        }

        groups.set(currency, group);
        invoiceCount += 1;
    }

    return {
        currencies: [...groups.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
        invoiceCount,
        undatedCount,
        empty: invoiceCount === 0,
    };
}

export function createViewInvoiceAgingTool({
    listInvoicesPage = listFinanceInvoicesPageForAccess,
    now = () => new Date(),
} = {}) {
    return {
        name: "viewInvoiceAging",
        description:
            "Read-only receivables aging for this authenticated company, grouped by currency and days overdue. Invoices with no due date are reported separately as undated. This reflects the current invoice model and does not account for refunds, credit notes, or write-offs.",
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
            const summary = summariseInvoiceAging(scan.items, { now: now() });
            return {
                message: summary.empty
                    ? "There are no outstanding receivable invoices to age in the current invoice model."
                    : `${summary.invoiceCount} outstanding receivable invoice(s) across ${summary.currencies.length} currency group(s), with ${summary.undatedCount} invoice(s) missing a due date.`,
                data: { ...summary, dataCoverage: scan.dataCoverage },
                completionType: "read_only",
                limitations: [
                    "Invoices without a due date are reported as undated, not as not-yet-due.",
                    "This summary does not account for refunds, credit notes, or write-offs because the current invoice model does not represent them.",
                ],
            };
        },
    };
}

export default createViewInvoiceAgingTool();
