/**
 * Tenant chart of accounts (SF-02 F3b).
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    assertCanViewFinance,
    assertCanCreateFinance,
} from "../auth/financePermissionPolicy.js";
import { assertFinanceRecordTenant, requireFinanceActor } from "./financeAccess.js";
import { DEFAULT_FINANCE_COA } from "./financeCoaTemplate.js";

class FinanceGlAccountService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_GL_ACCOUNTS);
    }
}

const glAccountService = new FinanceGlAccountService();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

/**
 * Seed platform default accounts when tenant has none (idempotent per account code).
 */
export async function ensureDefaultFinanceGlAccounts(companyId, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const existing = await glAccountService.list(companyId, { max: 5 });
    if (Array.isArray(existing) && existing.length > 0) return existing;
    const created = [];
    for (const acct of DEFAULT_FINANCE_COA) {
        const row = await glAccountService.createIfAbsent(companyId, acct.code, {
            code: acct.code,
            name: acct.name,
            type: acct.type,
            active: true,
            systemDefault: true,
            createdByUid: access.uid,
            updatedByUid: access.uid,
        });
        created.push(row);
    }
    return created;
}

export async function listFinanceGlAccountsForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    await ensureDefaultFinanceGlAccounts(companyId, access);
    return glAccountService.list(companyId, {
        max: options.max ?? 200,
        orderByField: "code",
        orderDirection: "asc",
    });
}

export async function listFinanceGlAccountsPageForAccess(companyId, access = {}, options = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    await ensureDefaultFinanceGlAccounts(companyId, access);
    return glAccountService.listPage(companyId, {
        max: options.max ?? 200,
        startAfterId: options.startAfterId ?? null,
        orderByField: "code",
        orderDirection: "asc",
    });
}

export async function createFinanceGlAccountForAccess(companyId, access = {}, body = {}) {
    requireFinanceActor(access);
    assertCanCreateFinance(access.role);
    const code = String(body.code || "").trim();
    const name = String(body.name || "").trim();
    const type = String(body.type || "").trim();
    if (!/^\d{4}$/.test(code)) {
        throw httpError("code must be four digits", 400, "FINANCE_GL_ACCOUNT_INVALID");
    }
    if (!name) throw httpError("name is required", 400, "FINANCE_GL_ACCOUNT_INVALID");
    if (!["asset", "liability", "equity", "income", "expense"].includes(type)) {
        throw httpError("Invalid account type", 400, "FINANCE_GL_ACCOUNT_INVALID");
    }
    const existing = await glAccountService.get(companyId, code);
    if (existing) {
        throw httpError("Account code already exists", 409, "FINANCE_GL_ACCOUNT_EXISTS");
    }
    return glAccountService.create(companyId, {
        code,
        name,
        type,
        active: true,
        systemDefault: false,
        createdByUid: access.uid,
        updatedByUid: access.uid,
    }, code);
}

export async function getFinanceGlAccountForAccess(companyId, accountCode, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await glAccountService.get(companyId, accountCode);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}
