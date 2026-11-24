/**
 * Sarah App — replace hallucinated markdown images with real inventory photo URLs.
 */
import { searchInventory } from "../../inventory/inventoryService.js";
import { stripWhatsAppImageUrlsFromText } from "../../conversation/vehicleOutboundPlan.js";
import { formatVehicleTitle } from "../../conversation/vehiclePresentation.js";
import { resolveSarahAppInventoryCompanyId } from "../../storage/centralMotorsPilot.js";
import { fetchDealerImageBuffer, isAllowedDealerImageUrl } from "../../media/dealerImageProxy.js";
import {
    CENTRAL_MOTORS_SOURCE,
    fetchAndParseListing,
} from "../../inventory/adapters/centralMotorsRtbAdapter.js";
import { BABES_CAR_SALES_SOURCE } from "../../inventory/adapters/babesCarSalesAdapter.js";
import { resolveGalleryVehicleTargets } from "../../conversation/vehicleReference.js";
import { extractSearchInventoryVehicles } from "../../conversation/vehicleOutboundPlan.js";
import {
    getBusinessDirectoryEntry,
    hydrateBusinessDirectory,
    listDiscoverCards,
} from "../../users/businessDirectoryService.js";

const GALLERY_INTENT =
    /\b(photo|photos|picture|pictures|image|images|pic|pics|showroom|gallery|visual|see the|show me|look at|more images|send me|attach)\b/i;
const STOCK_MEDIA_INTENT =
    /\b(stock|inventory|vehicle|vehicles|car|cars|suvs?|sedans?|hatch(?:es)?|bakkies?|trucks?|pre[- ]?owned|used)\b/i;

const MARKDOWN_IMAGE_TEST = /!\[[^\]]*\]\([^)]+\)/;
const HALLUCINATED_CAPTION =
    /\b(?:SUV|Sedan|Truck|Hatch|Bakkie)\s+Models?\b|\b(?:SUV|Sedan|Truck|Hatch|Bakkie)\s+Model\s*\d+\b/i;

const TRUSTED_IMAGE_HOST =
    /(?:centralmotorsrtb|babescarsales)\.co\.za|firebasestorage\.googleapis\.com|\.firebasestorage\.app|(?:sarah\.)?ziricai\.com\/api\/network\/v1\/listing-media/i;

/** @param {string|null|undefined} url */
export function isSarahAppDisplayableImageUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return false;
    if (
        /example\.com|unsplash\.com|placeholder|via\.placeholder|picsum\.photos|placehold\.co|\/showroom\/|\/stock\/model/i.test(
            raw
        )
    ) {
        return false;
    }
    if (!/^https?:\/\//i.test(raw)) return false;
    if (TRUSTED_IMAGE_HOST.test(raw)) return true;
    return (
        /\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(raw) &&
        /(?:centralmotorsrtb|babescarsales)\.co\.za/i.test(raw)
    );
}

/**
 * Remove markdown images with invalid or hallucinated URLs/captions.
 * @param {string} reply
 */
export function scrubInvalidMarkdownImages(reply) {
    const text = String(reply || "");
    let removed = 0;
    const cleaned = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
        const caption = String(alt || "").trim();
        const href = String(url || "").trim();
        const ok = isSarahAppDisplayableImageUrl(href) && !HALLUCINATED_CAPTION.test(caption);
        if (ok) return full;
        removed += 1;
        return "";
    });
    return {
        text: cleaned
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
        removed,
    };
}

/**
 * @param {string} url
 */
export function scoreDealerImageUrl(url) {
    const u = String(url || "").toLowerCase();
    let score = 0;
    if (/\.jpe?g(?:\?|$)/.test(u)) score += 24;
    else if (/\.png(?:\?|$)/.test(u)) score += 18;
    else if (/\.webp(?:\?|$)/.test(u)) score += 8;
    if (/\/wp-content\/uploads\//.test(u)) score += 12;
    if (/-\d+x\d+\./.test(u)) score -= 20;
    if (/\b(?:thumb|thumbnail|placeholder)\b/.test(u)) score -= 25;
    if (/ddb|photography/i.test(u)) score += 6;
    return score;
}

export function normalizeVehicleDisplayTitle(title) {
    let t = String(title || "").trim();
    if (!t) return t;
    t = t.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    t = t.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
    return t.replace(/&times;/gi, "×").replace(/&nbsp;/gi, " ").replace(/&amp;/g, "&");
}

/**
 * @param {object} vehicle
 * @returns {string[]}
 */
export function getSarahAppVehicleImageUrls(vehicle) {
    const images = Array.isArray(vehicle?.images)
        ? vehicle.images
        : vehicle?.primaryImageUrl
          ? [vehicle.primaryImageUrl]
          : [];
    return images
        .map((u) => String(u || "").trim())
        .filter(isSarahAppDisplayableImageUrl)
        .sort((a, b) => scoreDealerImageUrl(b) - scoreDealerImageUrl(a));
}

/**
 * @param {object} vehicle
 */
export function pickBestSarahAppVehicleImageUrl(vehicle) {
    return getSarahAppVehicleImageUrls(vehicle)[0] || null;
}

/**
 * WordPress often stores a tiny `-150x150` variant that 404s or blocks hotlinks — try full-size too.
 * @param {string} url
 */
export function expandDealerImageCandidates(url) {
    const raw = String(url || "").trim();
    const out = [raw];
    const m = raw.match(/^(.*)-\d+x\d+(\.(?:jpe?g|png|webp))(\?.*)?$/i);
    if (m) out.push(`${m[1]}${m[2]}${m[3] || ""}`);
    return [...new Set(out)];
}

const LIVE_LISTING_IMAGE_SOURCES = new Set([CENTRAL_MOTORS_SOURCE, BABES_CAR_SALES_SOURCE]);

/**
 * Re-fetch gallery URLs from the dealer listing page when Postgres copies are stale or 404.
 * @param {object} vehicle
 */
async function liveWebsiteListingImageUrls(vehicle) {
    const meta = vehicle?.metadata || {};
    if (!LIVE_LISTING_IMAGE_SOURCES.has(meta.source)) return [];
    const sourceUrl = String(meta.sourceUrl || "").trim();
    if (!/\/listings\//i.test(sourceUrl)) return [];
    try {
        const { parsed } = await fetchAndParseListing(sourceUrl, { companyId: vehicle.companyId });
        return (parsed?.images || []).filter(isSarahAppDisplayableImageUrl);
    } catch {
        return [];
    }
}

async function verifyFirstWorkingDealerImage(ranked) {
    const tried = new Set();
    for (const base of ranked) {
        for (const candidate of expandDealerImageCandidates(base)) {
            if (tried.has(candidate)) continue;
            tried.add(candidate);
            if (!isAllowedDealerImageUrl(candidate)) continue;
            try {
                await fetchDealerImageBuffer(candidate);
                const alternateUrls = [];
                for (const alt of ranked) {
                    for (const expanded of expandDealerImageCandidates(alt)) {
                        if (expanded === candidate || alternateUrls.includes(expanded)) continue;
                        if (isAllowedDealerImageUrl(expanded)) alternateUrls.push(expanded);
                    }
                }
                return { url: candidate, alternateUrls: alternateUrls.slice(0, 4) };
            } catch {
                /* try next candidate */
            }
        }
    }
    return null;
}

/**
 * @param {object} vehicle
 */
export async function pickVerifiedSarahAppVehicleImageUrl(vehicle) {
    let ranked = getSarahAppVehicleImageUrls(vehicle);
    let picked = await verifyFirstWorkingDealerImage(ranked);
    if (picked) return picked;
    const live = await liveWebsiteListingImageUrls(vehicle);
    if (live.length) {
        ranked = [...live, ...ranked];
        picked = await verifyFirstWorkingDealerImage(ranked);
    }
    return picked;
}

/**
 * @param {object[]} vehicles
 * @param {number} [limit]
 */
export async function buildSarahAppMediaAttachmentsVerified(vehicles, limit = 9) {
    const items = [];
    for (const vehicle of vehicles || []) {
        const picked = await pickVerifiedSarahAppVehicleImageUrl(vehicle);
        if (!picked) continue;
        items.push({
            kind: "image",
            url: picked.url,
            alternateUrls: picked.alternateUrls,
            name: normalizeVehicleDisplayTitle(formatVehicleTitle(vehicle) || "Vehicle"),
            mimeType: "image/jpeg",
        });
        if (items.length >= limit) break;
    }
    return items;
}

/**
 * Fast path for Sarah App chat — trusted dealer URLs first; verify at most two images to stay within mobile timeouts.
 * @param {object[]} vehicles
 * @param {number} [limit]
 */
export async function buildSarahAppMediaAttachmentsForReply(vehicles, limit = 4) {
    const capped = dedupeVehicles(vehicles).slice(0, limit);
  /** Trusted dealer URLs are proxied in Sarah App — skip slow per-image upstream verification by default. */
    const fast = buildSarahAppMediaAttachments(capped, limit);
    if (fast.length) return fast;

    const items = [];
    for (const vehicle of capped) {
        const picked = await pickVerifiedSarahAppVehicleImageUrl(vehicle);
        const primaryUrl = picked?.url || pickBestSarahAppVehicleImageUrl(vehicle);
        if (!primaryUrl) continue;
        const alternates = [
            ...(picked?.alternateUrls || []),
            ...expandDealerImageCandidates(primaryUrl),
            ...getSarahAppVehicleImageUrls(vehicle),
        ]
            .map((u) => String(u || "").trim())
            .filter((u) => u && u !== primaryUrl && isSarahAppDisplayableImageUrl(u));
        const uniqueAlternates = [...new Set(alternates)].slice(0, 5);
        items.push({
            kind: "image",
            url: primaryUrl,
            alternateUrls: uniqueAlternates,
            name: normalizeVehicleDisplayTitle(formatVehicleTitle(vehicle) || "Vehicle"),
            mimeType: /\.png/i.test(primaryUrl) ? "image/png" : "image/jpeg",
        });
        if (items.length >= limit) break;
    }
    return items;
}

/**
 * @param {string} message
 * @param {{ role?: string, content?: string }[]} [history]
 */
export function wantsSarahAppVehicleGallery(message, history = []) {
    const text = String(message || "").trim();
    if (!text) return false;
    if (GALLERY_INTENT.test(text)) return true;
    if (/^\s*images?\s*$/i.test(text)) return true;
    if (/\b(show me|on the floor|in stock)\b/i.test(text) && STOCK_MEDIA_INTENT.test(text)) {
        return true;
    }
    if (/\bavailable\b/i.test(text) && STOCK_MEDIA_INTENT.test(text)) {
        return true;
    }
    if (/^\s*images?\s*$/i.test(text)) {
        const prior = (history || []).filter((h) => h.role === "user").slice(-6);
        if (prior.some((h) => GALLERY_INTENT.test(h.content) || STOCK_MEDIA_INTENT.test(h.content))) {
            return true;
        }
    }
    return STOCK_MEDIA_INTENT.test(text) && GALLERY_INTENT.test(text);
}

/**
 * Use recent customer turns when the latest message is short (e.g. "images").
 * @param {string} customerText
 * @param {{ role?: string, content?: string }[]} [history]
 */
export function resolveMediaSearchContext(customerText, history = []) {
    const text = String(customerText || "").trim();
    if (detectInventoryBodyTypeFilter(text) || text.length > 24) return text;
    const discussed = resolveDiscussedVehicleFromHistory(history);
    if (discussed) return discussed;
    const prior = (history || [])
        .filter((h) => h.role === "user")
        .slice(-6)
        .reverse();
    for (const turn of prior) {
        const c = String(turn.content || "").trim();
        if (!c || c === text) continue;
        if (STOCK_MEDIA_INTENT.test(c) || GALLERY_INTENT.test(c)) {
            return `${c} ${text}`.trim();
        }
    }
    return text;
}

/**
 * @param {string} text
 */
export function detectInventoryBodyTypeFilter(text) {
    const lower = String(text || "").toLowerCase();
    if (/\bsuvs?\b/.test(lower)) return "SUV";
    if (/\bsedans?\b/.test(lower)) return "Sedan";
    if (/\b(truck|bakkie|pickup)s?\b/.test(lower)) return "Bakkie";
    return undefined;
}

/**
 * Body type Sarah promised in this turn (reply wins over customer ask).
 * @param {string} customerText
 * @param {string} [reply]
 * @param {{ role?: string, content?: string }[]} [history]
 */
export function resolvePromisedBodyType(customerText, reply = "", history = []) {
    const fromReply = detectInventoryBodyTypeFilter(reply);
    if (fromReply) return fromReply;
    const fromCustomer = detectInventoryBodyTypeFilter(customerText);
    if (fromCustomer) return fromCustomer;
    const recent = (history || [])
        .slice(-8)
        .map((h) => String(h?.content || ""))
        .join(" ");
    return detectInventoryBodyTypeFilter(recent);
}

/**
 * @param {object} vehicle
 * @returns {string}
 */
export function vehicleBodyTypeKey(vehicle) {
    const label = bodyTypeLabel(vehicle).toLowerCase();
    const title = normalizeVehicleDisplayTitle(formatVehicleTitle(vehicle) || "").toLowerCase();
    if (label.includes("suv") || /\bsuv\b/.test(title)) return "suv";
    if (label.includes("sedan") || /\bsedan\b/.test(title)) return "sedan";
    if (label.includes("bakkie") || label.includes("truck") || /\b(bakkie|pickup|ranger)\b/.test(title)) {
        return "bakkie";
    }
    return label || "other";
}

/**
 * @param {object[]} vehicles
 * @param {string} [bodyType] SUV | Sedan | Bakkie
 */
export function filterVehiclesByBodyType(vehicles, bodyType) {
    const want = String(bodyType || "")
        .toLowerCase()
        .replace(/s$/, "");
    if (!want) return vehicles || [];
    return (vehicles || []).filter((v) => {
        const key = vehicleBodyTypeKey(v);
        if (want === "suv") return key === "suv";
        if (want === "sedan") return key === "sedan";
        if (want === "bakkie" || want === "truck") return key === "bakkie";
        return true;
    });
}

/**
 * @param {string} reply
 * @returns {{ index: number, title: string }[]}
 */
export function parseNumberedVehicleLinesFromReply(reply) {
    const mentions = [];
    const re = /^\s*(\d+)[\.\):]\s*\*{0,2}([^*\n]+?)(?:\*{0,2}\s*:)?\s*$/gm;
    let m;
    while ((m = re.exec(String(reply || ""))) !== null) {
        const title = m[2].replace(/\*\*/g, "").trim();
        if (title.length < 6) continue;
        if (/\b(price|monthly|budget|km|transmission)\b/i.test(title) && !/\b(19|20)\d{2}\b/.test(title)) {
            continue;
        }
        mentions.push({ index: parseInt(m[1], 10), title });
    }
    return mentions;
}

/** Markdown bullets such as `- **2014 FORD RANGER…**` when Sarah lists multiple vehicles. */
export function parseBulletVehicleLinesFromReply(reply) {
    const mentions = [];
    const re = /^\s*[-*•]\s*\*{0,2}([^*\n]+?)(?:\*{0,2})?\s*$/gm;
    let m;
    while ((m = re.exec(String(reply || ""))) !== null) {
        const title = m[1].replace(/\*\*/g, "").trim();
        if (!/\b(19|20)\d{2}\b/.test(title) || title.length < 8) continue;
        mentions.push({ index: mentions.length + 1, title });
    }
    return mentions;
}

/** Numbered lines first; otherwise bullet lists of year/make/model titles. */
export function parseVehicleLinesFromReply(reply) {
    const numbered = parseNumberedVehicleLinesFromReply(reply);
    if (numbered.length) return numbered;
    return parseBulletVehicleLinesFromReply(reply);
}

/**
 * Keep image order aligned with numbered list in Sarah's reply.
 * @param {string} reply
 * @param {object[]} vehicles
 */
export function matchVehiclesToReplyOrder(reply, vehicles = []) {
    const mentions = parseVehicleLinesFromReply(reply);
    if (!mentions.length || !vehicles?.length) return vehicles;

    const used = new Set();
    const ordered = [];

    for (const mention of mentions) {
        const tokens = mention.title
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length > 2);
        const found = vehicles.find((v) => {
            const id = v?.vehicleId || v?.stockNumber;
            if (!id || used.has(id)) return false;
            const title = normalizeVehicleDisplayTitle(formatVehicleTitle(v) || "").toLowerCase();
            const hits = tokens.filter((t) => title.includes(t));
            return hits.length >= Math.min(3, tokens.length) || title.includes(mention.title.toLowerCase().slice(0, 24));
        });
        if (found) {
            used.add(found.vehicleId || found.stockNumber);
            ordered.push(found);
        }
    }

    for (const v of vehicles) {
        const id = v?.vehicleId || v?.stockNumber;
        if (!id || used.has(id)) continue;
        ordered.push(v);
    }
    return ordered;
}

const MODEL_HINTS = [
    "everest",
    "tiguan",
    "ranger",
    "fortuner",
    "rav4",
    "x-trail",
    "x3",
    "hilux",
    "corolla",
    "amaze",
    "focus",
    "changan",
    "haval",
    "bmw",
    "nissan",
];

/**
 * Staff / policy turns — never attach stock photos.
 * @param {string} customerText
 * @param {string} [reply]
 */
export function isNonVehicleStockTurn(customerText, reply = "") {
    const blob = `${customerText || ""}\n${reply || ""}`.toLowerCase();
    return /\b(team members?|which people|who works|people working|working at|sales executive|dealer principal|our team|key team)\b/.test(
        blob
    );
}

/**
 * Customer asked for photos / confirmed Sarah's picture offer — not every stock mention.
 * @param {string} customerText
 * @param {string} [reply]
 * @param {{ role?: string, content?: string }[]} [history]
 */
/**
 * @param {string} customerText
 * @param {{ role?: string, content?: string }[]} [history]
 */
export function customerAsksVehiclePhoto(customerText, history = []) {
    const text = String(customerText || "").trim();
    if (!text) return false;
    if (/\b(see|show)\s+(me\s+)?(its?|the)\s+(pic|pics|photo|photos|image|images)\b/i.test(text)) return true;
    if (/\blets\s+see\s+(its?|the)\s+pic\b/i.test(text)) return true;
    if (/\bshow me\s+(its?|the)\s+image\b/i.test(text)) return true;
    if (
        /^\s*(do you have\s+)?(any\s+)?(pics?|photos?|images?|pictures)\b/i.test(text) &&
        (STOCK_MEDIA_INTENT.test(text) || Boolean(resolveDiscussedVehicleFromHistory(history)))
    ) {
        return true;
    }
    if (
        /\b(show|see|send)\s+(me\s+)?(the\s+)?(pic|pics|photo|photos|image|images)\b/i.test(text) &&
        Boolean(resolveDiscussedVehicleFromHistory(history))
    ) {
        return true;
    }
    if (
        /\b(pics?|photos?|images?|pictures)\b/i.test(text) &&
        (STOCK_MEDIA_INTENT.test(text) || Boolean(resolveDiscussedVehicleFromHistory(history)))
    ) {
        return true;
    }
    return false;
}

export function customerWantsVehicleMedia(customerText, reply = "", history = []) {
    if (isNonVehicleStockTurn(customerText, reply)) return false;
    const text = String(customerText || "").trim();
    if (!text) return false;
    if (customerAsksVehiclePhoto(text, history)) return true;
    if (wantsSarahAppVehicleGallery(text, history)) return true;
    if (/\b(pics?|photos?|images?|pictures)\b/i.test(text) && STOCK_MEDIA_INTENT.test(text)) return true;
    if (/\bshow me\b/i.test(text) && /\b(pics?|photos?|images?)\b/i.test(text)) return true;
    if (customerConfirmedPictureOffer(text, history)) return true;
    if (replyDefersDelivery(reply) && resolveDiscussedVehicleFromHistory(history)) return true;
    return false;
}

function customerConfirmedPictureOffer(customerText, history = []) {
    if (!/\b(yes|yeah|yep|please|proceed|ok|sure|go ahead)\b/i.test(String(customerText || ""))) return false;
    const lastAssistant = [...(history || [])].reverse().find((h) => h.role === "assistant");
    return Boolean(lastAssistant && /\b(pictures?|photos?|images?)\b/i.test(String(lastAssistant.content || "")));
}

/**
 * Last vehicle Sarah or the customer named in recent thread (e.g. before "Yes I want to" for photos).
 * @param {{ role?: string, content?: string }[]} [history]
 * @returns {string|null}
 */
export function resolveDiscussedVehicleFromHistory(history = []) {
    const reversed = [...(history || [])].reverse();
    for (const h of reversed) {
        const content = String(h?.content || "");
        const title = parsePrimaryVehicleTitleFromReply(content);
        if (title && /\b(19|20)\d{2}\b/.test(title)) return title;
        const m = content.match(/\b(\d{4})\s+(Ford|Toyota|Volkswagen|VW|BMW|Honda|Hyundai|Kia|Chery|Haval)\s+([\w\s./-]{2,50})/i);
        if (m) return `${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, " ").trim();
        const bold = content.match(/\*\*(\d{4}\s+[^*\n]{8,90})\*\*/);
        if (bold) return bold[1].replace(/\*\*/g, "").trim();
    }
    for (const h of reversed) {
        if (h.role !== "user") continue;
        const text = String(h.content || "");
        const named = text.match(
            /\b(?:try again on|interested in|pics? of|photos? of|the)\s+(Ford\s+Everest|Everest|Ford\s+[\w]+)\b/i
        );
        if (named) return named[1];
    }
    return null;
}

/**
 * Narrow model hints to the current ask (avoid stale Focus etc. from old thread).
 */
export function extractActiveVehicleHints(customerText, reply = "", history = []) {
    const assistantTurns = (history || [])
        .filter((h) => h.role === "assistant")
        .slice(-3)
        .map((h) => String(h.content || ""));
    const userTurns = (history || [])
        .filter((h) => h.role === "user")
        .slice(-4)
        .map((h) => String(h.content || ""));
    const discussed = resolveDiscussedVehicleFromHistory(history);
    const parts = [String(customerText || ""), String(reply || ""), discussed || "", ...assistantTurns, ...userTurns];
    const blob = parts.join(" ").toLowerCase();
    const hints = [];
    for (const model of MODEL_HINTS) {
        if (blob.includes(model)) hints.push(model);
    }
    if (/\bford\b/.test(blob) && blob.includes("everest")) hints.push("ford");
    return [...new Set(hints)];
}

/**
 * @param {string} reply
 * @returns {string|null}
 */
export function parsePrimaryVehicleTitleFromReply(reply) {
    const raw = String(reply || "");
    const patterns = [
        /\b(?:suggest|recommend)(?:ing)?\s+(?:the\s+)?(\d{4}\s+[A-Za-z][\w\s./-]{4,70}?)(?:\s+based|\s+for|\s+—|,|\.|$)/i,
        /\*\*(\d{4}\s+[^*\n]+)\*\*/,
        /\b(\d{4}\s+(?:Ford|Toyota|Volkswagen|VW|BMW|Honda|Hyundai|Kia|Chery|Haval)\s+[\w\s./-]{2,50})/i,
    ];
    for (const re of patterns) {
        const m = raw.match(re);
        if (m?.[1]) {
            const title = m[1].replace(/\*\*/g, "").trim();
            if (title.length >= 8) return title;
        }
    }
    return null;
}

/**
 * @param {object[]} pool
 * @param {string} fragment
 * @returns {object|null}
 */
export function findVehicleByTitleFragment(pool, fragment) {
    const frag = String(fragment || "").toLowerCase();
    const tokens = frag
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2);
    if (!tokens.length) return null;
    const modelAnchors = MODEL_HINTS.filter((m) => frag.includes(m));
    let best = null;
    let bestScore = 0;
    for (const v of pool || []) {
        const title = normalizeVehicleDisplayTitle(formatVehicleTitle(v) || "").toLowerCase();
        if (modelAnchors.length && !modelAnchors.some((m) => title.includes(m))) continue;
        for (const m of modelAnchors) {
            if (frag.includes(m) && title.includes("focus") && m === "everest") continue;
        }
        const score = tokens.filter((t) => title.includes(t)).length;
        if (score > bestScore) {
            bestScore = score;
            best = v;
        }
    }
    const need = modelAnchors.length === 1 ? 1 : modelAnchors.length ? Math.max(2, modelAnchors.length) : 2;
    return bestScore >= need ? best : null;
}

/**
 * @param {string} text
 * @returns {number|null}
 */
export function parseRequestedVehicleMediaCount(text) {
    const raw = String(text || "").toLowerCase();
    if (/\b(?:both|the two)\b/.test(raw)) return 2;
    const m = raw.match(/\b(\d{1,2})\s+(?:vehicle|car|cars|suv|suvs|everest|everests|photo|photos|pic|pics)\b/);
    if (m) return Math.min(12, parseInt(m[1], 10) || 2);
    return null;
}

/**
 * @param {string} customerText
 * @param {{ role?: string, content?: string }[]} [history]
 * @returns {string[]}
 */
export function extractVehicleSearchHints(customerText, history = []) {
    const parts = [String(customerText || "")];
    for (const h of (history || []).slice(-10)) {
        if (h?.content) parts.push(String(h.content));
    }
    const blob = parts.join(" ").toLowerCase();
    const hints = [];
    for (const model of MODEL_HINTS) {
        if (blob.includes(model)) hints.push(model);
    }
    if (/\bford\b/.test(blob) && !hints.includes("everest") && blob.includes("everest")) {
        hints.push("ford");
    }
    return [...new Set(hints)];
}

/**
 * @param {object} vehicle
 * @param {string[]} hints
 */
export function vehicleMatchesHints(vehicle, hints) {
    if (!hints?.length) return true;
    const title = normalizeVehicleDisplayTitle(formatVehicleTitle(vehicle) || "").toLowerCase();
    return hints.some((h) => title.includes(h));
}

/**
 * Decide which stock rows to photograph and how many — avoids dumping the whole showroom.
 * @param {string} customerText
 * @param {{ role?: string, content?: string }[]} [history]
 * @param {object[]} [recommendedVehicles]
 * @param {object[]} [toolVehicles]
 */
function referencesAssistantSuggestions(text) {
    return /\b(you suggested|you recommended|suggested for me|you mentioned)\b/i.test(String(text || ""));
}

export function planVehicleMediaSelection(customerText, history = [], recommendedVehicles = [], toolVehicles = []) {
    const fromGalleryIntent = resolveGalleryVehicleTargets(customerText, null, recommendedVehicles);
    if (fromGalleryIntent.length) {
        return {
            vehicles: fromGalleryIntent,
            limit: fromGalleryIntent.length,
            searchQuery: "",
            hints: extractVehicleSearchHints(customerText, history),
            skipBroadSearch: true,
        };
    }

    const hints = extractVehicleSearchHints(customerText, history);
    const explicitCount = parseRequestedVehicleMediaCount(customerText);
    const limit = explicitCount ?? (hints.length ? Math.min(3, 4) : 4);

    if (referencesAssistantSuggestions(customerText) && recommendedVehicles.length) {
        let pool = recommendedVehicles;
        if (hints.length) {
            const filtered = pool.filter((v) => vehicleMatchesHints(v, hints));
            if (filtered.length) pool = filtered;
        }
        const cap = explicitCount ?? pool.length;
        if (pool.length) {
            return {
                vehicles: pool.slice(0, cap),
                limit: Math.min(cap, pool.length),
                searchQuery: "",
                hints,
                skipBroadSearch: true,
            };
        }
    }

    let pool = Array.isArray(toolVehicles) ? [...toolVehicles] : [];
    if (hints.length && pool.length) {
        const filtered = pool.filter((v) => vehicleMatchesHints(v, hints));
        if (filtered.length) pool = filtered;
    }

    let searchQuery = hints.join(" ").trim();
    if (!searchQuery) {
        searchQuery = String(customerText || "")
            .replace(/\b(?:pics?|photos?|images?|pictures|show me|see|send)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    const promisedBody = detectInventoryBodyTypeFilter(customerText);
    return {
        vehicles: pool,
        limit,
        searchQuery,
        hints,
        skipBroadSearch: Boolean(hints.length || explicitCount || promisedBody),
        promisedBodyType: promisedBody,
    };
}

/**
 * Remove invented catalog prose the model must not send in Sarah App.
 * @param {string} text
 */
const DEFERRED_DELIVERY_RE =
    /\b(just a moment|just a sec|hang on|wait while|i'?ll send (you )?(the )?(details|photos|images|info)|i will send|you'?ll see (them|the photos|shortly)|details (are coming|will follow)|give me a (moment|second))\b/i;

/**
 * @param {string} text
 */
export function replyDefersDelivery(text) {
    return DEFERRED_DELIVERY_RE.test(String(text || ""));
}

/**
 * Remove "I'll send shortly" style lines the app cannot fulfill in a second message.
 * @param {string} text
 */
export function stripDeferredDeliveryPhrases(text) {
    let out = String(text || "");
    out = out.replace(/[^\n]*\b(just a moment|wait while|i'?ll send (you )?the details)[^.!?\n]*[.!?]?\s*/gi, "");
    out = out.replace(/[^\n]*\b(you'?ll see (them|the photos) shortly)[^.!?\n]*[.!?]?\s*/gi, "");
    return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sarah App — attach showroom media when the model discussed stock or used inventory tools.
 * @param {string} reply
 * @param {string} customerText
 * @param {object[]} [toolResults]
 * @param {object[]} [history]
 */
export function automotiveReplyNeedsMedia(reply, customerText, toolResults = [], history = []) {
    if (customerWantsVehicleMedia(customerText, reply, history)) return true;
    if (replyDefersDelivery(reply)) return true;
    return false;
}

export function stripLlmCatalogHallucinations(text) {
    let out = String(text || "");
    out = out.replace(/^\s*Model\s+[A-Z]\s*:.+$/gim, "");
    out = out.replace(/^\s*[-*]\s*Model\s+[A-Z]\s*:.+$/gim, "");
    out = out.replace(/\*\*Model\s+[A-Z]:\*\*[^\n]*/gim, "");
    out = out.replace(/^\s*\d+\.\s*\*\*Model\s+[A-Z]:\*\*[^\n]*/gim, "");
    out = out.replace(/\bModel\s+[A-Z]\b/gi, "");
    out = out.replace(/I will now attach.+$/gim, "");
    out = out.replace(/(?:images?|photos?).*(?:attached|shortly).+$/gim, "");
    out = out.replace(/I'll now attach.+$/gim, "");
    out = out.replace(/images? of our SUVs will be attached.+$/gim, "");
    out = out.replace(/Feel free to take a look.+$/gim, "");
    return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Platform-owned showroom reply (skips free-form catalog prose from the model).
 * @param {string} companyId
 * @param {string} customerText
 * @param {object[]} [prefetchedVehicles]
 */
export async function buildDirectShowroomMediaReply(companyId, customerText, prefetchedVehicles = [], enrichOptions = {}) {
    return enrichCompanySarahReplyWithVehicleMedia(companyId, customerText, "", {
        toolVehicles: prefetchedVehicles,
        force: true,
        ...enrichOptions,
    });
}

/**
 * @param {string} customerText
 * @param {string} [companyName]
 */
export function buildShowroomIntro(customerText, companyName = "our showroom", vehicleCount = 0) {
    const lower = String(customerText || "").toLowerCase();
    if (/\beverest/.test(lower) && vehicleCount <= 2) {
        return `Here ${vehicleCount === 1 ? "is the Ford Everest" : "are the Ford Everest options"} you asked about:`;
    }
    if (/\bsuvs?\b/.test(lower) && !/\beverest|ranger|fortuner\b/.test(lower)) {
        return `Here are SUVs we currently have in stock at ${companyName}:`;
    }
    if (/\bsedans?\b/.test(lower)) return `Here are sedans we currently have in stock:`;
    if (/\b(truck|bakkie|pickup)s?\b/.test(lower)) return `Here are bakkies and trucks we currently have in stock:`;
    if (GALLERY_INTENT.test(lower)) return `Here are photos from our current stock at ${companyName}:`;
    return vehicleCount === 1 ? `Here is the vehicle you asked about:` : `Here are the vehicles you asked about:`;
}

/**
 * @param {string} reply
 */
export function replyContainsMarkdownImages(reply) {
    return MARKDOWN_IMAGE_TEST.test(String(reply || ""));
}

function bodyTypeLabel(vehicle) {
    const raw =
        vehicle?.bodyType ||
        vehicle?.metadata?.bodyType ||
        vehicle?.category ||
        vehicle?.vehicleType ||
        "";
    const label = String(raw).trim();
    if (!label) return "Available";
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * @param {object[]} vehicles
 */
function groupByBodyType(vehicles) {
    /** @type {Map<string, object[]>} */
    const groups = new Map();
    for (const vehicle of vehicles) {
        const key = bodyTypeLabel(vehicle);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(vehicle);
    }
    return groups;
}

/**
 * @param {object[]} vehicles
 * @param {number} [perGroup]
 */
export function buildSarahAppVehicleMarkdownGallery(vehicles, perGroup = 3) {
    const withImages = (vehicles || []).filter((v) => getSarahAppVehicleImageUrls(v).length);
    if (!withImages.length) return "";

    const groups = groupByBodyType(withImages);
    const sections = [];
    let index = 0;

    for (const [bodyType, list] of groups) {
        index += 1;
        sections.push(`**${index}. ${bodyType}:**`);
        for (const vehicle of list.slice(0, perGroup)) {
            const title = normalizeVehicleDisplayTitle(formatVehicleTitle(vehicle) || bodyType);
            const url = pickBestSarahAppVehicleImageUrl(vehicle);
            if (url) sections.push(`![${title}](${url})`);
        }
    }

    return sections.join("\n\n");
}

/**
 * @param {object[]} vehicles
 * @param {number} [limit]
 */
export function buildSarahAppMediaAttachments(vehicles, limit = 9) {
    const items = [];
    for (const vehicle of vehicles || []) {
        const urls = getSarahAppVehicleImageUrls(vehicle);
        if (!urls.length) continue;
        items.push({
            kind: "image",
            url: urls[0],
            alternateUrls: urls.slice(1, 4),
            name: normalizeVehicleDisplayTitle(formatVehicleTitle(vehicle) || "Vehicle"),
            mimeType: "image/jpeg",
        });
        if (items.length >= limit) break;
    }
    return items;
}

/**
 * Discover listing gallery fallback when inventory search returns no images.
 * @param {string} companyId
 */
export async function loadDirectoryShowroomMedia(companyId) {
    await hydrateBusinessDirectory();
    const entry = getBusinessDirectoryEntry(companyId);
    let gallery = Array.isArray(entry?.gallery) ? entry.gallery : [];
    if (!gallery.length) {
        const cards = await listDiscoverCards();
        const card = cards.find((c) => c.companyId === companyId);
        gallery = Array.isArray(card?.gallery) ? card.gallery : [];
    }
    const displayName = entry?.displayName || "Showroom";
    const attachments = gallery
        .map((row, index) => {
            const imageUrl = String(row?.imageUrl || "").trim();
            if (!isSarahAppDisplayableImageUrl(imageUrl)) return null;
            return {
                kind: "image",
                url: imageUrl,
                name: row?.caption ? String(row.caption).slice(0, 160) : `${displayName} ${index + 1}`,
                mimeType: "image/jpeg",
            };
        })
        .filter(Boolean)
        .slice(0, 8);
    const markdown = attachments.map((a) => `![${a.name}](${a.url})`).join("\n\n");
    return { attachments, markdown };
}

async function resolveShowroomVehicles(inventoryCompanyId, customerText, toolVehicles = [], options = {}) {
    const limit = Math.min(12, options.limit ?? 4);
    const hints = options.hints || [];
    const skipBroad = options.skipBroadSearch === true;

    let vehicles = Array.isArray(toolVehicles) ? [...toolVehicles] : [];
    if (vehicles.length >= limit) {
        return dedupeVehicles(vehicles).slice(0, limit);
    }

    const queries = [];
    const text = String(customerText || "").toLowerCase();
    const searchQuery = String(options.searchQuery || customerText || "").trim();
    const bodyType = options.promisedBodyType || detectInventoryBodyTypeFilter(customerText);

    if (searchQuery) {
        queries.push({ q: searchQuery, bodyType: bodyType || null });
    }
    if (!skipBroad) {
        if (/suv/.test(text)) queries.push({ q: "suv", bodyType: "SUV" });
        if (/sedan/.test(text)) queries.push({ q: "sedan", bodyType: "Sedan" });
        if (/truck|bakkie|pickup/.test(text)) queries.push({ q: "bakkie", bodyType: "Bakkie" });
        if (!queries.length) queries.push({ q: customerText, bodyType: bodyType || null });
        if (!hints.length && !bodyType) queries.push({ q: "", bodyType: null });
    }

    for (const { q, bodyType: bt } of queries) {
        if (vehicles.length >= limit) break;
        const filters = { limit, availabilityOnly: true };
        if (bt) filters.bodyType = bt;
        const batch = await searchInventory(inventoryCompanyId, q || "", filters);
        vehicles = [...vehicles, ...batch];
        if (hints.length) {
            vehicles = vehicles.filter((v) => vehicleMatchesHints(v, hints));
        }
        if (bodyType) {
            vehicles = filterVehiclesByBodyType(vehicles, bodyType);
        }
        if (vehicles.length >= limit) break;
    }

    let result = dedupeVehicles(vehicles).slice(0, limit);
    if (bodyType) result = filterVehiclesByBodyType(result, bodyType);
    return result;
}

function dedupeVehicles(vehicles) {
    const seen = new Set();
    return (vehicles || []).filter((v) => {
        const key = v?.vehicleId || v?.stockNumber;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Attach real inventory images to Company Sarah replies (Sarah App rich-text renderer).
 * @param {string} companyId
 * @param {string} customerMessage
 * @param {string} llmReply
 * @param {object} [options]
 * @param {object[]} [options.toolVehicles]
 */
export async function enrichCompanySarahReplyWithVehicleMedia(
    companyId,
    customerMessage,
    llmReply,
    options = {}
) {
    const customerText = String(customerMessage || "").trim();
    const reply = String(llmReply || "").trim();
    if (!companyId) return { content: reply, attachments: [] };

    const inventoryCompanyId = resolveSarahAppInventoryCompanyId(companyId);
    const scrubbed = scrubInvalidMarkdownImages(reply);
    let content = stripLlmCatalogHallucinations(scrubbed.text);

    if (isNonVehicleStockTurn(customerText, content)) {
        return { content: stripWhatsAppImageUrlsFromText(content || reply), attachments: [] };
    }

    const shouldEnrich =
        options.force === true && customerWantsVehicleMedia(customerText, content, options.history || []);

    if (!shouldEnrich) {
        const cleaned = stripWhatsAppImageUrlsFromText(content || reply);
        return { content: cleaned, attachments: [] };
    }

    const history = options.history || [];
    const discussedTitle = resolveDiscussedVehicleFromHistory(history);
    const activeHints = extractActiveVehicleHints(customerText, content, history);
    const mediaPlan = options.mediaPlan ||
        planVehicleMediaSelection(customerText, history, options.recommendedVehicles || [], options.toolVehicles || []);
    if (activeHints.length) {
        mediaPlan.hints = activeHints;
        mediaPlan.skipBroadSearch = true;
    }
    const promisedBody = resolvePromisedBodyType(customerText, content, history);
    const listMentions = parseVehicleLinesFromReply(content);
    const mediaLimit = listMentions.length || mediaPlan.limit;

    if (discussedTitle && !listMentions.length) {
        mediaPlan.searchQuery = discussedTitle;
        mediaPlan.hints = extractActiveVehicleHints(discussedTitle, "", history);
        mediaPlan.skipBroadSearch = true;
        mediaPlan.limit = 1;
    }

    const fromTools = extractSearchInventoryVehicles(options.toolResults || []);
    let seedVehicles = fromTools.length
        ? fromTools
        : mediaPlan.vehicles?.length
          ? mediaPlan.vehicles
          : options.toolVehicles || [];
    if (promisedBody) seedVehicles = filterVehiclesByBodyType(seedVehicles, promisedBody);

    let vehicles = await resolveShowroomVehicles(inventoryCompanyId, customerText, seedVehicles, {
        limit: discussedTitle && !listMentions.length ? 1 : mediaLimit,
        hints: mediaPlan.hints,
        searchQuery: mediaPlan.searchQuery || (promisedBody ? promisedBody : ""),
        skipBroadSearch: mediaPlan.skipBroadSearch || Boolean(promisedBody || discussedTitle),
        promisedBodyType: promisedBody,
    });

    if (discussedTitle && !listMentions.length) {
        const queries = [
            discussedTitle,
            ...extractActiveVehicleHints(discussedTitle, "", history).map((h) => `Ford ${h}`),
            ...extractActiveVehicleHints(discussedTitle, "", history),
        ].filter(Boolean);
        const seenQ = new Set();
        for (const q of queries) {
            const key = String(q).toLowerCase();
            if (seenQ.has(key)) continue;
            seenQ.add(key);
            const direct = await searchInventory(inventoryCompanyId, q, {
                limit: 8,
                availabilityOnly: true,
            });
            const picked =
                findVehicleByTitleFragment(direct, discussedTitle) ||
                findVehicleByTitleFragment([...direct, ...vehicles], discussedTitle);
            if (picked) {
                vehicles = [picked];
                break;
            }
        }
    }
    vehicles = matchVehiclesToReplyOrder(content, vehicles);
    if (promisedBody) vehicles = filterVehiclesByBodyType(vehicles, promisedBody);

    if (activeHints.length) {
        const filtered = vehicles.filter((v) => vehicleMatchesHints(v, activeHints));
        if (filtered.length) vehicles = filtered;
    }

    let singleVehicleLimit = discussedTitle && !listMentions.length ? 1 : mediaLimit;
    if (!listMentions.length && vehicles.length > 1) {
        const primaryTitle = parsePrimaryVehicleTitleFromReply(content) || discussedTitle;
        const primary =
            (primaryTitle && findVehicleByTitleFragment(vehicles, primaryTitle)) ||
            (activeHints.length === 1 && vehicles.find((v) => vehicleMatchesHints(v, activeHints))) ||
            null;
        if (primary) {
            vehicles = [primary];
            singleVehicleLimit = 1;
        } else if (
            /\b(interested in|that one|this one)\b/i.test(customerText) &&
            vehicles.length > 1 &&
            activeHints.length
        ) {
            vehicles = vehicles.filter((v) => vehicleMatchesHints(v, activeHints)).slice(0, 1);
            singleVehicleLimit = 1;
        }
    } else if (listMentions.length === 1) {
        vehicles = vehicles.slice(0, 1);
        singleVehicleLimit = 1;
    }

    let attachments = await buildSarahAppMediaAttachmentsForReply(vehicles, singleVehicleLimit);
    if (!attachments.length && vehicles.length) {
        attachments = buildSarahAppMediaAttachments(vehicles, singleVehicleLimit);
    }
    let gallery = attachments.map((a) => `![${a.name}](${a.url})`).join("\n\n");
    if (
        !gallery &&
        !attachments.length &&
        wantsSarahAppVehicleGallery(customerText) &&
        !activeHints.length &&
        !fromTools.length
    ) {
        for (const dirId of [companyId, inventoryCompanyId]) {
            const dir = await loadDirectoryShowroomMedia(dirId);
            if (dir.attachments.length) {
                attachments = dir.attachments;
                gallery = dir.markdown;
                break;
            }
        }
    }

    if (!gallery && !attachments.length) {
        content = stripWhatsAppImageUrlsFromText(content || reply);
        return { content, attachments: [] };
    }

    const companyLabel =
        getBusinessDirectoryEntry(companyId)?.displayName ||
        getBusinessDirectoryEntry(inventoryCompanyId)?.displayName ||
        "our showroom";

    const figureMd = attachments.map((a) => `![${a.name}](${a.url})`).join("\n\n");
    const vehicleLabel =
        discussedTitle ||
        (vehicles[0] && normalizeVehicleDisplayTitle(formatVehicleTitle(vehicles[0]))) ||
        "";
    const intro = vehicleLabel
        ? `Here is the ${vehicleLabel}:`
        : buildShowroomIntro(customerText, companyLabel, attachments.length || vehicles.length);

    if (attachments.length) {
        content = figureMd ? `${intro}\n\n${figureMd}`.trim() : intro;
    } else if (!intro) {
        content = gallery
            ? `Here are photos from our current stock:\n\n${gallery}`
            : "Here are photos from our current stock.";
    } else if (gallery) {
        content = `${intro}\n\n${gallery}`.trim();
    } else {
        content = intro;
    }

    return { content, attachments };
}
