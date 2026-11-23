#!/usr/bin/env node
/**
 * Provision Sach Consult tenant + Discover + Company Sarah KB.
 *
 * Env: Firebase Admin + STORAGE_BACKEND=firestore (see .env)
 *   SACH_OWNER_EMAIL (default hello@sachaccounting.co.za)
 *   SACH_OWNER_NAME (default Saul Chitate)
 *   SACH_COMPANY_ID (default sach-consult)
 *   SACH_SKIP_IF_EXISTS=1 — bootstrap + discover only if company exists
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { hasAdminCredentials, getStorageBackendName } from "../services/storage/storageAdapter.js";
import { provisionOperatorTenant } from "../services/platform/operatorTenantProvisionService.js";
import { getCompany } from "../services/tenants/companyService.js";
import {
    bootstrapSachConsultProfile,
    SACH_CONSULT_COMPANY_ID,
} from "../services/consulting/sachConsultBootstrap.js";
import { saveBusinessDirectoryEntry } from "../services/users/businessDirectoryService.js";
import { ensureOrgEntitySafe } from "../services/network/networkIdentityService.js";
import { portalUrlForCompany } from "../services/core/siteUrls.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main() {
    const companyId = (process.env.SACH_COMPANY_ID || SACH_CONSULT_COMPANY_ID).trim();
    const ownerEmail = String(process.env.SACH_OWNER_EMAIL || "hello@sachaccounting.co.za").trim().toLowerCase();
    const ownerName = String(process.env.SACH_OWNER_NAME || "Saul Chitate").trim();
    const skipIfExists = process.env.SACH_SKIP_IF_EXISTS === "1";

    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS — configure Firebase Admin in .env");
        process.exit(2);
    }
    if (getStorageBackendName() !== "firestore") {
        console.warn("[sach] STORAGE_BACKEND is not firestore — production expects firestore");
    }

    let ownerUid;
    let temporaryPassword = null;

    if (skipIfExists && (await getCompany(companyId))) {
        console.log(`SACH_SKIP_IF_EXISTS: ${companyId} already exists — bootstrap + discover`);
    } else {
        const result = await provisionOperatorTenant({
            companyId,
            name: "Sach Consult",
            industry: "Professional Services",
            ownerEmail,
            owner: ownerName,
            tenantClass: "PRODUCTION CUSTOMER",
            plan: "business",
            phone: "+27 14 592 1351",
            email: "hello@sachaccounting.co.za",
            website: "https://sachaccounting.co.za",
            agentName: "Sarah",
            agentRole: "client_support",
            agentRoleLabel: "Client Support",
            personality: "professional",
            settings: {
                marketplace: { enabled: true },
            },
        });
        ownerUid = result.owner?.uid;
        temporaryPassword = result.owner?.temporaryPassword;
        console.log(
            JSON.stringify(
                {
                    provisioned: true,
                    companyId: result.companyId,
                    ownerUid,
                    temporaryPassword,
                    passwordResetLink: result.owner?.passwordResetLink || null,
                    portalUrl: portalUrlForCompany(companyId),
                },
                null,
                2
            )
        );
    }

    const boot = await bootstrapSachConsultProfile(companyId);
    const directory = await saveBusinessDirectoryEntry(companyId, {
        discoverability: "public",
        displayName: "Sach Consult",
        industry: "Accounting & consulting",
        location: "Rustenburg, North West",
        shortDescription:
            "Accounting, tax, payroll, secretarial, and compliance advisory for SMEs — Rustenburg.",
        tags: ["accounting", "tax", "payroll", "sars", "rustenburg", "consulting"],
        address: "169 Joubert Street, Rustenburg, 0300",
        contact: {
            phone: "+27 14 592 1351",
            email: "hello@sachaccounting.co.za",
            website: "https://sachaccounting.co.za",
        },
        hours: [
            { label: "Mon–Fri", value: "08:00–17:00" },
        ],
        verified: false,
    });
    await ensureOrgEntitySafe(companyId);

    console.log(
        JSON.stringify(
            {
                gate: "SACH-PROVISION",
                companyId,
                boot,
                discover: { snId: directory.snId, discoverability: directory.discoverability },
                portalUrl: portalUrlForCompany(companyId),
                sarahDiscover: `https://sarah.ziricai.com/#discover/${companyId}`,
                ownerUid: ownerUid || null,
                temporaryPassword,
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});