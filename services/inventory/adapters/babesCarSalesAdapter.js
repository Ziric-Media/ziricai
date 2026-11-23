/**
 * Babes Car Sales — Motors Theme (STM) website inventory adapter.
 * Separate from Central Motors; same HTML patterns, different host and tenant scope.
 */
import {
    fetchAllListings,
    buildImportReport,
    tallyImportStats,
} from "./centralMotorsRtbAdapter.js";
import { BABES_CAR_SALES_COMPANY_ID } from "../../automotive/babesCarSalesBootstrap.js";

export const BABES_CAR_SALES_SITEMAP_URL = "https://babescarsales.co.za/listings-sitemap.xml";
export const BABES_CAR_SALES_DEFAULT_LOCATION = "Rustenburg, North West";
export const BABES_CAR_SALES_SOURCE = "babes-car-sales-website";
export const BABES_IMAGE_HOST = "babescarsales.co.za";

export const BABES_SITE_CONFIG = Object.freeze({
    imageHost: BABES_IMAGE_HOST,
    defaultLocation: BABES_CAR_SALES_DEFAULT_LOCATION,
});

export function babesUpsertOptions(verifiedAt = new Date().toISOString()) {
    return {
        source: BABES_CAR_SALES_SOURCE,
        stockPrefix: "BCS-WP-",
        verifiedAt,
        verificationNote: "BCS-03 website sitemap sync (listings on babescarsales.co.za at sync time)",
    };
}

/**
 * Fetch Babes listings from website sitemap (does not write to DB).
 */
export function fetchBabesWebsiteListings(options = {}) {
    const verifiedAt = options.verifiedAt || new Date().toISOString();
    return fetchAllListings({
        sitemapUrl: BABES_CAR_SALES_SITEMAP_URL,
        companyId: options.companyId || BABES_CAR_SALES_COMPANY_ID,
        delayMs: options.delayMs ?? 1200,
        limit: options.limit ?? null,
        onProgress: options.onProgress,
        site: BABES_SITE_CONFIG,
        upsertOptions: babesUpsertOptions(verifiedAt),
    });
}

export { buildImportReport, tallyImportStats, BABES_CAR_SALES_COMPANY_ID };