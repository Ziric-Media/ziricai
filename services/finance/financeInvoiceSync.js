/**
 * Reconcile invoice amountPaidMinor and status from linked posted transactions.
 * Source of truth: sum of financeTransactions with matching invoiceId (not client totals).
 */
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { ServiceBase } from "../core/serviceBase.js";
import { addMinor } from "./money.js";
import { invoiceStatusFromPaidMinor } from "./financeInvoiceStatus.js";

class FinanceTransactionRepo extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_TRANSACTIONS);
    }
}

class FinanceInvoiceRepo extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_INVOICES);
    }
}

const txRepo = new FinanceTransactionRepo();
const invoiceRepo = new FinanceInvoiceRepo();

function invoiceStatusFromPaid(totalMinor, paidMinor) {
    return invoiceStatusFromPaidMinor(totalMinor, paidMinor);
}

/**
 * @param {string} companyId
 * @param {string} invoiceId
 */
export async function syncInvoicePaymentState(companyId, invoiceId) {
    const invoice = await invoiceRepo.get(companyId, invoiceId);
    if (!invoice || invoice.status === "void") return invoice;

    const linked = await txRepo.list(companyId, {
        max: 500,
        filters: { invoiceId },
    });
    let paidMinor = 0;
    for (const tx of linked) {
        if (tx.status !== "posted") continue;
        paidMinor = addMinor(paidMinor, Number(tx.amountMinor) || 0);
    }

    const totalMinor = Number(invoice.totalMinor) || 0;
    const nextStatus =
        invoice.status === "draft"
            ? invoice.status
            : invoiceStatusFromPaid(totalMinor, paidMinor);

    return invoiceRepo.update(companyId, invoiceId, {
        amountPaidMinor: paidMinor,
        status: nextStatus,
    });
}

export { assertInvoiceAcceptsPayment as assertInvoiceOpenForPayment } from "./financePaymentRules.js";
