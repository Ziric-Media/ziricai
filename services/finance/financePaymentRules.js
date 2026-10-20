/**
 * Invoice payment state transitions — server validation (v1, no overpayment).
 */
function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

export function remainingInvoiceBalanceMinor(invoice) {
    const totalMinor = Number(invoice?.totalMinor) || 0;
    const paidMinor = Number(invoice?.amountPaidMinor) || 0;
    return Math.max(0, totalMinor - paidMinor);
}

export function assertInvoiceAcceptsPayment(invoice) {
    if (!invoice) {
        throw httpError("Invoice not found", 404, "FINANCE_INVOICE_NOT_FOUND");
    }
    if (invoice.status === "void") {
        throw httpError("Cannot pay a void invoice", 403, "FINANCE_INVOICE_VOID_LOCKED");
    }
    if (invoice.status === "draft") {
        throw httpError("Invoice must be sent before recording payment", 400, "FINANCE_INVOICE_INVALID");
    }
    if (invoice.status === "paid") {
        throw httpError("Invoice is already fully paid", 400, "FINANCE_INVOICE_ALREADY_PAID");
    }
    if (remainingInvoiceBalanceMinor(invoice) <= 0) {
        throw httpError("Invoice has no remaining balance", 400, "FINANCE_INVOICE_ALREADY_PAID");
    }
}

export function assertPaymentAmountWithinBalance(invoice, amountMinor) {
    const remaining = remainingInvoiceBalanceMinor(invoice);
    const amt = Number(amountMinor);
    if (!Number.isSafeInteger(amt) || amt <= 0) {
        throw httpError("amount must be positive", 400, "FINANCE_AMOUNT_INVALID");
    }
    if (amt > remaining) {
        throw httpError(
            `Payment exceeds remaining invoice balance (${remaining} minor units)`,
            400,
            "FINANCE_INVOICE_OVERPAYMENT"
        );
    }
}
