/**
 * U4/U6 — public discoverability gate for Sarah Network.
 *
 * SNET-01a: the in-process map is now a read-through cache over Firestore `businessDirectory/{companyId}`
 * (Admin backend; no-op in memory mode). Sync getters are unchanged; call `hydrateBusinessDirectory()`
 * before listing so entries survive restarts / multiple replicas.
 */
import { SMILEMORE_DEMO_COMPANY_ID } from "../dental/smilemorePractice.js";
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
        await setDoc(businessDirectoryDocRef(entry.companyId), entry, { merge: true });
    },
};

let store = firestoreDirectoryStore;

function seedPilotCompanies() {
    const extra = String(process.env.SARAH_NETWORK_PILOT_COMPANY_IDS || SMILEMORE_DEMO_COMPANY_ID)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    for (const companyId of extra) {
        if (!directory.has(companyId)) {
            seeded.add(companyId);
            directory.set(companyId, {
                companyId,
                discoverability: "public",
                displayName:
                    companyId === SMILEMORE_DEMO_COMPANY_ID ? "SmileMore Dentists" : companyId,
                industry: companyId === SMILEMORE_DEMO_COMPANY_ID ? "Healthcare · Dental" : null,
                location: "Rustenburg, South Africa",
                shortDescription:
                    companyId === SMILEMORE_DEMO_COMPANY_ID
                        ? "Family and paediatric dental care. Chat with Company Sarah for services and appointments."
                        : "Verified business on Sarah App.",
                industryPresetId: null,
                verified: companyId === SMILEMORE_DEMO_COMPANY_ID,
            });
        }
    }
}

seedPilotCompanies();

async function persistEntry(entry) {
    try {
        if (store.enabled()) await store.save(entry);
    } catch (err) {
        console.warn("[businessDirectoryService] Firestore write failed:", err.message);
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
 * `GET /api/discover/companies` payload — durable directory (SmileMore stays seeded by default).
 */
export async function listDiscoverCompanies() {
    await hydrateBusinessDirectory();
    return listPublicBusinessDirectoryEntries().map((entry) => ({
        companyId: entry.companyId,
        displayName: entry.displayName || entry.companyId,
        industry: entry.industry || "Healthcare",
        location: entry.location || "South Africa",
        verified: Boolean(entry.verified),
        shortDescription:
            entry.shortDescription || "Chat with this business using Company Sarah on Sarah App.",
    }));
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
    return assertCompanyDiscoverable(companyId);
}

/**
 * @param {string} companyId
 * @param {object} data
 */
export function upsertBusinessDirectoryEntry(companyId, data) {
    const existing = directory.get(companyId) || { companyId };
    const next = { ...existing, ...data, companyId, updatedAt: new Date().toISOString() };
    directory.set(companyId, next);
    void persistEntry(next);
    return next;
}

export function clearBusinessDirectoryForTests() {
    directory.clear();
    seeded.clear();
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
