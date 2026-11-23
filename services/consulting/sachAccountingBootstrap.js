/**
 * Sach Accounting — idempotent tenant bootstrap (extends existing sach-consult).
 */
import {
    bootstrapSachConsultProfile,
    SACH_CONSULT_COMPANY_ID,
    SACH_DISPLAY_NAME,
} from "./sachConsultBootstrap.js";
import { saveBusinessDirectoryEntry } from "../users/businessDirectoryService.js";
import { SACH_KB_DOCUMENTS } from "../storage/sachAccountingKnowledge.js";
import { saveKnowledgeDocument } from "../tenants/knowledgeService.js";
import { ensureSachAccountingTenantSettings } from "./sachAccountingServiceRequestService.js";
import { getCompany } from "../tenants/companyService.js";
import { upsertGlobalUserProfile, upsertOwnerMembership } from "../auth/authService.js";

/** Owner portal was sometimes labelled with the old company title — restore person name. */
async function syncSachOwnerPortalProfile(companyId) {
    const company = await getCompany(companyId);
    if (!company) return { skipped: true };
    const ownerUid = company.ownerUid || company.ownerId;
    if (!ownerUid) return { skipped: true, reason: "no owner uid" };
    const ownerName = String(company.ownerName || "Saul Chitate").trim();
    const email = company.ownerEmail || company.email || "hello@sachaccounting.co.za";
    await upsertGlobalUserProfile(ownerUid, {
        email,
        fullName: ownerName,
        name: ownerName,
        role: "owner",
        companyId,
        company: companyId,
        status: "active",
    });
    await upsertOwnerMembership(ownerUid, companyId, {
        email,
        fullName: ownerName,
        role: "owner",
        status: "active",
    });
    return { ownerUid, ownerName };
}

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
    await saveBusinessDirectoryEntry(companyId, {
        discoverability: "public",
        displayName: SACH_DISPLAY_NAME,
    });
    const ownerSync = await syncSachOwnerPortalProfile(companyId);
    return { ...base, ...settings, accountingKnowledgeSeeded: kbIds, displayName: SACH_DISPLAY_NAME, ownerSync };
}