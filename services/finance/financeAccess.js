/**
 * Tenant boundary checks for Finance services.
 */
function httpError(message, status, code) {
    return Object.assign(new Error(message), { status, code });
}

export function requireFinanceActor(access = {}) {
    if (!access?.uid) {
        throw httpError("Authentication required", 401, "UNAUTHORIZED");
    }
    return access;
}

export function assertFinanceRecordTenant(companyId, record) {
    if (!record) return;
    if (String(record.companyId) !== String(companyId)) {
        throw httpError("Finance record not found", 404, "FINANCE_NOT_FOUND");
    }
}
