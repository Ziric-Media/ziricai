/**
 * WhatsApp vehicle media outbound plan — native Meta image messages instead of markdown URLs.
 */
import {
    formatVehicleCustomerCard,
    formatVehicleTitle,
    stripInternalVehicleIdentifiersFromText,
} from "./vehiclePresentation.js";

export const MAX_VEHICLE_IMAGES_PER_TURN = 3;
export const MAX_GALLERY_IMAGES_PER_VEHICLE = 3;

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/g;
const CENTRAL_MOTORS_IMAGE_URL_PATTERN =
    /https?:\/\/(?:www\.)?centralmotorsrtb\.co\.za[^\s)\]]+\.(?:jpe?g|png|webp)(?:\?[^\s)\]]*)?/gi;
const BARE_IMAGE_URL_PATTERN = /https?:\/\/[^\s)\]]+\.(?:jpe?g|png|webp)(?:\?[^\s)\]]*)?/gi;
const WEBP_PATTERN = /\.webp(?:\?|$)/i;
const SUPPORTED_IMAGE_PATTERN = /\.(?:jpe?g|png)(?:\?|$)/i;
const VEHICLE_SPEC_LINE =
    /(?:\b(?:19|20)\d{2}\b.*\bR[\d,\s]+|\bR[\d,\s]+.*\b(?:km|stock|mileage)\b|\bstock\s*(?:#|:)?\s*[A-Z0-9-]+\b|💰|📏|⚙️|⛽|👨‍👩‍👧‍👦|📍|💳|^\s*-\s*(?:Price|Mileage|Transmission|Fuel|Location|Seating)\s*:)/i;
const NUMBERED_LIST_LINE = /^\s*\d+[\.\):]\s+/;
const BARE_SPEC_BULLET = /^\s*-\s*(?:Price|Mileage|Transmission|Fuel|Location|Seating|Fuel Type)\s*:/i;
const RANK_BADGE_LINE = /^\s*🥇|^\s*🥈|^\s*🥉|^\s*Best Match|^\s*Alternative #/i;
const INVENTORY_INTRO_LINE =
    /^\s*(?:here are|we have|great news|good news|fantastic|wonderful|excellent|i found|i'?ve found|check out|take a look|these are|some of our|currently have|available in stock).*(?:suv|vehicle|car|option|inventory|stock|match|recommend|fortuner|hilux|bmw|toyota|honda|ford)/i;
const GENERIC_STOCK_TEASER =
    /^\s*(?:here are|we have|i found|great|fantastic|wonderful|excellent|good).*(?:option|options|choice|choices|pick|picks|shortlist|selection)/i;
const EMOJI_VEHICLE_LINE = /^\s*🚗/;

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
    result = stripInternalVehicleIdentifiersFromText(result, vehicles);

    const makeTokens = new Set(
        vehicles.flatMap((v) => [v.make, v.model, v.title, v.stockNumber].filter(Boolean).map((s) => String(s).toLowerCase()))
    );

    const lines = result.split("\n");
    const kept = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (NUMBERED_LIST_LINE.test(trimmed)) return false;
        if (BARE_SPEC_BULLET.test(trimmed)) return false;
        if (RANK_BADGE_LINE.test(trimmed)) return false;
        if (/^🚗\s+\d+\./.test(trimmed)) return false;
        if (EMOJI_VEHICLE_LINE.test(trimmed)) return false;
        if (INVENTORY_INTRO_LINE.test(trimmed)) return false;
        if (GENERIC_STOCK_TEASER.test(trimmed)) return false;
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

function paragraphMentionsVehicleTokens(text, vehicles = []) {
    const lower = String(text || "").toLowerCase();
    for (const vehicle of vehicles) {
        for (const token of [vehicle?.make, vehicle?.model, vehicle?.title, vehicle?.bodyType].filter(Boolean)) {
            const part = String(token).toLowerCase();
            if (part.length >= 3 && lower.includes(part.slice(0, Math.min(part.length, 12)))) {
                return true;
            }
        }
    }
    return false;
}

function isInventoryIntroParagraph(text, vehicles = []) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    if (INVENTORY_INTRO_LINE.test(trimmed)) return true;
    if (GENERIC_STOCK_TEASER.test(trimmed)) return true;
    if (EMOJI_VEHICLE_LINE.test(trimmed)) return true;
    if (paragraphMentionsVehicleTokens(trimmed, vehicles)) return true;
    if (
        /\b(?:suv|suvs|vehicle|vehicles|car|cars|in stock|inventory|available)\b/i.test(trimmed) &&
        /\b(?:here|have|found|picked|several|some|few|great|fantastic|good|options)\b/i.test(trimmed)
    ) {
        return true;
    }
    return false;
}

/**
 * Build a single canonical intro when searchInventory cards will follow.
 * @param {object[]} vehicles
 */
export function buildCanonicalInventoryIntro(vehicles = []) {
    const count = vehicles.length;
    const bodyTypes = new Set(
        vehicles.map((v) => String(v?.bodyType || "").trim().toLowerCase()).filter(Boolean)
    );
    const allSuv =
        (bodyTypes.size === 1 && bodyTypes.has("suv")) ||
        (bodyTypes.size > 0 && [...bodyTypes].every((b) => b === "suv"));

    if (allSuv) {
        if (count === 1) return "We have an SUV in stock that may suit you — here are the details:";
        if (count === 2) return "We have a couple of SUVs available. I've picked two good options for you:";
        return "We have several SUVs available. I've picked a few good options for you:";
    }

    if (count === 1) return "Here's a vehicle from our current stock that may suit you:";
    if (count === 2) return "We have two options from our current stock that may suit you:";
    return "We have several vehicles available. I've picked a few good options for you:";
}

/**
 * Collapse duplicate LLM inventory intros — cards are canonical from tool results.
 * @param {string} llmReply
 * @param {object[]} vehicles
 * @returns {{ intro: string, followUp: string }}
 */
export function buildInventoryIntroText(llmReply = "", vehicles = []) {
    const stripped = stripVehicleListingProseFromText(llmReply, vehicles);
    const paragraphs = stripped
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean);

    const introParagraphs = paragraphs.filter((p) => isInventoryIntroParagraph(p, vehicles));
    const followUpParagraphs = paragraphs.filter((p) => !isInventoryIntroParagraph(p, vehicles));

    let intro;
    if (
        introParagraphs.length > 1 ||
        introParagraphs.length === 0 ||
        introParagraphs.some((p) => paragraphMentionsVehicleTokens(p, vehicles))
    ) {
        intro = buildCanonicalInventoryIntro(vehicles);
    } else {
        intro = introParagraphs[0];
    }

    return {
        intro: intro.trim(),
        followUp: followUpParagraphs.join("\n\n").trim(),
    };
}

/**
 * Ensure gallery intro names each vehicle — images follow without duplicate title captions.
 * @param {string} llmReply
 * @param {object[]} vehicles
 */
export function buildGalleryIntroText(llmReply = "", vehicles = []) {
    const stripped = stripVehicleListingProseFromText(llmReply, vehicles);
    const names = vehicles.map((v) => formatVehicleTitle(v)).filter(Boolean);
    if (!names.length) return stripped;

    const namesLine = names.length === 1 ? names[0] : names.join(", ");
    const lower = stripped.toLowerCase();
    const allNamed = names.every((name) => lower.includes(String(name).toLowerCase().slice(0, 12)));
    if (allNamed) return stripped;

    if (stripped) {
        return `${stripped}\n\nPhotos: ${namesLine}`;
    }
    return names.length === 1 ? `Here are photos of the ${namesLine}.` : `Here are photos of the ${namesLine}.`;
}

/**
 * @param {object} vehicle
 * @param {number} [index]
 */
export function formatVehicleTextBlock(vehicle, index = 0) {
    return formatVehicleCustomerCard(vehicle, index);
}

/**
 * @param {object} vehicle
 * @returns {string[]}
 */
export function getSupportedVehicleImageUrls(vehicle) {
    const images = Array.isArray(vehicle?.images)
        ? vehicle.images
        : vehicle?.primaryImageUrl
          ? [vehicle.primaryImageUrl]
          : [];
    return images.filter(isSupportedWhatsAppImageUrl);
}

/**
 * @param {object} vehicle
 * @param {number} [max]
 */
export function pickGalleryImageUrls(vehicle, max = 1) {
    return getSupportedVehicleImageUrls(vehicle).slice(0, max);
}

/**
 * @param {object} vehicle
 */
export function pickHeroImageUrl(vehicle) {
    return pickGalleryImageUrls(vehicle, 1)[0] || null;
}

/**
 * Additional gallery images — skip hero (first supported image) when possible.
 * @param {object} vehicle
 * @param {number} [max]
 */
export function pickAdditionalGalleryImageUrls(vehicle, max = MAX_GALLERY_IMAGES_PER_VEHICLE) {
    const supported = getSupportedVehicleImageUrls(vehicle);
    if (supported.length <= 1) return supported.slice(0, max);
    return supported.slice(1, 1 + max);
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
    const { intro, followUp } = buildInventoryIntroText(llmReply, vehicles);
    if (intro) {
        messages.push({ type: "text", text: intro });
    }

    vehicles.forEach((vehicle, index) => {
        const textBlock = formatVehicleTextBlock(vehicle, index);
        if (textBlock) {
            messages.push({ type: "text", text: textBlock });
        }
        const imageUrl = pickHeroImageUrl(vehicle);
        if (imageUrl) {
            messages.push({
                type: "image",
                link: imageUrl,
            });
        }
    });

    if (followUp) {
        messages.push({ type: "text", text: followUp });
    }

    if (!messages.length) return null;

    const strippedReply = [intro, followUp].filter(Boolean).join("\n\n");

    return {
        messages,
        strippedReply,
        vehicleCount: vehicles.length,
        vehicleIds: vehicles.map((v) => v.vehicleId).filter(Boolean),
        planType: "search",
    };
}

/**
 * Build outbound plan for gallery/image-only requests (no searchInventory in same turn).
 * @param {{ vehicles?: object[], llmReply?: string, channel?: string, fullGallery?: boolean }} params
 * @returns {{ messages: object[], strippedReply: string, vehicleCount: number, vehicleIds: string[], imageCount: number, planType: string }|null}
 */
export function buildGalleryOutboundPlan({
    vehicles = [],
    llmReply = "",
    channel = "whatsapp",
    fullGallery = false,
} = {}) {
    if (channel !== "whatsapp") return null;

    const deduped = dedupeRecommendedVehicles(vehicles);
    if (!deduped.length) return null;

    const imagesPerVehicle = fullGallery ? MAX_GALLERY_IMAGES_PER_VEHICLE : MAX_GALLERY_IMAGES_PER_VEHICLE;
    const messages = [];
    const introText = buildGalleryIntroText(llmReply, deduped);
    if (introText) {
        messages.push({ type: "text", text: introText });
    }

    let imageCount = 0;
    for (const vehicle of deduped) {
        const imageUrls = getSupportedVehicleImageUrls(vehicle).slice(0, imagesPerVehicle);
        for (const imageUrl of imageUrls) {
            messages.push({
                type: "image",
                link: imageUrl,
            });
            imageCount++;
        }
    }

    if (!imageCount) return null;

    return {
        messages,
        strippedReply: introText,
        vehicleCount: deduped.length,
        vehicleIds: deduped.map((v) => v.vehicleId).filter(Boolean),
        imageCount,
        planType: "gallery",
    };
}

/** @deprecated alias — use buildGalleryOutboundPlan */
export const buildImageOnlyOutboundPlan = buildGalleryOutboundPlan;

/**
 * Load full inventory records (with images) for recommended vehicle refs.
 * @param {string} companyId
 * @param {object[]} vehicleRefs
 */
export async function enrichRecommendedVehiclesForOutbound(companyId, vehicleRefs = []) {
    if (!companyId || !vehicleRefs?.length) return [];
    const { getVehicleById } = await import("../inventory/inventoryService.js");
    const enriched = [];

    for (const ref of vehicleRefs) {
        if (!ref?.vehicleId) continue;
        const full = await getVehicleById(companyId, ref.vehicleId);
        if (full) {
            enriched.push(full);
        } else {
            enriched.push({
                ...ref,
                images: ref.primaryImageUrl ? [ref.primaryImageUrl] : ref.images || [],
            });
        }
    }

    return dedupeRecommendedVehicles(enriched);
}

/**
 * Adjust LLM reply when gallery image delivery failed — never claim success without send.
 * @param {string} reply
 * @param {{ expectedImages?: number, sentImages?: number }} stats
 */
export function formatGalleryDeliveryReply(reply, { expectedImages = 0, sentImages = 0 } = {}) {
    const base = stripWhatsAppImageUrlsFromText(reply);
    if (expectedImages > 0 && sentImages < expectedImages) {
        const failureNote =
            sentImages === 0
                ? "I'm sorry — I wasn't able to deliver the photos right now. Please try again in a moment or ask a consultant to send them."
                : "I was only able to send some of the photos — a few couldn't be delivered. Let me know if you'd like me to try again.";
        if (sentImages === 0) return failureNote;
        return base ? `${base}\n\n${failureNote}` : failureNote;
    }
    return base;
}
