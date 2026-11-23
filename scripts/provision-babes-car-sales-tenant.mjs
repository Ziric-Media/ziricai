#!/usr/bin/env node
/**
 * BCS-02 — Provision Babes Car Sales CC + automotive preset + Company Sarah bootstrap.
 *
 * Requires Firebase Admin + STORAGE_BACKEND=firestore (use: railway run node scripts/provision-babes-car-sales-tenant.mjs)
 *
 * Env:
 *   BABES_COMPANY_ID (default babes-car-sales-cc)
 *   BABES_OWNER_EMAIL (default babescarsales43@gmail.com)
 *   BABES_OWNER_NAME (default Michelle)
 *   BABES_SKIP_IF_EXISTS=1 — bootstrap only if company already exists
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { hasAdminCredentials, getStorageBackendName } from "../services/storage/storageAdapter.js";
import { provisionOperatorTenant } from "../services/platform/operatorTenantProvisionService.js";
import { getCompany, listAllCompaniesFromStorage } from "../services/tenants/companyService.js";
import {
    BABES_CAR_SALES_COMPANY_ID,
    BABES_DISPLAY_NAME,
    BABES_BUSINESS,
    bootstrapBabesCarSalesProfile,
} from "../services/automotive/babesCarSalesBootstrap.js";
import { isAutomotivePresetConfigured } from "../services/automotive/automotiveIndustryPreset.js";
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../services/inventory/adapters/centralMotorsRtbAdapter.js";
import { portalUrlForCompany } from "../services/core/siteUrls.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function matchesBabes(c) {
    const hay = JSON.stringify({
        id: c.id,
        name: c.name,
        email: c.email,
        website: c.website,
    }).toLowerCase();
    return /babes|babescarsales/.test(hay);
}

async function assertNoDuplicateTenant(targetId) {
    const all = await listAllCompaniesFromStorage();
    const dupes = all.filter(matchesBabes);
    const other = dupes.filter((c) => c.id !== targetId);
    if (other.length) {
        throw new Error(
            `Duplicate Babes-like tenants found: ${other.map((c) => c.id).join(", ")} — resolve before provisioning`
        );
    }
    if (dupes.length === 1 && dupes[0].id !== targetId) {
        throw new Error(`Existing Babes tenant is "${dupes[0].id}" not "${targetId}" — use that id or archive first`);
    }
}

async function assertCentralMotorsUntouched() {
    const cm = await getCompany(CENTRAL_MOTORS_RTB_COMPANY_ID);
    if (!cm) {
        console.warn("[babes] Central Motors RTB company not found — unexpected in production");
        return;
    }
    if (cm.industryPresetId !== "automotive-dealership") {
        throw new Error("Central Motors preset was altered — aborting");
    }
    console.log("[babes] Central Motors RTB unchanged (preset still automotive-dealership)");
}

async function main() {
    const companyId = (process.env.BABES_COMPANY_ID || BABES_CAR_SALES_COMPANY_ID).trim();
    const ownerEmail = String(process.env.BABES_OWNER_EMAIL || BABES_BUSINESS.email).trim().toLowerCase();
    const ownerName = String(process.env.BABES_OWNER_NAME || "Michelle").trim();
    const skipIfExists = process.env.BABES_SKIP_IF_EXISTS === "1";

    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS — configure Firebase Admin or use railway run");
        process.exit(2);
    }
    if (getStorageBackendName() !== "firestore") {
        console.warn("[babes] STORAGE_BACKEND is not firestore");
    }

    await assertNoDuplicateTenant(companyId);
    await assertCentralMotorsUntouched();

    const existing = await getCompany(companyId);
    if (existing && !skipIfExists) {
        console.log(JSON.stringify({ gate: "BCS-02", status: "already_exists", companyId }, null, 2));
        console.log("Re-run with BABES_SKIP_IF_EXISTS=1 to bootstrap only.");
        process.exit(0);
    }

    let ownerUid = null;
    let temporaryPassword = null;

    if (skipIfExists && existing) {
        console.log(`BABES_SKIP_IF_EXISTS: ${companyId} exists — bootstrap only`);
    } else if (!existing) {
        const result = await provisionOperatorTenant({
            companyId,
            name: BABES_DISPLAY_NAME,
            industry: "Automotive",
            ownerEmail,
            owner: ownerName,
            email: BABES_BUSINESS.email,
            phone: BABES_BUSINESS.phone,
            website: BABES_BUSINESS.website,
            tenantClass: "PRODUCTION CUSTOMER",
            plan: "business",
            agentName: BABES_DISPLAY_NAME.replace(" CC", "") + " Sarah",
            agentRole: "sales_consultant",
            agentRoleLabel: "Sales Consultant",
            personality: "sales_driven",
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
                    whatsapp: result.whatsapp,
                },
                null,
                2
            )
        );
    }

    const boot = await bootstrapBabesCarSalesProfile(companyId);
    const company = await getCompany(companyId);

    const isolation = {
        babesCompanyId: companyId,
        centralMotorsPreset: (await getCompany(CENTRAL_MOTORS_RTB_COMPANY_ID))?.industryPresetId,
        babesIsCentralMotors: companyId === CENTRAL_MOTORS_RTB_COMPANY_ID,
        automotivePresetActive: isAutomotivePresetConfigured(company),
    };

    console.log(
        JSON.stringify(
            {
                gate: "BCS-02",
                companyId,
                boot,
                isolation,
                portalUrl: portalUrlForCompany(companyId),
                ownerUid,
                temporaryPassword,
                inventoryNote: "No stock imported in BCS-02 — BCS-03 required for vehicle demo data",
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