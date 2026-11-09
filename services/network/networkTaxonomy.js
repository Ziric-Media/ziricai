/**
 * SNET-01b — Discover category taxonomy + search synonyms (code-defined MVP).
 *
 * Category ids match the Sarah App Discover tabs. Audit §6.3 says facets should eventually come from the
 * Industry Preset Library; until MC "Search administration" (spec §13) exists this is the single place to extend.
 */

export const DISCOVER_CATEGORIES = Object.freeze([
    { id: "health", label: "Health", keywords: ["health", "dental", "dentist", "clinic", "medical", "hospital", "pharmacy", "doctor", "physio", "optometr"] },
    { id: "food", label: "Food", keywords: ["food", "restaurant", "cafe", "coffee", "bakery", "catering", "takeaway", "bistro", "eatery"] },
    { id: "fitness", label: "Fitness", keywords: ["fitness", "gym", "yoga", "hiit", "pilates", "sport", "wellness", "spa"] },
    { id: "market", label: "Market", keywords: ["market", "retail", "grocery", "groceries", "shop", "store", "produce", "supermarket"] },
    { id: "auto", label: "Auto", keywords: ["auto", "automotive", "motor", "motors", "vehicle", "car", "dealership", "mechanic", "garage", "tyre"] },
    { id: "education", label: "Education", keywords: ["school", "college", "university", "education", "tutor", "training", "academy"] },
    { id: "professional", label: "Professional", keywords: ["legal", "lawyer", "attorney", "accountant", "accounting", "consult", "insurance", "finance", "financial"] },
    { id: "community", label: "Community", keywords: ["church", "ministry", "ngo", "charity", "foundation", "community", "association", "club", "non-profit"] },
]);

/* ---- Phase 2.0: Mission Control search administration -------------------------------------------------------
 * The constants above are the shipped DEFAULTS. A Search Admin can override categories and/or synonyms in Mission
 * Control; the persisted override is loaded by searchConfigService and applied here. All readers call the getters
 * (getCategories / getSynonyms) so an edit takes effect without a deploy. `null` override = shipped defaults. */
let override = { categories: null, synonyms: null };

/** @param {{ categories?: object[]|null, synonyms?: object|null }|null} next null restores shipped defaults */
export function setTaxonomyOverride(next) {
    override = { categories: next?.categories || null, synonyms: next?.synonyms || null };
}

export function getTaxonomyOverride() {
    return override;
}

export function getCategories() {
    return override.categories || DISCOVER_CATEGORIES;
}

export function getSynonyms() {
    return override.synonyms || SEARCH_SYNONYMS;
}

/** Query-time synonym expansion (lower-case token → related stems). */
export const SEARCH_SYNONYMS = Object.freeze({
    dentist: ["dental", "dentist", "teeth", "orthodont", "smile"],
    dental: ["dental", "dentist", "teeth"],
    doctor: ["clinic", "medical", "doctor", "health"],
    plumber: ["plumb", "pipe", "drain", "leak", "geyser"],
    plumbing: ["plumb", "pipe", "drain", "leak"],
    restaurant: ["restaurant", "bistro", "dining", "brunch", "eatery", "food"],
    cafe: ["cafe", "coffee", "espresso", "latte"],
    coffee: ["coffee", "cafe", "espresso"],
    gym: ["fitness", "hiit", "yoga", "strength", "studio", "gym"],
    fitness: ["fitness", "hiit", "yoga", "gym"],
    spa: ["spa", "massage", "wellness", "facial"],
    vegan: ["vegan", "plant-based", "plant based"],
    car: ["auto", "motor", "vehicle", "dealership", "test drive", "car"],
    mechanic: ["mechanic", "garage", "auto", "service", "motor"],
    school: ["school", "college", "education", "academy"],
    church: ["church", "ministry", "community"],
    lawyer: ["legal", "lawyer", "attorney"],
    accountant: ["accountant", "accounting", "tax", "bookkeep"],
    groceries: ["market", "grocery", "groceries", "produce", "pantry"],
});

/** @param {string} id */
export function isKnownCategory(id) {
    const key = String(id || "").toLowerCase();
    return getCategories().some((c) => c.id === key);
}

/**
 * Category ids for a directory entry: explicit `entry.categories` (validated) win, else keyword match on
 * industry / description / tags.
 * @param {{ categories?: string[], industry?: string|null, shortDescription?: string|null, tags?: string[], displayName?: string|null }} entry
 * @returns {string[]}
 */
export function deriveCategories(entry) {
    const explicit = Array.isArray(entry?.categories) ? entry.categories.map((c) => String(c).toLowerCase()).filter(isKnownCategory) : [];
    if (explicit.length) return [...new Set(explicit)];
    const words = [entry?.industry, entry?.shortDescription, entry?.displayName, ...(entry?.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    // Word-level match (short keywords exact, long keywords prefix) so "healthcare" is not "car".
    // Multi-word keywords ("pet clinic") — added through Mission Control Search admin — match as a whole phrase.
    const phrases = ` ${words.join(" ")} `;
    const hit = (k) => (k.includes(" ") ? phrases.includes(` ${k.replace(/[^a-z0-9]+/g, " ").trim()} `) : words.some((w) => w === k || (k.length >= 5 && w.startsWith(k))));
    return getCategories().filter((cat) => cat.keywords.some(hit)).map((cat) => cat.id);
}
