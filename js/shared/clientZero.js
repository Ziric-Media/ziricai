/**
 * Client Zero (Company Zero) — ZiricAI as first operational tenant (CZ-001).
 * Keep in sync with services/clientZero/clientZero.js
 */

export const CLIENT_ZERO_COMPANY_IDS = Object.freeze(["ziricai", "company-zero"]);

export const CLIENT_ZERO_AI_EMPLOYEE_NAME = "Sarah";

const CLIENT_ZERO_SET = new Set(CLIENT_ZERO_COMPANY_IDS);

export function isClientZeroCompanyId(companyId) {
    return CLIENT_ZERO_SET.has(
        String(companyId || "")
            .trim()
            .toLowerCase()
    );
}
