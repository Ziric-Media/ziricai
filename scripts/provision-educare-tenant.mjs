#!/usr/bin/env node
/**
 * EDU-01 — provision Educare tenant (no pack-school-ai).
 *
 * Env: Firebase Admin + Firestore (same as provision-client-2-tenant.mjs)
 *   EDUCARE_OWNER_EMAIL (required)
 *   EDUCARE_OWNER_NAME (optional)
 *   EDUCARE_COMPANY_ID (default educare-christian-combined)
 *   EDUCARE_SKIP_IF_EXISTS=1
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { hasAdminCredentials, getStorageBackendName } from "../services/storage/storageAdapter.js";
import { provisionOperatorTenant } from "../services/platform/operatorTenantProvisionService.js";
import { getCompany } from "../services/tenants/companyService.js";
import { bootstrapEducareCompanyProfile } from "../services/education/educareTenantBootstrap.js";
import { EDUCARE_COMPANY_ID } from "../services/education/educareDefaults.js";
import { ensureOrgEntitySafe } from "../services/network/networkIdentityService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main() {
    const companyId = (process.env.EDUCARE_COMPANY_ID || EDUCARE_COMPANY_ID).trim();
    const ownerEmail = String(process.env.EDUCARE_OWNER_EMAIL || "").trim().toLowerCase();
    const ownerName = String(process.env.EDUCARE_OWNER_NAME || "Educare Administrator").trim();
    const skipIfExists = process.env.EDUCARE_SKIP_IF_EXISTS === "1";

    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS — configure Firebase Admin in .env");
        process.exit(2);
    }
    if (getStorageBackendName() !== "firestore") {
        console.warn("[educare] STORAGE_BACKEND is not firestore — set STORAGE_BACKEND=firestore for production provision");
    }
    if (!ownerEmail) {
        console.error("EDUCARE_OWNER_EMAIL is required");
        process.exit(2);
    }

    if (skipIfExists && (await getCompany(companyId))) {
        console.log(`EDUCARE_SKIP_IF_EXISTS: ${companyId} already exists — bootstrap only`);
        const boot = await bootstrapEducareCompanyProfile(companyId);
        await ensureOrgEntitySafe(companyId);
        console.log(JSON.stringify({ companyId, skippedProvision: true, boot }, null, 2));
        return;
    }

    const result = await provisionOperatorTenant({
        companyId,
        name: "Educare Christian Combined School",
        industry: "Education",
        ownerEmail,
        owner: ownerName,
        tenantClass: "PILOT",
        plan: "business",
        phone: "+27 14 592 2854",
        email: "info@educarechristianschool.co.za",
        website: "https://educarechristianschool.co.za",
        settings: {
            marketplace: { enabled: false },
            education: { requireVerifiedGuardians: true },
        },
    });

    const boot = await bootstrapEducareCompanyProfile(companyId);
    await ensureOrgEntitySafe(companyId);

    console.log(
        JSON.stringify(
            {
                gate: "EDU-01",
                companyId: result.companyId || companyId,
                ownerUid: result.ownerUid,
                temporaryPassword: result.temporaryPassword || null,
                boot,
                packSchoolAi: false,
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
