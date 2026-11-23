/**
 * Sach Accounting — idempotent tenant bootstrap (extends existing sach-consult).
 */
import { bootstrapSachConsultProfile, SACH_CONSULT_COMPANY_ID } from "./sachConsultBootstrap.js";
import { SACH_KB_DOCUMENTS } from "../storage/sachAccountingKnowledge.js";
import { saveKnowledgeDocument } from "../tenants/knowledgeService.js";
import { ensureSachAccountingTenantSettings } from "./sachAccountingServiceRequestService.js";

export async function bootstrapSachAccountingPractice(companyId = SACH_CONSULT_COMPANY_ID) {
    const base = await bootstrapSachConsultProfile(companyId);
    const settings = await ensureSachAccountingTenantSettings(companyId);
    const kbIds = [];
    for (const doc of SACH_KB_DOCUMENTS) {
        const saved = await saveKnowledgeDocument({
            companyId,
            id: doc.id,
            title: doc.title,
            type: doc.type,
            content: doc.content,
            status: "active",
        });
        kbIds.push(saved.id || doc.id);
    }
    return { ...base, ...settings, accountingKnowledgeSeeded: kbIds };
}