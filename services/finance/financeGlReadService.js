/**
 * SF-02 read path — trial balance projection from posted ledger + open invoices.
 * Does not replace double-entry journals or period close.
 */
import { isFinanceQuotation } from "../../js/portal/financeQuotation.js";
import {
    DEFAULT_FINANCE_COA,
    accountByCode,
    categoryToAccountCode,
} from "./financeCoaTemplate.js";

const OUTSTANDING_STATUSES = new Set(["sent", "partial"]);

export function listDefaultChartOfAccounts() {
    return DEFAULT_FINANCE_COA.map((a) => ({ ...a, source: "platform_default_v1" }));
}

/**
 * @param {object[]} transactions posted only
 * @param {object[]} invoices
 */
/**
 * @param {object[]} [journalEntries] posted manual journals (F3b)
 */
export function buildTrialBalanceProjection(transactions = [], invoices = [], journalEntries = []) {
    /** @type {Map<string, { code: string, name: string, type: string, debitMinor: number, creditMinor: number, currency: string }>} */
    const buckets = new Map();

    function bump(code, currency, debitMinor, creditMinor, nameOverride) {
        const key = `${code}:${currency}`;
        const meta = accountByCode(code) || { code, name: nameOverride || code, type: "expense" };
        const row = buckets.get(key) || {
            code,
            name: nameOverride || meta.name,
            type: meta.type,
            currency,
            debitMinor: 0,
            creditMinor: 0,
        };
        row.debitMinor += debitMinor;
        row.creditMinor += creditMinor;
        buckets.set(key, row);
    }

    for (const entry of journalEntries || []) {
        if (entry?.status !== "posted") continue;
        for (const line of entry.lines || []) {
            bump(
                line.accountCode,
                line.currency,
                Number(line.debitMinor) || 0,
                Number(line.creditMinor) || 0,
                line.accountName
            );
        }
    }

    for (const tx of transactions) {
        if (tx?.status !== "posted") continue;
        const currency = String(tx.currency || "ZAR").trim().toUpperCase();
        const amount = Number(tx.amountMinor) || 0;
        if (amount <= 0) continue;
        const recordType = tx.recordType || (tx.direction === "in" ? "income" : "expense");
        const acct = categoryToAccountCode(tx.category, recordType);
        if (recordType === "income") {
            bump(acct, currency, 0, amount);
            bump("1100", currency, amount, 0);
        } else {
            bump(acct, currency, amount, 0);
            bump("1100", currency, 0, amount);
        }
    }

    for (const inv of invoices) {
        if (isFinanceQuotation(inv)) continue;
        if (!OUTSTANDING_STATUSES.has(inv.status)) continue;
        const remaining = Math.max(0, Number(inv.totalMinor) - Number(inv.amountPaidMinor || 0));
        if (remaining <= 0) continue;
        const currency = String(inv.currency || "ZAR").trim().toUpperCase();
        if (inv.invoiceKind === "payable") {
            bump("2100", currency, 0, remaining);
        } else {
            bump("1200", currency, remaining, 0);
        }
    }

    const lines = [...buckets.values()].sort((a, b) =>
        a.code.localeCompare(b.code) || a.currency.localeCompare(b.currency)
    );

    return {
        lines,
        accountCount: lines.length,
        limitations: [
            "Derived projection from posted transactions, manual journal entries, and open invoice balances — not a statutory trial balance.",
            "No period close or bank reconciliation in this view.",
            "Cash account 1100 is a clearing placeholder, not verified bank balance.",
        ],
    };
}
