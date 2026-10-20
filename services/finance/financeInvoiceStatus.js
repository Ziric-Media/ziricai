/**
 * Server-owned invoice status — payment-derived states are never client-set.
 */
const CLIENT_SETTABLE_STATUSES = new Set(["draft", "sent"]);

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

export function assertClientInvoiceStatusPatch(existing, patchStatus) {
    if (patchStatus === undefined) return;
    if (!CLIENT_SETTABLE_STATUSES.has(patchStatus)) {
        throw httpError(
            "Payment status (partial, paid) is derived from ledger transactions",
            403,
            "FINANCE_INVOICE_STATUS_FORBIDDEN"
        );
    }
    const paidMinor = Number(existing?.amountPaidMinor) || 0;
    if (patchStatus === "draft" && paidMinor > 0) {
        throw httpError("Cannot revert to draft after payments are recorded", 403, "FINANCE_INVOICE_STATUS_FORBIDDEN");
    }
    if (patchStatus === "draft" && (existing?.status === "partial" || existing?.status === "paid")) {
        throw httpError("Cannot revert to draft after payments are recorded", 403, "FINANCE_INVOICE_STATUS_FORBIDDEN");
    }
}

export function invoiceStatusFromPaidMinor(totalMinor, paidMinor) {
    const total = Number(totalMinor) || 0;
    const paid = Number(paidMinor) || 0;
    if (paid <= 0) return "sent";
    if (paid >= total) return "paid";
    return "partial";
}
