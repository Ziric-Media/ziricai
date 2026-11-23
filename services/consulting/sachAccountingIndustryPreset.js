/**
 * Sach Accounting — tenant detection for Company Sarah vertical.
 */
import { getCompany } from "../tenants/companyService.js";
import { SACH_CONSULT_COMPANY_ID } from "./sachAccountingConfig.js";

export function isSachAccountingTenant(companyId, companyRecord = null) {
    const id = String(companyId || "").trim();
    if (id === SACH_CONSULT_COMPANY_ID) return true;
    if (companyRecord?.settings?.accountingPractice?.enabled === true) return true;
    return false;
}

export async function shouldRunSachAccountingChat(companyId) {
    if (!companyId) return false;
    const company = await getCompany(companyId).catch(() => null);
    return isSachAccountingTenant(companyId, company);
}