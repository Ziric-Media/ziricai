/**
 * Phase 2.0 — Mission Control "Search administration": Discover categories + search synonyms.
 *
 * The shipped defaults live in networkTaxonomy.js. A Search Admin (platform role `search_admin`, Super Admin, or the
 * platform API key) can replace the category list and/or the synonym map; the override is persisted in
 * `networkSearchConfig/config` and applied in-process through `setTaxonomyOverride()` (so ranking, facets, profile
 * category validation and the Portal category picker all follow it). Every change is audited.
 *
 * Multi-replica note: each replica re-reads the document at most every CONFIG_TTL_MS, so an edit reaches every
 * replica within that window; the editing replica applies it immediately.
 */
import { NETWORK_COLLECTIONS } from "../database/schema.js";
import { createNetworkCollection } from "./networkCollectionStore.js";
import { recordNetworkAdminAction } from "./networkAdminAudit.js";
import { DISCOVER_CATEGORIES, SEARCH_SYNONYMS, getTaxonomyOverride, setTaxonomyOverride } from "./networkTaxonomy.js";

const col = createNetworkCollection(NETWORK_COLLECTIONS.SEARCH_CONFIG);
const DOC_ID = "config";
export const CONFIG_TTL_MS = 30_000;

export const SEARCH_CONFIG_LIMITS = Object.freeze({
    maxCategories: 24,
    maxKeywordsPerCategory: 40,
    maxSynonymTerms: 200,
    maxSynonymsPerTerm: 15,
});

let loadedAt = 0;
let version = 0;
let meta = { updatedAt: null, updatedBy: null };

function err(status, code, message, fields) {
    return Object.assign(new Error(message), { status, code, ...(fields ? { fields } : {}) });
}

const cleanWord = (s) =>
    String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

/** Validate a category list → normalised copy (throws 422 with `fields`). */
export function validateCategories(input) {
    if (!Array.isArray(input) || !input.length) throw err(422, "SEARCH_CONFIG_INVALID", "categories must be a non-empty list.", { categories: "required" });
    if (input.length > SEARCH_CONFIG_LIMITS.maxCategories) {
        throw err(422, "SEARCH_CONFIG_INVALID", `At most ${SEARCH_CONFIG_LIMITS.maxCategories} categories.`, { categories: "too many" });
    }
    const seen = new Set();
    return input.map((raw, i) => {
        const id = cleanWord(raw?.id);
        const label = String(raw?.label || "").trim();
        if (!/^[a-z][a-z0-9_-]{1,23}$/.test(id)) throw err(422, "SEARCH_CONFIG_INVALID", `Category #${i + 1}: id must be 2-24 chars (a-z, 0-9, - _).`, { [`categories[${i}].id`]: id });
        if (seen.has(id)) throw err(422, "SEARCH_CONFIG_INVALID", `Duplicate category id "${id}".`, { [`categories[${i}].id`]: "duplicate" });
        seen.add(id);
        if (!label || label.length > 30) throw err(422, "SEARCH_CONFIG_INVALID", `Category "${id}": label is required (max 30).`, { [`categories[${i}].label`]: "required" });
        const keywords = [...new Set((Array.isArray(raw?.keywords) ? raw.keywords : String(raw?.keywords || "").split(",")).map(cleanWord).filter(Boolean))];
        if (keywords.length > SEARCH_CONFIG_LIMITS.maxKeywordsPerCategory) throw err(422, "SEARCH_CONFIG_INVALID", `Category "${id}": too many keywords.`, { [`categories[${i}].keywords`]: "too many" });
        if (keywords.some((k) => k.length < 2 || k.length > 30)) throw err(422, "SEARCH_CONFIG_INVALID", `Category "${id}": keywords must be 2-30 characters.`, { [`categories[${i}].keywords`]: "length" });
        return { id, label, keywords };
    });
}

/** Validate a synonym map `{ term: [stems] }` → normalised copy (throws 422). */
export function validateSynonyms(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw err(422, "SEARCH_CONFIG_INVALID", "synonyms must be an object of term → list.", { synonyms: "object" });
    const terms = Object.keys(input);
    if (terms.length > SEARCH_CONFIG_LIMITS.maxSynonymTerms) throw err(422, "SEARCH_CONFIG_INVALID", `At most ${SEARCH_CONFIG_LIMITS.maxSynonymTerms} synonym terms.`, { synonyms: "too many" });
    const out = {};
    for (const rawTerm of terms) {
        const term = cleanWord(rawTerm);
        if (!/^[a-z0-9][a-z0-9 -]{1,29}$/.test(term)) throw err(422, "SEARCH_CONFIG_INVALID", `Synonym term "${rawTerm}" must be 2-30 chars (a-z, 0-9, space, -).`, { [`synonyms.${rawTerm}`]: "term" });
        const values = Array.isArray(input[rawTerm]) ? input[rawTerm] : String(input[rawTerm] || "").split(",");
        const list = [...new Set(values.map(cleanWord).filter(Boolean))];
        if (!list.length || list.length > SEARCH_CONFIG_LIMITS.maxSynonymsPerTerm || list.some((s) => s.length < 2 || s.length > 40)) {
            throw err(422, "SEARCH_CONFIG_INVALID", `Synonym "${term}": give 1-${SEARCH_CONFIG_LIMITS.maxSynonymsPerTerm} related words (2-40 chars).`, { [`synonyms.${rawTerm}`]: "values" });
        }
        out[term] = list;
    }
    return out;
}

function apply(doc) {
    setTaxonomyOverride(doc ? { categories: doc.categories || null, synonyms: doc.synonyms || null } : null);
    version = Number(doc?.version || 0);
    meta = { updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || null };
}

/** Load the persisted override into the in-process taxonomy (cached for CONFIG_TTL_MS). */
export async function hydrateSearchConfig({ force = false } = {}) {
    if (!force && Date.now() - loadedAt < CONFIG_TTL_MS) return;
    loadedAt = Date.now();
    try {
        apply(await col.get(DOC_ID));
    } catch (e) {
        // A read failure must never take Discover down: keep whatever is already applied.
        console.warn("[searchConfig] hydrate failed:", e.message);
    }
}

/** Admin view: effective lists + whether each part is overridden. */
export async function getSearchConfig() {
    await hydrateSearchConfig({ force: true });
    const o = getTaxonomyOverride();
    return {
        categories: o.categories || DISCOVER_CATEGORIES.map((c) => ({ id: c.id, label: c.label, keywords: [...c.keywords] })),
        synonyms: o.synonyms || Object.fromEntries(Object.entries(SEARCH_SYNONYMS).map(([k, v]) => [k, [...v]])),
        overridden: { categories: Boolean(o.categories), synonyms: Boolean(o.synonyms) },
        limits: SEARCH_CONFIG_LIMITS,
        version,
        ...meta,
    };
}

/**
 * Replace categories and/or synonyms. Omitted parts keep their current value.
 * @param {{ categories?: object[], synonyms?: object }} patch
 * @param {string} actor
 */
export async function updateSearchConfig(patch = {}, actor = "unknown") {
    if (patch.categories === undefined && patch.synonyms === undefined) {
        throw err(422, "SEARCH_CONFIG_INVALID", "Provide categories and/or synonyms.");
    }
    await hydrateSearchConfig({ force: true });
    const current = getTaxonomyOverride();
    const next = {
        categories: patch.categories !== undefined ? validateCategories(patch.categories) : current.categories,
        synonyms: patch.synonyms !== undefined ? validateSynonyms(patch.synonyms) : current.synonyms,
        version: version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: String(actor || "unknown"),
        schemaVersion: 1,
    };
    await col.put(DOC_ID, next, { merge: false });
    apply(next);
    loadedAt = Date.now();
    await recordNetworkAdminAction({
        actor,
        action: "search.config_update",
        detail: {
            version: next.version,
            categories: patch.categories !== undefined ? next.categories.map((c) => c.id) : undefined,
            synonymTerms: patch.synonyms !== undefined ? Object.keys(next.synonyms).length : undefined,
        },
    });
    return getSearchConfig();
}

/** Drop the override and return to shipped defaults. */
export async function resetSearchConfig(actor = "unknown") {
    await col.remove(DOC_ID);
    apply(null);
    loadedAt = Date.now();
    await recordNetworkAdminAction({ actor, action: "search.config_reset", detail: {} });
    return getSearchConfig();
}

export function clearSearchConfigForTests() {
    col.clearMemory();
    setTaxonomyOverride(null);
    loadedAt = 0;
    version = 0;
    meta = { updatedAt: null, updatedBy: null };
}
