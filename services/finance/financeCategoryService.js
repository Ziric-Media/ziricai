/**
 * Finance categories — tenant chart (workspace finance, not subscription billing).
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    assertCanViewFinance,
    assertCanCreateFinance,
    assertCanUpdateFinance,
} from "../auth/financePermissionPolicy.js";
import { assertFinanceRecordTenant, requireFinanceActor } from "./financeAccess.js";

class FinanceCategoryService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.FINANCE_CATEGORIES);
    }
}

const categoryService = new FinanceCategoryService();

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

export async function listFinanceCategoriesForAccess(companyId, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    return categoryService.list(companyId, { max: 200, orderByField: "name", orderDirection: "asc" });
}

export async function getFinanceCategoryForAccess(companyId, categoryId, access = {}) {
    requireFinanceActor(access);
    assertCanViewFinance(access.role);
    const row = await categoryService.get(companyId, categoryId);
    if (!row) return null;
    assertFinanceRecordTenant(companyId, row);
    return row;
}

export async function createFinanceCategoryForAccess(companyId, access = {}, body = {}) {
    requireFinanceActor(access);
    assertCanCreateFinance(access.role);
    const name = String(body.name || "").trim();
    if (!name) {
        throw httpError("name is required", 400, "FINANCE_CATEGORY_INVALID");
    }
    const kind = body.kind || "both";
    if (!["expense", "income", "both"].includes(kind)) {
        throw httpError("Invalid kind", 400, "FINANCE_CATEGORY_INVALID");
    }
    return categoryService.create(companyId, {
        name,
        kind,
        archived: false,
        createdByUid: access.uid,
        updatedByUid: access.uid,
    });
}

export async function updateFinanceCategoryForAccess(companyId, categoryId, access = {}, patch = {}) {
    requireFinanceActor(access);
    assertCanUpdateFinance(access.role);
    const existing = await categoryService.get(companyId, categoryId);
    if (!existing) return null;
    assertFinanceRecordTenant(companyId, existing);
    const next = {};
    if (patch.name !== undefined) {
        const name = String(patch.name).trim();
        if (!name) throw httpError("name cannot be empty", 400, "FINANCE_CATEGORY_INVALID");
        next.name = name;
    }
    if (patch.kind !== undefined) {
        if (!["expense", "income", "both"].includes(patch.kind)) {
            throw httpError("Invalid kind", 400, "FINANCE_CATEGORY_INVALID");
        }
        next.kind = patch.kind;
    }
    if (patch.archived !== undefined) next.archived = Boolean(patch.archived);
    next.updatedByUid = access.uid;
    return categoryService.update(companyId, categoryId, next);
}

/** System/internal read — caller must enforce tenant scope. */
export async function getFinanceCategory(companyId, categoryId) {
    return categoryService.get(companyId, categoryId);
}
