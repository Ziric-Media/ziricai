import { getFinanceInvoiceForAccess } from "../../finance/financeInvoiceService.js";
import { financeReadAccessFromCtx } from "./financeToolAccess.js";

function normaliseMinor(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.trunc(amount) : 0;
}

export function toInvoiceDetails(invoice, invoiceId) {
    if (!invoice) return null;

    const totalMinor = normaliseMinor(invoice.totalMinor);
    const amountPaidMinor = Math.max(0, normaliseMinor(invoice.amountPaidMinor));
    return {
        id: invoice.id || invoiceId,
        invoiceNumber: invoice.invoiceNumber || null,
        invoiceKind: invoice.invoiceKind || null,
        status: invoice.status || null,
        currency: typeof invoice.currency === "string" ? invoice.currency.trim().toUpperCase() : null,
        totalMinor,
        amountPaidMinor,
        remainingMinor: Math.max(0, totalMinor - amountPaidMinor),
        issueDate: invoice.issueDate || null,
        dueDate: invoice.dueDate || null,
    };
}

export function createViewInvoiceDetailsTool({ getInvoice = getFinanceInvoiceForAccess } = {}) {
    return {
        name: "viewInvoiceDetails",
        description:
            "Read-only details for one invoice in this authenticated company. Monetary values are integer minor units and are not an accounting statement for refunds, credit notes, or write-offs not represented by the current invoice model.",
        parameters: {
            type: "object",
            properties: {
                invoiceId: {
                    type: "string",
                    minLength: 1,
                    description: "The invoice identifier shown in this company's Finance workspace.",
                },
            },
            required: ["invoiceId"],
            additionalProperties: false,
        },
        requiredPermissions: ["canViewFinance"],
        async execute(ctx, args = {}) {
            const access = financeReadAccessFromCtx(ctx);
            const invoiceId = typeof args.invoiceId === "string" ? args.invoiceId.trim() : "";
            if (!invoiceId) {
                const error = new Error("invoiceId is required");
                error.code = "INVALID_INPUT";
                throw error;
            }

            const invoice = await getInvoice(ctx.companyId, invoiceId, access);
            const details = toInvoiceDetails(invoice, invoiceId);
            if (!details) {
                return {
                    message: "Invoice not found.",
                    data: { found: false, invoice: null },
                    completionType: "read_only",
                };
            }

            return {
                message: `Invoice ${details.invoiceNumber || details.id}: ${details.status || "unknown"} status, ${details.remainingMinor} minor unit(s) remaining in ${details.currency || "its recorded currency"}.`,
                data: { found: true, invoice: details },
                completionType: "read_only",
                limitations: [
                    "This detail view does not account for refunds, credit notes, or write-offs because the current invoice model does not represent them.",
                ],
            };
        },
    };
}

export default createViewInvoiceDetailsTool();
