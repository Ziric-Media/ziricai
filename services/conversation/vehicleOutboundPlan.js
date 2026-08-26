/**
 * WhatsApp vehicle media outbound plan — native Meta image messages instead of markdown URLs.
 */

export const MAX_VEHICLE_IMAGES_PER_TURN = 3;

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/g;
const CENTRAL_MOTORS_IMAGE_URL_PATTERN =
    /https?:\/\/(?:www\.)?centralmotorsrtb\.co\.za[^\s)\]]+\.(?:jpe?g|png|webp)(?:\?[^\s)\]]*)?/gi;
const BARE_IMAGE_URL_PATTERN = /https?:\/\/[^\s)\]]+\.(?:jpe?g|png|webp)(?:\?[^\s)\]]*)?/gi;
const WEBP_PATTERN = /\.webp(?:\?|$)/i;
const SUPPORTED_IMAGE_PATTERN = /\.(?:jpe?g|png)(?:\?|$)/i;
const VEHICLE_SPEC_LINE =
    /(?:\b(?:19|20)\d{2}\b.*\bR[\d,\s]+|\bR[\d,\s]+.*\b(?:km|stock)\b|\bstock\s*(?:#|:)?\s*[A-Z0-9-]+\b)/i;
const NUMBERED_LIST_LINE = /^\s*\d+[\.\):]\s+/;

/**
 * @param {string|null|undefined} url
 */
export function isSupportedWhatsAppImageUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (WEBP_PATTERN.test(url)) return false;
    return SUPPORTED_IMAGE_PATTERN.test(url);
}

/**
 * Strip markdown images and bare vehicle image URLs from LLM reply text.
 * @param {string} text
 */
export function stripWhatsAppImageUrlsFromText(text) {
    let result = String(text || "");
    result = result.replace(MARKDOWN_IMAGE_PATTERN, "");
    result = result.replace(CENTRAL_MOTORS_IMAGE_URL_PATTERN, "");
    result = result.replace(BARE_IMAGE_URL_PATTERN, (match) =>
        /centralmotorsrtb\.co\.za/i.test(match) ? "" : match
    );
    result = result.replace(/[ \t]+\n/g, "\n");
    result = result.replace(/\n{3,}/g, "\n\n");
    return result.trim();
}

/**
 * Remove vehicle listing prose from LLM reply — outbound plan sends canonical vehicle blocks.
 * @param {string} text
 * @param {object[]} [vehicles]
 */
export function stripVehicleListingProseFromText(text, vehicles = []) {
    let result = stripWhatsAppImageUrlsFromText(text);
    const makeTokens = new Set(
        vehicles.flatMap((v) => [v.make, v.model, v.title, v.stockNumber].filter(Boolean).map((s) => String(s).toLowerCase()))
    );

    const lines = result.split("\n");
    const kept = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (NUMBERED_LIST_LINE.test(trimmed)) return false;
        if (VEHICLE_SPEC_LINE.test(trimmed)) return false;
        const lower = trimmed.toLowerCase();
        for (const token of makeTokens) {
            if (token.length >= 3 && lower.includes(token)) return false;
        }
        return true;
    });

    result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return result;
}

/**
 * @param {object} vehicle
 */
export function formatVehicleTextBlock(vehicle) {
    const parts = [];
    const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    if (title) parts.push(title);
    if (vehicle.price != null) {
        parts.push(`R${Number(vehicle.price).toLocaleString("en-ZA")}`);
    }
    if (vehicle.mileage != null) {
        parts.push(`${Number(vehicle.mileage).toLocaleString("en-ZA")} km`);
    }
    if (vehicle.location) parts.push(vehicle.location);
    if (vehicle.stockNumber) parts.push(`Stock: ${vehicle.stockNumber}`);
    return parts.join(" · ");
}

/**
 * @param {object} vehicle
 */
export function pickHeroImageUrl(vehicle) {
    const images = Array.isArray(vehicle?.images) ? vehicle.images : [];
    return images.find(isSupportedWhatsAppImageUrl) || null;
}

/**
 * Deduplicate vehicles by vehicleId or stockNumber (preserve order).
 * @param {object[]} vehicles
 */
export function dedupeRecommendedVehicles(vehicles = []) {
    const seen = new Set();
    return vehicles.filter((vehicle) => {
        const key = vehicle?.vehicleId || vehicle?.stockNumber;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * @param {object[]} toolResults
 */
export function extractSearchInventoryVehicles(toolResults = []) {
    const hit = toolResults.find(
        (r) => r.tool === "searchInventory" && (r.ok ?? r.success) && Array.isArray(r.vehicles)
    );
    return dedupeRecommendedVehicles(hit?.vehicles || []);
}

/**
 * Build sequential WhatsApp outbound parts when searchInventory succeeded.
 * Vehicle list is canonical from tool results — LLM reply is intro-only.
 * @param {{ toolResults?: object[], llmReply?: string, channel?: string }} params
 * @returns {{ messages: object[], strippedReply: string, vehicleCount: number, vehicleIds: string[] }|null}
 */
export function buildVehicleOutboundPlan({ toolResults = [], llmReply = "", channel = "whatsapp" } = {}) {
    if (channel !== "whatsapp") return null;

    const vehicles = extractSearchInventoryVehicles(toolResults).slice(0, MAX_VEHICLE_IMAGES_PER_TURN);
    if (!vehicles.length) return null;

    const messages = [];
    const strippedReply = stripVehicleListingProseFromText(llmReply, vehicles);
    if (strippedReply) {
        messages.push({ type: "text", text: strippedReply });
    }

    for (const vehicle of vehicles) {
        const textBlock = formatVehicleTextBlock(vehicle);
        if (textBlock) {
            messages.push({ type: "text", text: textBlock });
        }
        const imageUrl = pickHeroImageUrl(vehicle);
        if (imageUrl) {
            const caption =
                vehicle.title ||
                vehicle.label ||
                [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
            messages.push({
                type: "image",
                link: imageUrl,
                caption: String(caption || "").slice(0, 1024),
            });
        }
    }

    if (!messages.length) return null;

    return {
        messages,
        strippedReply,
        vehicleCount: vehicles.length,
        vehicleIds: vehicles.map((v) => v.vehicleId).filter(Boolean),
    };
}
