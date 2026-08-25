/**
 * Central Motors Rustenburg website inventory adapter.
 * Fetches listings sitemap + HTML pages and normalizes to upsertVehicle() records.
 */
import axios from "axios";

export const CENTRAL_MOTORS_RTB_COMPANY_ID = "central-motors-rtb";
export const CENTRAL_MOTORS_SITEMAP_URL = "https://centralmotorsrtb.co.za/listings-sitemap.xml";
export const CENTRAL_MOTORS_DEFAULT_LOCATION = "Rustenburg, North West";
export const CENTRAL_MOTORS_SOURCE = "central-motors-website";

const MULTI_WORD_MAKES = [
    "Alfa Romeo",
    "Aston Martin",
    "Land Rover",
    "Mercedes-Benz",
    "Mercedes Benz",
    "Volkswagen",
];

const USER_AGENT =
    "ZiricAI-InventoryImporter/1.0 (+https://ziricai.com; dealer-authorized sync)";

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrice(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
}

function parseMileage(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
}

function normalizeImageUrl(url) {
    return String(url || "")
        .trim()
        .replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, "$1");
}

function dedupeImages(urls) {
    const seen = new Set();
    const out = [];
    for (const url of urls) {
        const normalized = normalizeImageUrl(url);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

function parseTableField(html, label) {
    const re = new RegExp(
        `<td class="t-label">\\s*${escapeRegex(label)}\\s*</td>\\s*<td class="t-value[^"]*">\\s*([^<]+)`,
        "i"
    );
    const match = html.match(re);
    return match ? match[1].trim() : null;
}

export function extractWordPressPostId(html) {
    if (!html) return null;
    const patterns = [
        /postid-(\d+)/i,
        /name="vehicle_id"[^>]*value="(\d+)"/i,
        /value="(\d+)"[^>]*name="vehicle_id"/i,
        /shortlink' href='[^']*\?p=(\d+)'/i,
        /_wpcf7_container_post" value="(\d+)"/i,
        /data-id="(\d+)"[^>]*data-action="(?:add|remove)"/i,
    ];
    for (const re of patterns) {
        const match = html.match(re);
        if (match?.[1]) return match[1];
    }
    return null;
}

export function parseTitleFields(title) {
    const raw = String(title || "").trim();
    if (!raw) {
        return { year: null, make: null, model: null, trim: null, title: raw };
    }

    const yearMatch = raw.match(/^(\d{4})\s+(.+)$/);
    if (!yearMatch) {
        return { year: null, make: null, model: raw, trim: null, title: raw };
    }

    const year = Number(yearMatch[1]);
    let remainder = yearMatch[2].trim();

    let make = null;
    for (const candidate of MULTI_WORD_MAKES) {
        if (remainder.toLowerCase().startsWith(candidate.toLowerCase())) {
            make = candidate.replace("Mercedes Benz", "Mercedes-Benz");
            remainder = remainder.slice(candidate.length).trim();
            break;
        }
    }

    if (!make) {
        const parts = remainder.split(/\s+/);
        make = parts.shift() || null;
        remainder = parts.join(" ").trim();
    }

    const modelParts = remainder.split(/\s+/);
    const model = modelParts.shift() || null;
    const trim = modelParts.length ? modelParts.join(" ") : null;

    return { year, make, model, trim, title: raw };
}

export function extractGalleryImageUrls(html) {
    if (!html) return [];

    const urls = [];
    const galleryMatch = html.match(
        /stm-big-car-gallery[\s\S]*?(?:stm-thumbs-car-gallery|<\/div>\s*<div class="stm-thumbs-car-gallery)/i
    );
    const scope = galleryMatch ? galleryMatch[0] : html;

    for (const match of scope.matchAll(
        /href="(https:\/\/centralmotorsrtb\.co\.za\/wp-content\/uploads\/[^"]+\.(?:jpe?g|png|webp))"/gi
    )) {
        urls.push(match[1]);
    }

    for (const match of html.matchAll(
        /(?:src|data-src)="(https:\/\/centralmotorsrtb\.co\.za\/wp-content\/uploads\/[^"]+\.(?:jpe?g|png|webp))"/gi
    )) {
        urls.push(match[1]);
    }

    return dedupeImages(urls);
}

function extractDescriptionHtml(html) {
    const match = html.match(
        /<\/script>\s*((?:<p>[\s\S]*?<\/p>\s*)+)<\/div>\s*<\/div>\s*<div class="col-md-3/i
    );
    if (!match) return "";
    return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractServiceHistory(description) {
    if (!description) return null;
    const explicit = description.match(/Service History:\s*([A-Za-z]+)/i);
    if (explicit?.[1]) return explicit[1].trim();
    if (/full\s+franchise\s+service\s+history/i.test(description)) return "FullByFranchise";
    if (/partial\s+service\s+history/i.test(description)) return "Partial";
    if (/service\s+history/i.test(description)) return "Present";
    return null;
}

export function extractWarranty(description) {
    if (!description) return null;
    if (/no active warranty/i.test(description)) return "No active warranty";
    const balance = description.match(/balance of factory warranty[^.]*/i);
    if (balance?.[0]) return balance[0].trim();
    const generic = description.match(/[^.]*\bwarranty\b[^.]*/i);
    return generic?.[0]?.trim() || null;
}

export function extractFeatures(description) {
    if (!description) return null;
    const cleaned = description
        .replace(/Service History:\s*\S+/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || null;
}

function extractListingTitle(html) {
    const h1 = html.match(/<h1 class="title[^"]*">([^<]+)<\/h1>/i);
    if (h1?.[1]) return h1[1].trim();
    const og = html.match(/<meta property="og:title" content="([^"]+)"/i);
    return og?.[1]?.trim() || null;
}

function extractListingPrice(html) {
    const sidebar = html.match(/single-regular-price[\s\S]{0,200}?R\s*([\d\s,]+)/i);
    if (sidebar?.[1]) return parsePrice(sidebar[1]);
    const meta = html.match(/for R([\d,]+)/i);
    return parsePrice(meta?.[1]);
}

function extractLocation(html, title) {
    const meta = html.match(/For Sale in ([A-Za-z\s]+)/i);
    if (meta?.[1]) return `${meta[1].trim()}, North West`;
    if (/rustenburg/i.test(title || "") || /rustenburg/i.test(html)) {
        return CENTRAL_MOTORS_DEFAULT_LOCATION;
    }
    return CENTRAL_MOTORS_DEFAULT_LOCATION;
}

/**
 * Parse a Central Motors listing HTML page.
 * @param {string} html
 * @param {string} sourceUrl
 * @returns {object}
 */
export function parseListingHtml(html, sourceUrl) {
    const postId = extractWordPressPostId(html);
    const title = extractListingTitle(html);
    const { year, make, model, trim } = parseTitleFields(title);
    const description = extractDescriptionHtml(html);

    const bodyType = parseTableField(html, "Body");
    const mileage = parseMileage(parseTableField(html, "Kilometre"));
    const fuel = parseTableField(html, "Fuel type");
    const engine = parseTableField(html, "Engine");
    const transmission = parseTableField(html, "Transmission");
    const driveType = parseTableField(html, "Drive");
    const exteriorColour =
        parseTableField(html, "Exterior Color") || parseTableField(html, "Exterior Colour");
    const interiorColour =
        parseTableField(html, "Interior Color") || parseTableField(html, "Interior Colour");
    const vin = parseTableField(html, "VIN") || parseTableField(html, "Vin");

    const serviceHistory = extractServiceHistory(description);
    const warranty = extractWarranty(description);
    const features = extractFeatures(description);
    const images = extractGalleryImageUrls(html);
    const price = extractListingPrice(html);
    const location = extractLocation(html, title);

    const missingFields = [];
    if (!vin) missingFields.push("vin");
    if (!interiorColour) missingFields.push("interiorColour");
    if (!warranty) missingFields.push("warranty");
    // Dealer stock numbers are not published on the website.
    missingFields.push("stockNumber");

    if (!postId) {
        throw new Error(`Could not extract WordPress post ID from ${sourceUrl}`);
    }

    return {
        postId,
        sourceUrl,
        title,
        year,
        make,
        model,
        trim,
        price,
        mileage,
        fuel,
        engine,
        transmission,
        bodyType,
        driveType,
        exteriorColour,
        interiorColour,
        vin,
        serviceHistory,
        warranty,
        features,
        description,
        images,
        location,
        missingFields,
    };
}

/**
 * Map parsed listing to canonical upsertVehicle() input.
 * @param {object} parsed
 * @param {string} companyId
 * @param {string} [syncedAt]
 */
export function toUpsertVehicle(parsed, companyId, syncedAt = new Date().toISOString()) {
    return {
        vehicleId: `veh-wp-${parsed.postId}`,
        companyId,
        stockNumber: `CM-WP-${parsed.postId}`,
        year: parsed.year,
        make: parsed.make,
        model: parsed.model,
        trim: parsed.trim,
        mileage: parsed.mileage,
        price: parsed.price,
        transmission: parsed.transmission,
        fuel: parsed.fuel,
        location: parsed.location,
        images: parsed.images,
        availability: "available",
        title: parsed.title,
        metadata: {
            sourceUrl: parsed.sourceUrl,
            source: CENTRAL_MOTORS_SOURCE,
            externalId: parsed.postId,
            lastSyncedAt: syncedAt,
            bodyType: parsed.bodyType,
            driveType: parsed.driveType,
            exteriorColour: parsed.exteriorColour,
            interiorColour: parsed.interiorColour || null,
            engine: parsed.engine,
            serviceHistory: parsed.serviceHistory,
            warranty: parsed.warranty,
            features: parsed.features,
            description: parsed.description,
            vin: parsed.vin || null,
        },
    };
}

/**
 * Parse listing URLs from listings sitemap XML.
 * @param {string} xml
 */
export function parseSitemapListingUrls(xml) {
    const urls = [];
    for (const match of String(xml || "").matchAll(/<loc>([^<]+)<\/loc>/gi)) {
        const url = match[1].trim();
        if (!/\/listings\/[^/]+\/$/.test(url)) continue;
        urls.push(url);
    }
    return [...new Set(urls)];
}

export async function fetchText(url, options = {}) {
    const response = await axios.get(url, {
        timeout: options.timeout || 30000,
        headers: {
            "User-Agent": USER_AGENT,
            Accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...(options.headers || {}),
        },
        responseType: "text",
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
    });
    return response.data;
}

export async function fetchSitemapListingUrls(sitemapUrl = CENTRAL_MOTORS_SITEMAP_URL) {
    const xml = await fetchText(sitemapUrl, { accept: "application/xml,text/xml,*/*" });
    return parseSitemapListingUrls(xml);
}

export async function fetchAndParseListing(url, options = {}) {
    const html = await fetchText(url, options);
    const parsed = parseListingHtml(html, url);
    return { parsed, vehicle: toUpsertVehicle(parsed, options.companyId || CENTRAL_MOTORS_RTB_COMPANY_ID) };
}

export async function fetchAllListings({
    sitemapUrl = CENTRAL_MOTORS_SITEMAP_URL,
    companyId = CENTRAL_MOTORS_RTB_COMPANY_ID,
    delayMs = 1200,
    limit = null,
    onProgress = null,
} = {}) {
    const urls = await fetchSitemapListingUrls(sitemapUrl);
    const selected = limit != null ? urls.slice(0, limit) : urls;
    const results = [];
    const failures = [];

    for (let i = 0; i < selected.length; i += 1) {
        const url = selected[i];
        try {
            const { parsed, vehicle } = await fetchAndParseListing(url, { companyId });
            results.push({ parsed, vehicle, url });
            if (onProgress) onProgress({ index: i + 1, total: selected.length, url, ok: true });
        } catch (err) {
            failures.push({ url, error: err.message || String(err) });
            if (onProgress) onProgress({ index: i + 1, total: selected.length, url, ok: false, error: err.message });
        }
        if (i < selected.length - 1 && delayMs > 0) {
            await sleep(delayMs);
        }
    }

    return { urls, selected, results, failures };
}

function formatRand(value) {
    if (value == null || Number.isNaN(value)) return "—";
    return `R${Number(value).toLocaleString("en-US")}`;
}

/**
 * Build import report lines matching the required CLI format.
 */
export function buildImportReport({
    sitemapCount,
    parsedCount,
    failedCount,
    imageCount,
    upsertCount,
    missingCounts = {},
    prices = [],
    makeCounts = {},
    failures = [],
}) {
    const lines = [
        "CENTRAL MOTORS IMPORT",
        "",
        `Sitemap vehicles:     ${String(sitemapCount).padStart(7)}`,
        `Successfully parsed:  ${String(parsedCount).padStart(7)}`,
        `Failed:               ${String(failedCount).padStart(7)}`,
        `Images extracted:     ${String(imageCount).padStart(7)}`,
        `Database upserts:     ${String(upsertCount).padStart(7)}`,
        "",
        "Missing:",
        `- Stock number: ${missingCounts.stockNumber ?? 0}`,
        `- VIN: ${missingCounts.vin ?? 0}`,
        `- Interior colour: ${missingCounts.interiorColour ?? 0}`,
        `- Warranty: ${missingCounts.warranty ?? 0}`,
        "",
    ];

    if (prices.length) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        lines.push("Price range:", `${formatRand(min)} – ${formatRand(max)}`, "");
    }

    const makes = Object.entries(makeCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (makes.length) {
        lines.push("Makes:");
        for (const [make, count] of makes) {
            lines.push(`${make}: ${count}`);
        }
        lines.push("");
    }

    if (failures.length) {
        lines.push("Parse failures:");
        for (const f of failures) {
            lines.push(`- ${f.url}: ${f.error}`);
        }
    }

    return lines.join("\n");
}

export function tallyImportStats(results, failures, sitemapCount) {
    const missingCounts = { stockNumber: 0, vin: 0, interiorColour: 0, warranty: 0 };
    const makeCounts = {};
    const prices = [];
    let imageCount = 0;

    for (const { parsed, vehicle } of results) {
        imageCount += parsed.images.length;
        if (vehicle.price != null) prices.push(vehicle.price);
        if (vehicle.make) {
            makeCounts[vehicle.make] = (makeCounts[vehicle.make] || 0) + 1;
        }
        if (parsed.missingFields.includes("stockNumber")) missingCounts.stockNumber += 1;
        if (parsed.missingFields.includes("vin")) missingCounts.vin += 1;
        if (parsed.missingFields.includes("interiorColour")) missingCounts.interiorColour += 1;
        if (parsed.missingFields.includes("warranty")) missingCounts.warranty += 1;
    }

    return {
        sitemapCount,
        parsedCount: results.length,
        failedCount: failures.length,
        imageCount,
        upsertCount: results.length,
        missingCounts,
        prices,
        makeCounts,
        failures,
    };
}
