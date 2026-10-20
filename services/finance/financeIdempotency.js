/**
 * Retry-safe financial writes — per-tenant idempotency records + in-process mutex chains.
 * Firestore: createIfAbsent on deterministic doc id. Memory: same + mutex for await interleaving.
 */
import { createHash } from "node:crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

export const FINANCE_IDEMPOTENCY_SCOPES = {
    INVOICE_PAYMENT: "invoice_payment",
};

class FinanceIdempotencyRepository extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_IDEMPOTENCY_KEYS);
    }
}

const idempotencyRepo = new FinanceIdempotencyRepository();

/** @type {Map<string, Promise<void>>} */
const mutexTail = new Map();

function mutexKey(parts) {
    return parts.filter(Boolean).join(":");
}

async function withMutex(key, fn) {
    const prev = mutexTail.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const chain = prev.then(() => gate);
    mutexTail.set(key, chain);
    await prev;
    try {
        return await fn();
    } finally {
        release();
        if (mutexTail.get(key) === chain) {
            mutexTail.delete(key);
        }
    }
}

export function idempotencyDocId(scope, clientKey) {
    const raw = `${scope}:${String(clientKey || "").trim()}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

/**
 * @param {string} companyId
 * @param {string} scope — FINANCE_IDEMPOTENCY_SCOPES value
 * @param {string} clientKey — caller-supplied idempotency key (unique per intent)
 * @param {() => Promise<{ resourceType: string, resourceId: string, meta?: object }>} execute
 */
export async function runFinanceIdempotentWrite(companyId, scope, clientKey, execute) {
    const key = String(clientKey || "").trim();
    if (!key) {
        throw httpError("idempotencyKey is required", 400, "FINANCE_IDEMPOTENCY_REQUIRED");
    }
    const docId = idempotencyDocId(scope, key);
    const lockKey = mutexKey(["finance-idem", companyId, scope, docId]);

    return withMutex(lockKey, async () => {
        const existing = await idempotencyRepo.get(companyId, docId);
        if (existing?.status === "completed" && existing.resourceId) {
            return { replay: true, record: existing };
        }
        if (existing?.status === "pending") {
            throw httpError("Idempotency key in progress — retry shortly", 409, "FINANCE_IDEMPOTENCY_IN_PROGRESS");
        }

        let reservation;
        try {
            reservation = await idempotencyRepo.createIfAbsent(companyId, docId, {
                scope,
                clientKey: key,
                status: "pending",
                resourceType: null,
                resourceId: null,
            });
        } catch (err) {
            if (err.code === "DOCUMENT_ALREADY_EXISTS") {
                const again = await idempotencyRepo.get(companyId, docId);
                if (again?.status === "completed" && again.resourceId) {
                    return { replay: true, record: again };
                }
                throw httpError("Idempotency conflict — retry with same key", 409, "FINANCE_IDEMPOTENCY_CONFLICT");
            }
            throw err;
        }

        try {
            const result = await execute();
            const completed = await idempotencyRepo.update(companyId, docId, {
                status: "completed",
                resourceType: result.resourceType,
                resourceId: result.resourceId,
                meta: result.meta || null,
            });
            return { replay: false, record: completed, result };
        } catch (err) {
            await idempotencyRepo.delete(companyId, docId);
            throw err;
        }
    });
}

/** Serialize payment attempts against one invoice (balance checks + ledger writes). */
export async function withInvoicePaymentLock(companyId, invoiceId, fn) {
    return withMutex(mutexKey(["finance-inv-pay", companyId, invoiceId]), fn);
}
