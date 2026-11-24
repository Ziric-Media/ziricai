#!/usr/bin/env node
/**
 * Upload Babes Discover logo + cover and sync public Sarah Network listing.
 * Usage: node scripts/upload-babes-discover-images.mjs <logo.jpg> <cover.jpg>
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { BABES_CAR_SALES_COMPANY_ID, BABES_DISPLAY_NAME, BABES_BUSINESS } from "../services/automotive/babesCarSalesBootstrap.js";
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
        console.error("Usage: node scripts/upload-babes-discover-images.mjs <logo.jpg> <cover.jpg>");
        process.exit(1);
    }
    if (!hasAdminCredentials()) {
        console.error("NO_ADMIN_CREDENTIALS");
        process.exit(2);
    }
    await import("../services/storage/storageAdapter.js").then((m) => m.getStorageAdapter());

    const companyId = BABES_CAR_SALES_COMPANY_ID;
    const logoUrl = await uploadFile(companyId, path.resolve(logoPath), "babes-discover-logo.jpg");
    const coverUrl = await uploadFile(companyId, path.resolve(coverPath), "babes-discover-cover.jpg");

    const listing = await getListing(companyId);
    const prior = listing.profile || {};
    const entry = await getBusinessDirectoryEntry(companyId);
    const merged = { ...entry, ...prior };

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
            displayName: merged.displayName || BABES_DISPLAY_NAME,
            industry: merged.industry || "Automotive — used & new vehicles",
            shortDescription:
                merged.shortDescription ||
                "Quality used and new vehicles in Rustenburg — finance, trade-ins, and nationwide delivery.",
            location: merged.location || "Rustenburg, North West",
            address: merged.address || BABES_BUSINESS.address,
            logoUrl,
            coverUrl,
            contact: {
                phone: merged.contact?.phone || `+27 ${BABES_BUSINESS.phone.replace(/\s/g, "")}`,
                email: merged.contact?.email || BABES_BUSINESS.email,
                website: merged.contact?.website || BABES_BUSINESS.website,
            },
            tags: merged.tags?.length ? merged.tags : ["automotive", "used-cars", "rustenburg", "dealership"],
        },
        "babes-discover-images"
    );

    await hydrateBusinessDirectory();
    const dir = await getBusinessDirectoryEntry(companyId);
    if (dir?.discoverability === "public") {
        const draft = { ...(dir.draft || {}) };
        delete draft.logoUrl;
        delete draft.coverUrl;
        await saveBusinessDirectoryEntry(companyId, { logoUrl, coverUrl, draft });
        invalidateDirectoryEntity(companyId);
    }

    let published = listing.published;
    let snId = listing.snId;
    try {
        await publishListing(companyId, "babes-discover-images");
        published = true;
    } catch (err) {
        console.warn("[babes-discover-images] publish skipped:", err.message);
    }

    const entity = await getOrgEntityByCompanyId(companyId);
    snId = entity?.snId || snId;
    const publicProfile = snId ? await getPublicProfileBySnId(snId) : null;

    console.log(
        JSON.stringify(
            {
                companyId,
                logoUrl,
                coverUrl,
                published,
                snId,
                publicLogo: publicProfile?.logoUrl || logoUrl,
                publicCover: publicProfile?.coverUrl || coverUrl,
                sarahDiscover: `https://sarah.ziricai.com/#discover/${companyId}`,
                portalDiscover: `https://app.ziricai.com/?company=${companyId}`,
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