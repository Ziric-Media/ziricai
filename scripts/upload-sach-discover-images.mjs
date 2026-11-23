#!/usr/bin/env node
/**
 * Upload local logo + cover JPEGs to Sach Discover listing and publish for Sarah App.
 * Usage: node scripts/upload-sach-discover-images.mjs <logoPath> <coverPath>
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { SACH_CONSULT_COMPANY_ID, SACH_DISPLAY_NAME } from "../services/consulting/sachConsultBootstrap.js";
import {
    createListingMediaUpload,
    completeListingMediaUpload,
    buildListingMediaPublicUrl,
} from "../services/network/networkListingMediaService.js";
import {
    saveListingDraft,
    publishListing,
    getListing,
    getPublicProfileBySnId,
} from "../services/network/networkProfileService.js";
import { hasAdminCredentials } from "../services/storage/storageAdapter.js";
import { getOrgEntityByCompanyId } from "../services/network/networkIdentityService.js";
import {
    getBusinessDirectoryEntry,
    hydrateBusinessDirectory,
    invalidateDirectoryEntity,
    saveBusinessDirectoryEntry,
} from "../services/users/businessDirectoryService.js";
import { getCompany, updateCompany } from "../services/tenants/companyService.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function uploadFile(companyId, filePath, fileName) {
    const buf = fs.readFileSync(filePath);
    if (buf.length > 5 * 1024 * 1024) throw new Error(`File too large: ${filePath}`);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const { uploadId, token } = await createListingMediaUpload(companyId, {
        mimeType,
        fileName: fileName || path.basename(filePath),
        byteLength: buf.length,
    });
    const done = await completeListingMediaUpload(companyId, uploadId, token, buf);
    return done.publicUrl || buildListingMediaPublicUrl(uploadId, token);
}

async function main() {
    const logoPath = process.argv[2];
    const coverPath = process.argv[3];
    if (!logoPath || !coverPath) {
        console.error("Usage: node scripts/upload-sach-discover-images.mjs <logo.jpg> <cover.jpg>");
        process.exit(1);
    }
    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS");
        process.exit(2);
    }
    await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

    const companyId = SACH_CONSULT_COMPANY_ID;
    const logoUrl = await uploadFile(companyId, path.resolve(logoPath), "sach-discover-logo.jpg");
    const coverUrl = await uploadFile(companyId, path.resolve(coverPath), "sach-discover-cover.jpg");

    const listing = await getListing(companyId);
    const prior = listing.profile || {};

    const company = await getCompany(companyId);
    const storedClass = company?.settings?.tenantClass || company?.settings?.general?.tenantClass;
    if (!storedClass || storedClass === "UNKNOWN") {
        await updateCompany(companyId, {
            settings: {
                ...(company?.settings || {}),
                tenantClass: "PRODUCTION CUSTOMER",
                productionCustomer: true,
            },
        });
    }

    await saveListingDraft(
        companyId,
        {
            displayName: prior.displayName || SACH_DISPLAY_NAME,
            industry: prior.industry || "Professional Services — Accounting & Tax",
            shortDescription:
                prior.shortDescription ||
                "Accounting, tax, payroll, and business advisory for SMEs in Rustenburg and across South Africa.",
            location: prior.location || "Rustenburg, North West",
            address: prior.address || "169 Joubert Street, Rustenburg, 0300",
            logoUrl,
            coverUrl,
            contact: {
                phone: prior.contact?.phone || "+27 14 592 1351",
                email: prior.contact?.email || "hello@sachaccounting.co.za",
                website: prior.contact?.website || "https://sachaccounting.co.za",
            },
            hours: prior.hours?.length ? prior.hours : [{ day: "Mon–Fri", time: "08:00–17:00" }],
        },
        "sach-discover-images"
    );

    await hydrateBusinessDirectory();
    const entry = await getBusinessDirectoryEntry(companyId);
    if (entry?.discoverability === "public") {
        const draft = { ...(entry.draft || {}) };
        delete draft.logoUrl;
        delete draft.coverUrl;
        await saveBusinessDirectoryEntry(companyId, {
            logoUrl,
            coverUrl,
            draft,
        });
        invalidateDirectoryEntity(companyId);
    }

    let published = listing.published;
    let snId = listing.snId;
    try {
        const pub = await publishListing(companyId, "sach-discover-images");
        published = true;
        snId = pub.snId || snId;
    } catch (err) {
        console.warn("[sach-discover-images] publish skipped:", err.message);
    }

    const entity = await getOrgEntityByCompanyId(companyId);
    snId = entity?.snId || snId;
    let publicProfile = null;
    if (snId) {
        publicProfile = await getPublicProfileBySnId(snId);
    }

    console.log(
        JSON.stringify(
            {
                companyId,
                logoUrl,
                coverUrl,
                published,
                snId,
                publicLogo: publicProfile?.logoUrl || null,
                publicCover: publicProfile?.coverUrl || null,
                sarahDiscover: `https://sarah.ziricai.com/#discover/${companyId}`,
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