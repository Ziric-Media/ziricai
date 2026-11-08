/**
 * U4/U6 — public discoverability gate for Sarah Network.
 *
 * SNET-01a: the in-process map is now a read-through cache over Firestore `businessDirectory/{companyId}`
 * (Admin backend; no-op in memory mode). Sync getters are unchanged; call `hydrateBusinessDirectory()`
 * before listing so entries survive restarts / multiple replicas.
 */
import { buildPilotSeedEntries } from "../network/pilotListings.js";
import { deriveCategories, DISCOVER_CATEGORIES } from "../network/networkTaxonomy.js";
import { rankCards } from "../network/networkSearchScoring.js";
import { recordSearch } from "../network/networkSearchStats.js";
import {
    useAdminBackend,
    getDocs,
    setDoc,
    businessDirectoryDocRef,
    businessDirectoryCollectionRef,
} from "../database/firestoreClient.js";
import { ensureOrgEntitySafe } from "../network/networkIdentityService.js";

/** @type {Map<string, object>} */
const directory = new Map();
/** @type {Set<string>} companyIds seeded from env/defaults (written to the store on first hydrate if absent) */
const seeded = new Set();

const HYDRATE_TTL_MS = 60 * 1000;
let hydratedAt = 0;
let hydratePromise = null;

const firestoreDirectoryStore = {
    enabled: () => useAdminBackend(),
    async loadAll() {
        const snap = await getDocs(businessDirectoryCollectionRef());
        return snap.docs.map((d) => ({ ...d.data(), companyId: d.id }));
    },
    async save(entry) {
        // Replace each top-level field wholesale (so a cleared `draft`/`tags` map really clears) while leaving
        // fields this process doesn't know about untouched. JSON round-trip drops `undefined`.
        const clean = JSON.parse(JSON.stringify(entry));
        await setDoc(businessDirectoryDocRef(entry.companyId), clean, { mergeFields: Object.keys(clean) });
    },
};

let store = firestoreDirectoryStore;

function seedPilotCompanies() {
    for (const entry of buildPilotSeedEntries()) {
        if (!directory.has(entry.companyId)) {
            seeded.add(entry.companyId);
            directory.set(entry.companyId, entry);
        }
    }
}

const ENTITY_TTL_MS = 60 * 1000;
/** @type {Map<string, { entity: object|null, at: number }>} */
const entityCache = new Map();

/** Resolve (and idempotently mint) the SN-ID entity for a directory entry; short TTL cache. */
async function resolveEntity(entry) {
    const cached = entityCache.get(entry.companyId);
    if (cached && Date.now() - cached.at < ENTITY_TTL_MS) return cached.entity;
    const entity = await ensureOrgEntitySafe(entry.companyId, {
        displayName: entry.displayName,
        status: entry.discoverability === "public" ? "listed" : "draft",
    });
    entityCache.set(entry.companyId, { entity, at: Date.now() });
    return entity;
}

/** Drop the cached entity (call after suspend / reinstate / publish). */
export function invalidateDirectoryEntity(companyId) {
    if (companyId) entityCache.delete(companyId);
    else entityCache.clear();
}

seedPilotCompanies();

async function persistEntry(entry, { strict = false } = {}) {
    try {
        if (store.enabled()) await store.save(entry);
    } catch (err) {
        console.warn("[businessDirectoryService] Firestore write failed:", err.message);
        if (strict) throw err;
    }
    await ensureOrgEntitySafe(entry.companyId, {
        displayName: entry.displayName,
        status: entry.discoverability === "public" ? "listed" : "draft",
    });
}

/**
 * Load durable entries into the cache (stored values win over seeds) and persist any seed not yet stored.
 * Throttled by TTL; pass `force` to bypass. Never throws — falls back to the cache on store errors.
 * @param {{ force?: boolean }} [opts]
 */
export async function hydrateBusinessDirectory({ force = false } = {}) {
    if (!store.enabled()) return;
    if (!force && Date.now() - hydratedAt < HYDRATE_TTL_MS) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
        try {
            const stored = await store.loadAll();
            const storedIds = new Set();
            for (const entry of stored) {
                storedIds.add(entry.companyId);
                directory.set(entry.companyId, { ...(directory.get(entry.companyId) || {}), ...entry });
            }
            for (const companyId of seeded) {
                if (!storedIds.has(companyId)) await persistEntry(directory.get(companyId));
            }
            hydratedAt = Date.now();
        } catch (err) {
            console.warn("[businessDirectoryService] hydrate failed:", err.message);
        } finally {
            hydratePromise = null;
        }
    })();
    return hydratePromise;
}

/**
 * @param {string} companyId
 */
export function getBusinessDirectoryEntry(companyId) {
    return directory.get(companyId) || null;
}

/**
 * Public Discover list (durable store → cache). Call `hydrateBusinessDirectory()` first.
 * @returns {object[]}
 */
export function listPublicBusinessDirectoryEntries() {
    return [...directory.values()]
        .filter((e) => e.discoverability === "public")
        .sort((a, b) => String(a.displayName || a.companyId).localeCompare(String(b.displayName || b.companyId)));
}

/**
 * What the badge means: state + what was actually checked (spec §12 — a badge must explain itself).
 * Legacy entries marked `verified` without a case are shown as operator-attested pilots, never as "registry checked".
 */
export function verificationBadge(entry) {
    if (entry.verificationSummary?.state) {
        const s = entry.verificationSummary;
        return { state: s.state, checks: s.checks || [], source: s.source || "verification_case", verifiedAt: s.verifiedAt || null };
    }
    if (entry.verified) {
        return { state: "verified", checks: ["operator_attestation"], source: "operator_pilot_attestation", verifiedAt: null };
    }
    return { state: "unverified", checks: [], source: null, verifiedAt: null };
}

/** Public card shape for Discover (never includes restricted/private fields). */
export function toDiscoverCard(entry, entity) {
    return {
        snId: entity?.snId || entry.snId || null,
        companyId: entry.companyId,
        displayName: entry.displayName || entry.companyId,
        industry: entry.industry || null,
        location: entry.location || null,
        verified: Boolean(entry.verified),
        verification: verificationBadge(entry),
        shortDescription:
            entry.shortDescription || "Chat with this business using Company Sarah on Sarah App.",
        categories: deriveCategories(entry),
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        logoUrl: entry.logoUrl || null,
        coverUrl: entry.coverUrl || null,
        hasCompanySarah: true,
    };
}

/**
 * Every listed, non-suspended directory entry as a Discover card (the Stage-A "index": hydrated from Firestore,
 * scored in-process — SNET-00 §6.2).
 * @returns {Promise<object[]>}
 */
export async function listDiscoverCards() {
    await hydrateBusinessDirectory();
    const cards = [];
    for (const entry of listPublicBusinessDirectoryEntries()) {
        const entity = await resolveEntity(entry);
        if (entity?.status === "suspended") continue;
        cards.push(toDiscoverCard(entry, entity));
    }
    return cards;
}

function encodeCursor(offset) {
    return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

function decodeCursor(cursor) {
    if (!cursor) return 0;
    try {
        const o = Number(JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8")).o);
        return Number.isFinite(o) && o >= 0 ? o : 0;
    } catch {
        return 0;
    }
}

/**
 * Ranked Discover search (SNET-05): name/category/keyword/location scoring with synonyms, verified boost,
 * cursor pagination. Facets are computed over the text-matched set (before category/verified filters).
 * @param {{ q?: string, category?: string, verifiedOnly?: boolean, limit?: number, cursor?: string }} [opts]
 */
export async function searchDiscoverCompanies({ q = "", category = "", verifiedOnly = false, limit = 50, cursor = "" } = {}) {
    const cards = await listDiscoverCards();
    const ranked = rankCards(cards, q);
    const cat = String(category || "").toLowerCase();
    const filtered = ranked
        .filter((r) => !cat || cat === "all" || r.card.categories.includes(cat))
        .filter((r) => !verifiedOnly || r.card.verified);
    const max = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const offset = decodeCursor(cursor);
    const page = filtered.slice(offset, offset + max);
    recordSearch({ q, category: cat === "all" ? "" : cat, resultCount: filtered.length });
    return {
        companies: page.map((r) => ({ ...r.card, matchedOn: r.matchedOn })),
        total: filtered.length,
        nextCursor: offset + max < filtered.length ? encodeCursor(offset + max) : null,
        facets: discoverCategoryFacets(ranked.map((r) => r.card)),
        query: String(q || ""),
    };
}

/** Back-compat list helper (U6): ranked cards only. */
export async function listDiscoverCompanies(opts = {}) {
    return (await searchDiscoverCompanies(opts)).companies;
}

/** Category facets (id/label/count) over the currently listed cards. */
export function discoverCategoryFacets(cards) {
    return DISCOVER_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        count: cards.filter((card) => card.categories.includes(c.id)).length,
    })).filter((f) => f.count > 0);
}

/**
 * @param {string} companyId
 */
export function assertCompanyDiscoverable(companyId) {
    const entry = getBusinessDirectoryEntry(companyId);
    if (!entry || entry.discoverability !== "public") {
        throw Object.assign(new Error("This business is not available on Sarah Discover yet."), {
            status: 404,
            code: "COMPANY_NOT_DISCOVERABLE",
        });
    }
    return entry;
}

/**
 * Cache-miss helper for request paths: consult the store before failing closed.
 * @param {string} companyId
 */
export async function assertCompanyDiscoverableAsync(companyId) {
    if (!getBusinessDirectoryEntry(companyId)) await hydrateBusinessDirectory();
    const entry = assertCompanyDiscoverable(companyId);
    const entity = await resolveEntity(entry);
    if (entity?.status === "suspended") {
        throw Object.assign(new Error("This business is not available on Sarah Discover yet."), {
            status: 404,
            code: "COMPANY_NOT_DISCOVERABLE",
        });
    }
    return entry;
}

/**
 * @param {string} companyId
 * @param {object} data
 */
export function upsertBusinessDirectoryEntry(companyId, data) {
    const existing = directory.get(companyId) || { companyId };
    const next = { ...existing, ...data, companyId, updatedAt: new Date().toISOString() };
    directory.set(companyId, next);
    entityCache.delete(companyId);
    void persistEntry(next);
    return next;
}

/**
 * Awaitable upsert for user-initiated publish flows: the durable write must succeed (or throw) before the
 * caller reports success. Cache is only updated after the store accepted the write.
 * @param {string} companyId
 * @param {object} data
 */
export async function saveBusinessDirectoryEntry(companyId, data) {
    const existing = directory.get(companyId) || { companyId };
    const next = { ...existing, ...data, companyId, updatedAt: new Date().toISOString() };
    await persistEntry(next, { strict: true });
    directory.set(companyId, next);
    entityCache.delete(companyId);
    return next;
}

export function clearBusinessDirectoryForTests() {
    directory.clear();
    seeded.clear();
    entityCache.clear();
    hydratedAt = 0;
    hydratePromise = null;
    seedPilotCompanies();
}

/** @param {typeof firestoreDirectoryStore|null} override — pass null to restore Firestore. */
export function setBusinessDirectoryStoreForTests(override) {
    store = override || firestoreDirectoryStore;
    hydratedAt = 0;
    hydratePromise = null;
}
