/**
 * Append-only revenue ledger (R0) — in-process store; Firestore path reserved for R1.
 */
import { randomUUID } from "node:crypto";

/** @type {Map<string, object>} */
const events = new Map();

/**
 * @param {object} input
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 */
export async function appendLedgerEvent(input, options = {}) {
    const idempotencyKey = input.idempotencyKey || randomUUID();
    if (events.has(idempotencyKey)) {
        return { event: events.get(idempotencyKey), duplicate: true };
    }
    const event = {
        eventId: randomUUID(),
        eventType: input.eventType,
        revenueStreamId: input.revenueStreamId,
        skuId: input.skuId || null,
        productId: input.productId || null,
        accountType: input.accountType,
        accountId: input.accountId,
        grossAmountCents: Number(input.grossAmountCents) || 0,
        taxAmountCents: Number(input.taxAmountCents) || 0,
        feeAmountCents: Number(input.feeAmountCents) || 0,
        netAmountCents:
            input.netAmountCents != null
                ? Number(input.netAmountCents)
                : Number(input.grossAmountCents) || 0,
        currency: input.currency || "ZAR",
        paymentStatus: input.paymentStatus || "pending",
        idempotencyKey,
        metadata: input.metadata || {},
        dryRun: Boolean(options.dryRun),
        createdAt: new Date().toISOString(),
        recordedBy: input.recordedBy || "system",
    };
    if (!options.dryRun) {
        events.set(idempotencyKey, event);
    }
    return { event, duplicate: false };
}

/**
 * @param {object} [filter]
 */
export async function listLedgerEvents(filter = {}) {
    let items = [...events.values()];
    if (filter.revenueStreamId) {
        items = items.filter((e) => e.revenueStreamId === filter.revenueStreamId);
    }
    if (filter.accountType) {
        items = items.filter((e) => e.accountType === filter.accountType);
    }
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const limit = Math.min(Number(filter.limit) || 50, 200);
    return items.slice(0, limit);
}

export function clearLedgerForTests() {
    events.clear();
}
