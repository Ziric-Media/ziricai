/**
 * B-MC-4c — Shared finance analytics helpers for tenant metrics and time-series.
 * Finance enquiries = CRM records whose Sarah lead stage includes FINANCE.
 * Does not infer finance interest from income/budget alone.
 */

/** @param {object|null|undefined} record */
export function resolveSarahLeadStage(record) {
    return String(record?.sarahLeadStage || record?.salesContext?.leadStage || "").toUpperCase();
}

/** @param {string} stage */
export function isFinanceSarahStage(stage) {
    return stage.includes("FINANCE");
}

/** @param {object|null|undefined} record */
export function isFinanceCrmRecord(record) {
    return isFinanceSarahStage(resolveSarahLeadStage(record));
}

/** @param {object|null|undefined} record */
export function financeRecordKey(record) {
    return String(record?.id || record?.phone || record?.customerId || "").trim();
}

/**
 * Unique finance-stage CRM records from leads and customers.
 * @param {object[]} leads
 * @param {object[]} customers
 */
export function collectFinanceEnquiryRecords(leads = [], customers = []) {
    const byKey = new Map();
    for (const record of [...leads, ...customers]) {
        if (!isFinanceCrmRecord(record)) continue;
        const key = financeRecordKey(record);
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, record);
    }
    return [...byKey.values()];
}

/** @param {object[]} leads @param {object[]} customers */
export function countFinanceEnquiries(leads = [], customers = []) {
    return collectFinanceEnquiryRecords(leads, customers).length;
}

/**
 * Best-effort activity timestamp for finance-stage bucketing.
 * Not a stage-transition history — see time-series meta notes.
 * @param {object|null|undefined} record
 */
export function financeRecordActivityTimestamp(record) {
    const candidates = [
        record?.salesContext?.updatedAt,
        record?.updatedAt,
        record?.lastActivityAt,
        record?.createdAt,
    ];
    for (const ts of candidates) {
        if (ts != null) return ts;
    }
    return null;
}

/**
 * Derived budget/income context from customer salesContext.
 * Informational only — not counted as finance enquiries.
 * @param {object[]} customers
 */
export function extractFinanceContextSnapshot(customers = []) {
    const rows = [];
    for (const customer of customers) {
        const ctx = customer?.salesContext;
        if (!ctx) continue;
        const hasSignal =
            ctx.incomeDisplay ||
            ctx.income != null ||
            ctx.budgetDisplay ||
            ctx.confirmedPurchaseBudgetDisplay ||
            ctx.estimatedPurchaseBudgetDisplay ||
            ctx.purchaseBudgetDisplay ||
            ctx.budgetOpen === true;
        if (!hasSignal) continue;
        rows.push({
            customerId: financeRecordKey(customer),
            name: customer.name || customer.customerName || null,
            leadStage: resolveSarahLeadStage(customer) || null,
            incomeDisplay: ctx.incomeDisplay || (ctx.income != null ? `R${ctx.income}` : null),
            budgetDisplay:
                ctx.confirmedPurchaseBudgetDisplay ||
                ctx.budgetDisplay ||
                ctx.purchaseBudgetDisplay ||
                ctx.estimatedPurchaseBudgetDisplay ||
                (ctx.budgetOpen ? "open / not confirmed" : null),
            updatedAt: ctx.updatedAt || customer.updatedAt || null,
        });
    }
    return rows;
}
