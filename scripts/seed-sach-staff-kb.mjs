#!/usr/bin/env node
/** Upsert SACH-KB-TEAM knowledge for sach-consult (Railway + Firebase). */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { SACH_CONSULT_COMPANY_ID } from "../services/consulting/sachConsultBootstrap.js";
import { SACH_KB_DOCUMENTS } from "../services/storage/sachAccountingKnowledge.js";
import { saveKnowledgeDocument } from "../services/tenants/knowledgeService.js";
import { hasAdminCredentials } from "../services/storage/storageAdapter.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main() {
    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS");
        process.exit(2);
    }
    await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());
    const companyId = (process.env.SACH_COMPANY_ID || SACH_CONSULT_COMPANY_ID).trim();
    const team = SACH_KB_DOCUMENTS.find((d) => d.id === "sach-kb-team");
    if (!team) {
        console.error("sach-kb-team missing from SACH_KB_DOCUMENTS");
        process.exit(1);
    }
    await saveKnowledgeDocument({
        companyId,
        id: team.id,
        title: team.title,
        type: team.type,
        content: team.content,
        status: "active",
    });
    console.log(JSON.stringify({ companyId, knowledgeId: team.id, title: team.title }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});