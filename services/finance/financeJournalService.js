/**
 * Manual journal entries (SF-02 F3b) — balanced multi-line posts per currency.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    assertCanViewFinance,
    assertCanCreateFinance,
} from "../auth/financePermissionPolicy.js";
import { assertFinanceRecordTenant, requireFinanceActor } from "./financeAccess.js";
import { toMinorUnits, addMinor } from "./money.js";
import { getFinanceGlAccountForAccess, ensureDefaultFinanceGlAccounts } from "./financeGlAccountService.js";

class FinanceJournalService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_JOURNAL_ENTRIES);
    }
}

const journalService = new FinanceJournalService();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

/**
 * @param {Array<{ accountCode: string, currency: string, debitAmount?: number, creditAmount?: number, description?: string }>} lines
 * @param {string} companyId
 * @param {{ uid: string, role: string }} access
 */
export async function normalizeAndValidateJournalLines(companyId, access, lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
        throw httpError("At least two journal lines are required", 400, "FINANCE_JOURNAL_INVALID");
    }
    await ensureDefaultFinanceGlAccounts(companyId, access);
    const normalized = [];
    /** @type {Map<string, { debit: number, credit: number }>} */
    const totals = new Map();

    for (const raw of lines) {
        const accountCode = String(raw.accountCode || "").trim();
        const currency = String(raw.currency || "ZAR").trim().toUpperCase();
        const debitMajor = Number(raw.debitAmount ?? 0);
        const creditMajor = Number(raw.creditAmount ?? 0);
        if (!accountCode) {
            throw httpError("Each line requires accountCode", 400, "FINANCE_JOURNAL_INVALID");
        }
        const acct = await getFinanceGlAccountForAccess(companyId, accountCode, access);
        if (!acct || acct.active === false) {
            throw httpError(`Unknown or inactive account: ${accountCode}`, 400, "FINANCE_JOURNAL_ACCOUNT");
        }
        if (debitMajor <= 0 && creditMajor <= 0) {
            throw httpError("Each line needs debitAmount or creditAmount", 400, "FINANCE_JOURNAL_INVALID");
        }
        if (debitMajor > 0 && creditMajor > 0) {
            throw httpError("Line cannot have both debit and credit", 400, "FINANCE_JOURNAL_INVALID");
        }
        const debitMinor = debitMajor > 0 ? toMinorUnits(debitMajor, currency) : 0;
        const creditMinor = creditMajor > 0 ? toMinorUnits(creditMajor, currency) : 0;
        const key = currency;
        const bucket = totals.get(key) || { debit: 0, credit: 0 };
        bucket.debit = addMinor(bucket.debit, debitMinor);
        bucket.credit = addMinor(bucket.credit, creditMinor);
        totals.set(key, bucket);
        normalized.push({
            accountCode,
            accountName: acct.name,
            accountType: acct.type,
            currency,
            debitMinor,
            creditMinor,
            description: String(raw.description || "").trim(),
        });
    }

    for (const [currency, { debit, credit }] of totals) {
        if (debit !== credit) {
            throw httpError(
                `Journal not balanced for ${currency}: debits ${debit} vs credits ${credit} (minor units)`,
                400,
                "FINANCE_JOURNAL_UNBALANCED"
            );
        }
    }

    return normalized;
}

export async function createFinanceJournalEntryForAccess(companyId, access = {}, body = {}) {
    requireFinanceActor(access);
    assertCanCreateFinance(access.role);
    const entryDate = String(body.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
        throw httpError("entryDate must be YYYY-MM-DD", 400, "FINANCE_JOURNAL_INVALID");
    }
    const memo = String(body.memo || "").trim();
    const lines = await normalizeAndValidateJournalLines(companyId, access, body.lines || []);
    const currencies = [...new Set(lines.map((l) => l.currency))];

    return journalService.create(companyId, {
        entryDate,
        memo,
        status: "posted",
        source: body.source || "manual",
        lines,
        currencies,
        lineCount: lines.length,
        createdByUid: access.uid,
        updatedByUid: access.uid,
    });
}

export async function listFinanceJournalEntriesForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return journalService.list(companyId, {
        max: options.max ?? 100,
        orderByField: "entryDate",
        orderDirection: "desc",
    });
}

export async function listFinanceJournalEntriesPageForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return journalService.listPage(companyId, {
        max: options.max ?? 100,
        startAfterId: options.startAfterId ?? null,
        orderByField: "entryDate",
        orderDirection: "desc",
    });
}

export async function getFinanceJournalEntryForAccess(companyId, entryId, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await journalService.get(companyId, entryId);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}
