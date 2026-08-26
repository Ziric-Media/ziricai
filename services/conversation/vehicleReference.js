/**
 * Resolve customer vehicle references ("the BMW you recommended", "the second one")
 * to stable vehicleId from conversation / sales context — never re-search by make/model alone.
 */

const VEHICLE_REFERENCE_PATTERNS = [
    /\b(?:the|that|this)\s+(?:one|vehicle|car|option)\b/i,
    /\b(?:the\s+)?(?:first|second|third|fourth|last)\s+(?:one|option|vehicle|car)\b/i,
    /\b(?:the\s+)?[\w\s-]{2,30}\s+(?:you\s+)?(?:recommended|suggested|showed|mentioned)\b/i,
    /\b(?:book|test\s*drive|drive|see|view|details?\s+(?:on|about|for))\s+(?:the\s+)?(?:bmw|hilux|fortuner|everest|x5|ranger|land\s+cruiser)/i,
    /\b(?:bmw|hilux|fortuner|everest|x5|ranger)\s+(?:you\s+)?(?:recommended|suggested)\b/i,
];

const ORDINAL_MAP = {
    first: 0,
    "1st": 0,
    second: 1,
    "2nd": 1,
    third: 2,
    "3rd": 2,
    fourth: 3,
    "4th": 3,
    last: -1,
};

const MODEL_HINTS = ["hilux", "fortuner", "everest", "x5", "x3", "ranger", "corolla", "amaze", "quest", "land cruiser", "bmw"];

const GALLERY_IMAGE_PATTERNS = [
    /\b(?:show|send|see|view|get)\s+(?:me\s+)?(?:the\s+)?(?:pictures?|photos?|images?|pics?)\b/i,
    /\b(?:pictures?|photos?|images?|pics?)\s+(?:for|of)\s+(?:both|the\s+(?:two|cars|vehicles|options)|these)\b/i,
    /\b(?:can\s+i\s+)?(?:see|get)\s+(?:photos?|pictures?|images?|pics?)\b/i,
    /\b(?:more\s+)?(?:pictures?|photos?|images?|pics?)\s+(?:please|now)?\b/i,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isGalleryImageIntent(text) {
    const raw = String(text || "").trim();
    if (!raw) return false;
    return GALLERY_IMAGE_PATTERNS.some((p) => p.test(raw));
}

function mergeRecommendedSources(salesContext, conversationRecommended = []) {
    const fromSales = salesContext?.lastRecommendedVehicles || [];
    const preferredId = salesContext?.preferredVehicleId;
    const merged = [];
    const seen = new Set();

    for (const source of [fromSales, conversationRecommended]) {
        for (const v of source || []) {
            if (!v?.vehicleId || seen.has(v.vehicleId)) continue;
            seen.add(v.vehicleId);
            merged.push(v);
        }
    }

    if (!merged.length && preferredId) {
        const pref =
            fromSales.find((v) => v.vehicleId === preferredId) ||
            conversationRecommended.find((v) => v.vehicleId === preferredId);
        if (pref) merged.push(pref);
    }

    return merged;
}

/**
 * Resolve vehicles for gallery/image requests from prior recommendations.
 * @param {string} text
 * @param {object|null|undefined} salesContext
 * @param {object[]} [conversationRecommended]
 * @returns {object[]}
 */
export function resolveGalleryVehicleTargets(text, salesContext, conversationRecommended = []) {
    if (!isGalleryImageIntent(text)) return [];

    const merged = mergeRecommendedSources(salesContext, conversationRecommended);
    if (!merged.length) return [];

    const raw = String(text || "").toLowerCase();

    if (/\b(?:both|the\s+two|these\s+(?:two|cars|vehicles|options))\b/.test(raw)) {
        return merged.slice(0, 2);
    }

    const ordinal = pickByOrdinal(merged, raw);
    if (ordinal) return [ordinal];

    for (const model of MODEL_HINTS) {
        if (raw.includes(model)) {
            const match = pickByHint(merged, model);
            if (match) return [match];
        }
    }

    if (merged.length === 1) return merged;

    return merged.slice(0, 3);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isVehicleReferenceIntent(text) {
    const raw = String(text || "").trim();
    if (!raw) return false;
    return VEHICLE_REFERENCE_PATTERNS.some((p) => p.test(raw));
}

function vehicleLabel(v) {
    return [v.title, v.label, v.make, v.model, v.stockNumber].filter(Boolean).join(" ").toLowerCase();
}

/**
 * @param {object[]} recommended — from conversation meta or salesContext.lastRecommendedVehicles
 * @param {string} hint
 * @returns {object|null}
 */
export function pickByHint(recommended, hint) {
    if (!recommended?.length || !hint) return null;
    const h = String(hint).toLowerCase();
    const matches = recommended.filter((v) => {
        const label = vehicleLabel(v);
        return label.includes(h) || h.split(/\W+/).some((t) => t.length > 2 && label.includes(t));
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return matches[0];
    return recommended.length === 1 ? recommended[0] : null;
}

/**
 * @param {object[]} recommended
 * @param {string} text
 * @returns {object|null}
 */
export function pickByOrdinal(recommended, text) {
    if (!recommended?.length) return null;
    const raw = String(text || "").toLowerCase();
    for (const [word, index] of Object.entries(ORDINAL_MAP)) {
        if (new RegExp(`\\b(?:the\\s+)?${word}\\s+(?:one|option|vehicle|car)?\\b`).test(raw)) {
            const idx = index === -1 ? recommended.length - 1 : index;
            return recommended[idx] || null;
        }
    }
    if (/\b(?:that|this)\s+one\b/i.test(raw)) {
        return recommended.length === 1 ? recommended[0] : recommended[recommended.length - 1];
    }
    return null;
}

/**
 * Resolve a vehicle reference from customer text + stored recommendations.
 * @param {string} text
 * @param {object|null|undefined} salesContext
 * @param {object[]} [conversationRecommended]
 * @returns {object|null}
 */
export function resolveVehicleReference(text, salesContext, conversationRecommended = []) {
    const merged = mergeRecommendedSources(salesContext, conversationRecommended);

    if (!merged.length) return null;

    const raw = String(text || "");

    const ordinal = pickByOrdinal(merged, raw);
    if (ordinal) return ordinal;

    for (const model of MODEL_HINTS) {
        if (raw.toLowerCase().includes(model)) {
            const match = pickByHint(merged, model);
            if (match) return match;
        }
    }

    if (/\b(?:that|this)\s+one\b/i.test(raw) && merged.length === 1) return merged[0];

    const recMatch = raw.match(
        /\b(?:the\s+)?([\w\s-]{2,40}?)\s+(?:you\s+)?(?:recommended|suggested|showed|mentioned)\b/i
    );
    if (recMatch?.[1]) {
        const match = pickByHint(merged, recMatch[1].trim());
        if (match) return match;
    }

    if (merged.length === 1 && isVehicleReferenceIntent(raw)) return merged[0];

    const preferredId = salesContext?.preferredVehicleId;
    if (preferredId) {
        const pref = merged.find((v) => v.vehicleId === preferredId);
        if (pref) return pref;
    }

    return null;
}

/**
 * Format resolved vehicle for system prompt injection.
 * @param {object} vehicle
 * @returns {string}
 */
export function formatResolvedVehicleBlock(vehicle) {
    if (!vehicle?.vehicleId) return "";
    const label = vehicle.title || vehicle.label || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    return [
        "RESOLVED VEHICLE REFERENCE (use this vehicleId for details, availability, and booking — do NOT re-search by make/model):",
        `- vehicleId: ${vehicle.vehicleId}`,
        `- stock: ${vehicle.stockNumber || "—"}`,
        `- vehicle: ${label}`,
        vehicle.price != null ? `- price: R${Number(vehicle.price).toLocaleString("en-ZA")}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}
