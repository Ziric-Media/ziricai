/**
 * Seed synthetic Finance acceptance tenant into memory storage only.
 */
import {
    FINANCE_ACCEPTANCE_TENANT_ID,
    FINANCE_ACCEPTANCE_UIDS,
    isFinanceAcceptanceRuntimeActive,
} from "../auth/financeAcceptanceMode.js";

let seeded = false;

export async function seedFinanceAcceptanceTenantIfNeeded() {
    if (!isFinanceAcceptanceRuntimeActive()) return { seeded: false, reason: "mode_inactive" };
    if (seeded) return { seeded: true, reason: "already" };

    // Loopback acceptance uses signed mock tokens — no Firestore user docs required.
    seeded = true;
    return { seeded: true, companyId: FINANCE_ACCEPTANCE_TENANT_ID, reason: "memory_mock_auth" };
}

/** Synthetic ledger rows for browser acceptance (memory tenant only). */
export async function seedFinanceAcceptanceDemoLedger() {
    if (!isFinanceAcceptanceRuntimeActive()) {
        throw Object.assign(new Error("Acceptance mode inactive"), { status: 503 });
    }
    await seedFinanceAcceptanceTenantIfNeeded();
    const { createFinanceTransactionForAccess } = await import("./financeTransactionService.js");
    const { createFinanceInvoiceForAccess } = await import("./financeInvoiceService.js");
    const access = { role: "owner", uid: FINANCE_ACCEPTANCE_UIDS.owner };
    const companyId = FINANCE_ACCEPTANCE_TENANT_ID;

    const txs = [
        {
            recordType: "income",
            amount: 1000,
            currency: "ZAR",
            occurredAt: "2026-10-10T10:00:00.000Z",
            category: "sales",
            description: "Acceptance ZAR income",
        },
        {
            recordType: "income",
            amount: 200,
            currency: "USD",
            occurredAt: "2026-10-11T10:00:00.000Z",
            category: "sales",
            description: "Acceptance USD income",
        },
        {
            recordType: "expense",
            amount: 50,
            currency: "ZAR",
            occurredAt: "2026-10-12T10:00:00.000Z",
            category: "ops",
            description: "Acceptance ZAR expense",
        },
    ];
    for (const body of txs) {
        await createFinanceTransactionForAccess(companyId, access, body);
    }

    await createFinanceInvoiceForAccess(companyId, access, {
        invoiceKind: "receivable",
        counterpartyName: "Acceptance Customer",
        currency: "ZAR",
        status: "sent",
        issueDate: "2026-10-01",
        dueDate: "2026-10-31",
        lineItems: [{ description: "Service", quantity: 1, unitAmount: 500 }],
    });

    return { ok: true, companyId };
}
