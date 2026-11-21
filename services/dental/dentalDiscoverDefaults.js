/**
 * Apply default Discover products to any dental-clinic tenant.
 */
import { isDentalPracticeCompany } from "./dentalIndustryPreset.js";
import {
    buildDentalPracticeDiscoverProducts,
    dentalProductsCatalogIsCurrent,
    DENTAL_PRODUCTS_CATALOG_VERSION,
} from "./dentalPracticeProducts.js";
import { getCompany } from "../tenants/companyService.js";
import {
    getBusinessDirectoryEntry,
    hydrateBusinessDirectory,
    saveBusinessDirectoryEntry,
} from "../users/businessDirectoryService.js";

/**
 * Merge orthodontic product catalog into the directory entry when missing or stale.
 * @param {string} companyId
 * @param {object} [profilePatch] — optional display fields to preserve (Smile More pilot, etc.)
 */
export async function ensureDentalPracticeDiscoverProducts(companyId, profilePatch = {}) {
    const company = await getCompany(companyId);
    if (!isDentalPracticeCompany(companyId, company)) {
        return { skipped: true, reason: "not_dental" };
    }

    await hydrateBusinessDirectory({ force: false });
    const existing = getBusinessDirectoryEntry(companyId) || { companyId, discoverability: "public" };
    const products = buildDentalPracticeDiscoverProducts();

    if (dentalProductsCatalogIsCurrent(existing.products) && existing.dentalProductsCatalogVersion === DENTAL_PRODUCTS_CATALOG_VERSION) {
        return { updated: false };
    }

    await saveBusinessDirectoryEntry(companyId, {
        ...existing,
        ...profilePatch,
        companyId,
        discoverability: existing.discoverability || "public",
        products,
        dentalProductsCatalogVersion: DENTAL_PRODUCTS_CATALOG_VERSION,
        tags: Array.from(
            new Set([...(existing.tags || []), "dentist", "dental", "orthodontics", "aligners", "braces"])
        ),
    });
    return { updated: true };
}