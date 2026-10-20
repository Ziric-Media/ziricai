/**
 * Tenant Finance authorization — workspace ledger (not subscription billing).
 * Fail-closed; mirrors taskPermissionPolicy patterns (SEC-03/04).
 */
import { hasPermission, normalizeRole } from "./permissionsService.js";
import { isSuperAdminRole } from "./authService.js";

export const FINANCE_PERMISSION_KEYS = [
    "canViewFinance",
    "canCreateFinance",
    "canUpdateFinance",
    "canVoidFinance",
    "canExportFinance",
];

export const FINANCE_TRANSACTION_RECORD_TYPES = new Set(["expense", "income", "transfer"]);
export const FINANCE_TRANSACTION_DIRECTIONS = new Set(["in", "out"]);
export const FINANCE_TRANSACTION_STATUSES = new Set(["posted", "void"]);
export const FINANCE_INVOICE_KINDS = new Set(["receivable", "payable"]);
export const FINANCE_INVOICE_STATUSES = new Set(["draft", "sent", "partial", "paid", "void"]);

const TRANSACTION_CREATE_PROTECTED = new Set([
    "id",
    "companyId",
    "createdByUid",
    "updatedByUid",
    "createdAt",
    "updatedAt",
    "voidedByUid",
    "voidedAt",
    "voidReason",
    "direction",
    "amountMinor",
    "idempotencyKey",
]);

export const FINANCE_TRANSACTION_CLIENT_CREATABLE_KEYS = new Set([
    "recordType",
    "amount",
    "currency",
    "occurredAt",
    "category",
    "description",
    "paymentMethod",
    "reference",
    "contactId",
    "status",
]);

export const FINANCE_TRANSACTION_CLIENT_MUTABLE_KEYS = new Set([
    "recordType",
    "amount",
    "currency",
    "occurredAt",
    "category",
    "description",
    "paymentMethod",
    "reference",
    "contactId",
    "status",
    "voidReason",
]);

const TRANSACTION_PATCH_PROTECTED = new Set([
    ...TRANSACTION_CREATE_PROTECTED,
    "voidReason",
]);

const INVOICE_CREATE_PROTECTED = new Set([
    "id",
    "companyId",
    "createdByUid",
    "updatedByUid",
    "createdAt",
    "updatedAt",
    "subtotal",
    "total",
    "amountPaid",
    "subtotalMinor",
    "taxAmountMinor",
    "totalMinor",
    "amountPaidMinor",
    "voidedByUid",
    "voidedAt",
    "voidReason",
]);

export const FINANCE_INVOICE_CLIENT_CREATABLE_KEYS = new Set([
    "invoiceKind",
    "status",
    "invoiceNumber",
    "counterpartyName",
    "contactId",
    "issueDate",
    "dueDate",
    "currency",
    "lineItems",
    "taxAmount",
    "notes",
]);

export const FINANCE_INVOICE_CLIENT_MUTABLE_KEYS = new Set([
    "invoiceKind",
    "status",
    "invoiceNumber",
    "counterpartyName",
    "contactId",
    "issueDate",
    "dueDate",
    "currency",
    "lineItems",
    "taxAmount",
    "notes",
    "voidReason",
]);

const INVOICE_PATCH_PROTECTED = new Set([...INVOICE_CREATE_PROTECTED, "voidReason"]);

function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

export function assertFinanceTenantBoundary(bodyCompanyId, tenantCompanyId) {
    if (bodyCompanyId == null || bodyCompanyId === "") return;
    if (String(bodyCompanyId) !== String(tenantCompanyId)) {
        throw httpError("companyId must match tenant scope", 403, "FINANCE_CREATE_FORBIDDEN");
    }
}

function assertFinancePermission(role, permission) {
    if (isSuperAdminRole(role)) return;
    if (!hasPermission(role, permission)) {
        throw httpError(`Permission denied: ${permission} required`, 403, "PERMISSION_DENIED");
    }
}

export function assertCanViewFinance(role) {
    assertFinancePermission(role, "canViewFinance");
}

export function assertCanCreateFinance(role) {
    assertFinancePermission(role, "canCreateFinance");
}

export function assertCanUpdateFinance(role) {
    assertFinancePermission(role, "canUpdateFinance");
}

export function assertCanVoidFinance(role) {
    assertFinancePermission(role, "canVoidFinance");
}

export function assertCanExportFinance(role) {
    assertFinancePermission(role, "canExportFinance");
}

/** Hard deny — Finance v1 uses void, not delete. */
export function assertCanDeleteFinance(role) {
    if (isSuperAdminRole(role)) {
        throw httpError("Finance records cannot be deleted", 403, "FINANCE_DELETE_FORBIDDEN");
    }
    throw httpError("Finance records cannot be deleted", 403, "FINANCE_DELETE_FORBIDDEN");
}

function directionForRecordType(recordType) {
    if (recordType === "expense" || recordType === "transfer") return "out";
    if (recordType === "income") return "in";
    return null;
}

function sanitizeBody(body, creatableKeys, protectedKeys, invalidCode, forbiddenCode) {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        throw httpError("Request body must be an object", 400, invalidCode);
    }
    for (const key of Object.keys(body)) {
        if (protectedKeys.has(key)) {
            throw httpError(`Protected finance field cannot be set: ${key}`, 403, forbiddenCode);
        }
        if (!creatableKeys.has(key)) {
            throw httpError(`Unknown finance field: ${key}`, 400, `${invalidCode}_UNKNOWN_FIELD`);
        }
    }
    const out = {};
    for (const key of creatableKeys) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            out[key] = body[key];
        }
    }
    return out;
}

export function sanitizeFinanceTransactionCreateBody(body = {}) {
    return sanitizeBody(
        body,
        FINANCE_TRANSACTION_CLIENT_CREATABLE_KEYS,
        TRANSACTION_CREATE_PROTECTED,
        "FINANCE_TRANSACTION_CREATE_INVALID",
        "FINANCE_TRANSACTION_CREATE_FORBIDDEN"
    );
}

export function sanitizeFinanceTransactionUpdatePatch(patch = {}) {
    if (patch == null || typeof patch !== "object" || Array.isArray(patch)) {
        throw httpError("Transaction patch must be an object", 400, "FINANCE_TRANSACTION_PATCH_INVALID");
    }
    for (const key of Object.keys(patch)) {
        if (TRANSACTION_PATCH_PROTECTED.has(key)) {
            throw httpError(`Protected finance field cannot be patched: ${key}`, 403, "FINANCE_TRANSACTION_PATCH_FORBIDDEN");
        }
        if (!FINANCE_TRANSACTION_CLIENT_MUTABLE_KEYS.has(key)) {
            throw httpError(`Unknown finance patch field: ${key}`, 400, "FINANCE_TRANSACTION_PATCH_UNKNOWN_FIELD");
        }
    }
    const out = {};
    for (const key of FINANCE_TRANSACTION_CLIENT_MUTABLE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            out[key] = patch[key];
        }
    }
    return out;
}

export function validateFinanceTransactionCreateBody(role, tenantCompanyId, body = {}) {
    assertCanCreateFinance(role);
    assertFinanceTenantBoundary(body.companyId, tenantCompanyId);

    const recordType = body.recordType;
    if (!recordType || !FINANCE_TRANSACTION_RECORD_TYPES.has(recordType)) {
        throw httpError("Invalid or missing recordType", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw httpError("amount must be a positive number", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    if (!body.currency || typeof body.currency !== "string") {
        throw httpError("currency is required", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    if (!body.occurredAt) {
        throw httpError("occurredAt is required", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    if (!body.category || typeof body.category !== "string") {
        throw httpError("category is required", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    const status = body.status || "posted";
    if (status !== "posted") {
        throw httpError("New transactions must be created as posted", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    if (body.status === "void" || body.voidReason) {
        throw httpError("Use void flow to void records", 403, "FINANCE_TRANSACTION_CREATE_FORBIDDEN");
    }
    if (body.invoiceId != null && body.invoiceId !== "") {
        throw httpError(
            "Invoice payments must use the invoice payment API, not generic transaction create",
            403,
            "FINANCE_INVOICE_PAYMENT_FORBIDDEN"
        );
    }
    const dir = directionForRecordType(recordType);
    if (!dir) {
        throw httpError("Invalid recordType", 400, "FINANCE_TRANSACTION_CREATE_INVALID");
    }
    return { ...body, status, direction: dir };
}

export function assertCanUpdateFinanceTransaction(role, existing, patch = {}) {
    if (isSuperAdminRole(role)) return;
    assertCanViewFinance(role);
    assertCanUpdateFinance(role);
    if (!existing) {
        throw httpError("Transaction not found", 404, "FINANCE_TRANSACTION_NOT_FOUND");
    }
    if (existing.status === "void") {
        throw httpError("Void transactions cannot be modified", 403, "FINANCE_TRANSACTION_VOID_LOCKED");
    }
    if (patch.status === "void") {
        throw httpError("Use voidFinanceTransaction to void records", 403, "FINANCE_TRANSACTION_PATCH_FORBIDDEN");
    }
    if (patch.voidReason !== undefined) {
        throw httpError("voidReason is only valid when voiding", 403, "FINANCE_TRANSACTION_PATCH_FORBIDDEN");
    }
    if (patch.invoiceId !== undefined) {
        throw httpError("Invoice linkage is server-managed for payments", 403, "FINANCE_TRANSACTION_PATCH_FORBIDDEN");
    }
}

/**
 * Void patch: { status: 'void', voidReason } — server sets voidedByUid/voidedAt in service layer.
 */
export function validateFinanceTransactionVoidBody(role, existing, patch = {}) {
    assertCanVoidFinance(role);
    if (!existing) {
        throw httpError("Transaction not found", 404, "FINANCE_TRANSACTION_NOT_FOUND");
    }
    if (existing.status === "void") {
        throw httpError("Transaction is already void", 400, "FINANCE_TRANSACTION_VOID_INVALID");
    }
    if (patch.status !== "void") {
        throw httpError("Void requires status void", 400, "FINANCE_TRANSACTION_VOID_INVALID");
    }
    const reason = patch.voidReason;
    if (!reason || typeof reason !== "string" || !String(reason).trim()) {
        throw httpError("voidReason is required when voiding", 400, "FINANCE_TRANSACTION_VOID_INVALID");
    }
    const extraKeys = Object.keys(patch).filter((k) => k !== "status" && k !== "voidReason");
    if (extraKeys.length) {
        throw httpError("Void patch may only include status and voidReason", 403, "FINANCE_TRANSACTION_VOID_FORBIDDEN");
    }
}

export function sanitizeFinanceInvoiceCreateBody(body = {}) {
    return sanitizeBody(
        body,
        FINANCE_INVOICE_CLIENT_CREATABLE_KEYS,
        INVOICE_CREATE_PROTECTED,
        "FINANCE_INVOICE_CREATE_INVALID",
        "FINANCE_INVOICE_CREATE_FORBIDDEN"
    );
}

export function sanitizeFinanceInvoiceUpdatePatch(patch = {}) {
    if (patch == null || typeof patch !== "object" || Array.isArray(patch)) {
        throw httpError("Invoice patch must be an object", 400, "FINANCE_INVOICE_PATCH_INVALID");
    }
    for (const key of Object.keys(patch)) {
        if (INVOICE_PATCH_PROTECTED.has(key)) {
            throw httpError(`Protected finance field cannot be patched: ${key}`, 403, "FINANCE_INVOICE_PATCH_FORBIDDEN");
        }
        if (!FINANCE_INVOICE_CLIENT_MUTABLE_KEYS.has(key)) {
            throw httpError(`Unknown finance patch field: ${key}`, 400, "FINANCE_INVOICE_PATCH_UNKNOWN_FIELD");
        }
    }
    const out = {};
    for (const key of FINANCE_INVOICE_CLIENT_MUTABLE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            out[key] = patch[key];
        }
    }
    return out;
}

export function validateFinanceInvoiceCreateBody(role, tenantCompanyId, body = {}) {
    assertCanCreateFinance(role);
    assertFinanceTenantBoundary(body.companyId, tenantCompanyId);

    if (!body.invoiceKind || !FINANCE_INVOICE_KINDS.has(body.invoiceKind)) {
        throw httpError("Invalid or missing invoiceKind", 400, "FINANCE_INVOICE_CREATE_INVALID");
    }
    if (!body.counterpartyName || typeof body.counterpartyName !== "string") {
        throw httpError("counterpartyName is required", 400, "FINANCE_INVOICE_CREATE_INVALID");
    }
    if (!body.issueDate) {
        throw httpError("issueDate is required", 400, "FINANCE_INVOICE_CREATE_INVALID");
    }
    if (!body.currency || typeof body.currency !== "string") {
        throw httpError("currency is required", 400, "FINANCE_INVOICE_CREATE_INVALID");
    }
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
        throw httpError("lineItems must be a non-empty array", 400, "FINANCE_INVOICE_CREATE_INVALID");
    }
    const status = body.status || "draft";
    if (!FINANCE_INVOICE_STATUSES.has(status) || status === "void") {
        throw httpError("New invoices cannot be created as void", 400, "FINANCE_INVOICE_CREATE_INVALID");
    }
    if (body.amountPaid != null || body.total != null || body.subtotal != null) {
        throw httpError("Totals are server-computed", 403, "FINANCE_INVOICE_CREATE_FORBIDDEN");
    }
}

export function assertCanUpdateFinanceInvoice(role, existing, patch = {}) {
    if (isSuperAdminRole(role)) return;
    assertCanViewFinance(role);
    assertCanUpdateFinance(role);
    if (!existing) {
        throw httpError("Invoice not found", 404, "FINANCE_INVOICE_NOT_FOUND");
    }
    if (existing.status === "void") {
        throw httpError("Void invoices cannot be modified", 403, "FINANCE_INVOICE_VOID_LOCKED");
    }
    if (patch.status === "void") {
        throw httpError("Use voidFinanceInvoice to void records", 403, "FINANCE_INVOICE_PATCH_FORBIDDEN");
    }
    if (patch.status === "partial" || patch.status === "paid") {
        throw httpError(
            "Payment status is derived from ledger transactions",
            403,
            "FINANCE_INVOICE_STATUS_FORBIDDEN"
        );
    }
    if (patch.amountPaid !== undefined || patch.subtotal !== undefined || patch.total !== undefined) {
        throw httpError("Payment totals are server-managed", 403, "FINANCE_INVOICE_PATCH_FORBIDDEN");
    }
}

export function validateFinanceInvoiceVoidBody(role, existing, patch = {}) {
    assertCanVoidFinance(role);
    if (!existing) {
        throw httpError("Invoice not found", 404, "FINANCE_INVOICE_NOT_FOUND");
    }
    if (existing.status === "void") {
        throw httpError("Invoice is already void", 400, "FINANCE_INVOICE_VOID_INVALID");
    }
    if (patch.status !== "void") {
        throw httpError("Void requires status void", 400, "FINANCE_INVOICE_VOID_INVALID");
    }
    if (!patch.voidReason || !String(patch.voidReason).trim()) {
        throw httpError("voidReason is required when voiding", 400, "FINANCE_INVOICE_VOID_INVALID");
    }
}

/** Unknown roles resolve to viewer — must not gain finance write access. */
export function financePermissionsForRole(role) {
    const r = normalizeRole(role);
    const out = {};
    for (const key of FINANCE_PERMISSION_KEYS) {
        out[key] = hasPermission(r, key);
    }
    return out;
}
