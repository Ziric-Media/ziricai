/**
 * SNET-05 — Network Search Service: provider interface + Stage-A in-process provider.
 *
 * Stage A (now): the durable `businessDirectory` (Firestore, hydrated into the process) IS the index and is
 * scored in-process by `networkSearchScoring`. Stage B (Typesense/Algolia, SNET-00 §6.2 triggers) plugs in by
 * implementing the same interface and calling `setSearchProvider()`.
 *
 * @typedef {Object} NetworkSearchProvider
 * @property {string} name
 * @property {(opts: object) => Promise<object>} search      ranked results + facets + cursor
 * @property {(prefix: string, limit?: number) => Promise<string[]>} suggest  autocomplete labels
 * @property {(companyId: string) => Promise<void>} upsert   index hook (no-op for the directory provider)
 * @property {(companyId: string) => Promise<void>} remove
 * @property {() => Promise<{ ok: boolean, provider: string, indexed: number }>} health
 */
import { listDiscoverCards, searchDiscoverCompanies } from "../users/businessDirectoryService.js";
import { tokenize } from "./networkSearchScoring.js";

/** @type {NetworkSearchProvider} */
export const directoryProvider = {
    name: "directory-inprocess",
    search: (opts) => searchDiscoverCompanies(opts),
    async suggest(prefix, limit = 8) {
        const p = String(prefix || "").trim().toLowerCase();
        if (p.length < 2) return [];
        const cards = await listDiscoverCards();
        const out = new Set();
        for (const c of cards) {
            if (String(c.displayName).toLowerCase().startsWith(p)) out.add(c.displayName);
            for (const tag of c.tags || []) if (tag.startsWith(p)) out.add(tag);
            for (const tok of tokenize(c.industry)) if (tok.startsWith(p) && tok.length > 3) out.add(tok);
        }
        return [...out].slice(0, limit);
    },
    async upsert() {
        /* the directory is the index */
    },
    async remove() {
        /* the directory is the index */
    },
    async health() {
        const cards = await listDiscoverCards();
        return { ok: true, provider: "directory-inprocess", indexed: cards.length };
    },
};

/** @type {NetworkSearchProvider} */
let provider = directoryProvider;

export function getSearchProvider() {
    return provider;
}

/** @param {NetworkSearchProvider|null} next null restores the directory provider */
export function setSearchProvider(next) {
    provider = next || directoryProvider;
}

/** @param {object} opts see searchDiscoverCompanies */
export function searchNetwork(opts) {
    return provider.search(opts);
}
