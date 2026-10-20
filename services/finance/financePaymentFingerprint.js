import { createHash } from "node:crypto";

/**
 * Canonical fingerprint for invoice payment idempotency (same key must match exactly).
 */
export function buildPaymentRequestFingerprint({ invoiceId, currency, amountMinor }) {
    const payload = JSON.stringify({
        invoiceId: String(invoiceId),
        currency: String(currency || "").trim().toUpperCase(),
        amountMinor: Number(amountMinor),
    });
    return createHash("sha256").update(payload).digest("hex");
}

export function assertMatchingPaymentFingerprint(stored, expected) {
    if (!stored || stored !== expected) {
        throw Object.assign(
            new Error("Idempotency key reused with a different payment request"),
            { status: 409, code: "FINANCE_IDEMPOTENCY_FINGERPRINT_MISMATCH" }
        );
    }
}
