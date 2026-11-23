#!/usr/bin/env node
/**
 * BCS-04 — Babes sales conversation layer: CRM enquiry tool KB + Sarah playbooks.
 * Idempotent: re-runs bootstrap profile to upsert new knowledge documents.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { hasAdminCredentials } from "../services/storage/storageAdapter.js";
import {
    BABES_CAR_SALES_COMPANY_ID,
    bootstrapBabesCarSalesProfile,
} from "../services/automotive/babesCarSalesBootstrap.js";
import { listAiEmployees } from "../services/tenants/aiEmployeeService.js";
import { listKnowledgeDocuments } from "../services/tenants/knowledgeService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const BCS04_DOC_IDS = [
    "babes-kn-finance",
    "babes-kn-trade-in",
    "babes-kn-test-drive",
    "babes-kn-uat-demo",
];

async function main() {
    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS");
        process.exit(2);
    }

    const bootstrap = await bootstrapBabesCarSalesProfile(BABES_CAR_SALES_COMPANY_ID);
    const agents = await listAiEmployees(BABES_CAR_SALES_COMPANY_ID);
    const agent = agents.find((a) => a.isDefault) || agents[0];
    const kbId = agent?.knowledgeBaseId || `kb-${BABES_CAR_SALES_COMPANY_ID}`;
    const docs = await listKnowledgeDocuments(BABES_CAR_SALES_COMPANY_ID, { knowledgeBaseId: kbId });
    const present = BCS04_DOC_IDS.filter((id) => docs.some((d) => d.id === id));

    console.log(
        JSON.stringify(
            {
                gate: "BCS-04",
                companyId: BABES_CAR_SALES_COMPANY_ID,
                knowledgeUpserted: bootstrap.knowledgeUpserted,
                bcs04PlaybookDocsPresent: present,
                tools: ["searchInventory", "checkTestDriveAvailability", "bookTestDrive", "recordSalesEnquiry"],
                sarahApp: `https://sarah.ziricai.com/#discover/${BABES_CAR_SALES_COMPANY_ID}`,
            },
            null,
            2
        )
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});