/**
 * SNET-03 — Network Profile Service: tenant-owned listing draft → publish → public Discover profile.
 *
 * Ownership (SNET-01 §17): the tenant owns what it chooses to publish; the network holds the published
 * representation (`businessDirectory/{companyId}`) and the identity (`networkEntities`). Visibility tiers:
 *   - public                    → served to Sarah App (card + profile)
 *   - verification_restricted   → `restricted` block (legal name, registration no.) — never in any public payload
 * `verified` is NOT a tenant-editable field (SNET-04 derives it from a verification case).
 */
import { evaluateNetworkEligibility } from "./networkEligibility.js";
import { ensureOrgEntity, getEntityBySnId, getOrgEntityByCompanyId } from "./networkIdentityService.js";
import { deriveCategories, isKnownCategory } from "./networkTaxonomy.js";
import { inferGeoFromProfile, validLatLng } from "./networkGeo.js";
import { geocodeProfileLocation } from "./nominatimGeocode.js";
import {
    getBusinessDirectoryEntry,
    hydrateBusinessDirectory,
    invalidateDirectoryEntity,
    saveBusinessDirectoryEntry,
    verificationBadge,
} from "../users/businessDirectoryService.js";
import { getCompany } from "../tenants/companyService.js";
import { ensureCompanyAgent } from "./agentRegistryService.js";

/** Agent summary for the public profile (active agents only; no internals). */
async function publicAgentRef(companyId) {
    try {
        const agent = await ensureCompanyAgent(companyId);
        if (agent.status !== "active") return null;
        return { agentSnId: agent.agentSnId, capabilities: agent.capabilities, humanHandover: agent.humanHandover !== false };
    } catch {
        return null;
    }
}

/** Fields a tenant may edit, by visibility tier. */
export const PUBLIC_PROFILE_FIELDS = Object.freeze([
    "displayName",
    "industry",
    "shortDescription",
    "location",
    "address",
    "logoUrl",
    "coverUrl",
    "tags",
    "categories",
    "languages",
    "serviceAreas",
    "hours",
    "contact",
    /** Phase 2.0: optional `{ lat, lng }` for Discover `near=` search (shown at ~1 km precision). */
    "geo",
    /** Discover detail: image gallery `[{ id?, imageUrl, caption? }]`. */
    "gallery",
    /** Discover detail: products / services `[{ id?, name, description?, price?, imageUrl? }]`. */
    "products",
]);
export const RESTRICTED_PROFILE_FIELDS = Object.freeze(["legalName", "registrationNumber"]);
export const REQUIRED_TO_PUBLISH = Object.freeze(["displayName", "industry", "shortDescription", "location"]);

function bad(message, code = "PROFILE_INVALID", extra = {}) {
    return Object.assign(new Error(message), { status: 422, code, ...extra });
}

function str(value, max, field) {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw bad(`${field} must be text.`, "PROFILE_INVALID", { field });
    const v = value.trim();
    if (v.length > max) throw bad(`${field} is too long (max ${max}).`, "PROFILE_INVALID", { field });
    return v || null;
}

function url(value, field) {
    const v = str(value, 500, field);
    if (!v) return null;
    if (!/^https:\/\/[^\s]+$/i.test(v)) throw bad(`${field} must be an https:// URL.`, "PROFILE_INVALID", { field });
    return v;
}

/** Business website — allow bare domains; store as https:// */
function websiteUrl(value, field = "contact.website") {
    let v = str(value, 500, field);
    if (!v) return null;
    if (/^https:\/\//i.test(v)) return v;
    if (/^http:\/\//i.test(v)) return v.replace(/^http:\/\//i, "https://");
    v = v.replace(/^\/\//, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}/i.test(v) && !v.includes(".")) {
        throw bad(`${field} must be a valid website URL (https:// or domain name).`, "PROFILE_INVALID", { field });
    }
    return `https://${v}`;
}

const BLOCKED_IMAGE_HOTLINK = /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)instagram\.com$|(^|\.)fbcdn\.net$/i;

/** Social/page URLs cannot be embedded as Discover images (CORP blocks browsers). */
function assertDirectImageUrl(v, field) {
    try {
        const u = new URL(v, "https://ziricai.local");
        if (BLOCKED_IMAGE_HOTLINK.test(u.hostname) || /photo\.php/i.test(u.pathname)) {
            throw bad(
                `${field} cannot use Facebook or Instagram page links — use Upload on this screen or a direct https image file URL (.jpg/.png/.webp).`,
                "PROFILE_INVALID",
                { field }
            );
        }
    } catch (err) {
        if (err.code === "PROFILE_INVALID") throw err;
    }
}

/** Product/gallery images: https listing media or platform asset paths from dental presets. */
function discoverMediaUrl(value, field) {
    let v = str(value, 500, field);
    if (!v) return null;
    assertDirectImageUrl(v, field);
    try {
        const u = new URL(v, "https://ziricai.local");
        if (u.pathname.includes("/api/network/v1/listing-media/") && u.pathname.endsWith("/content")) {
            v = `${u.pathname}${u.search}`;
        }
    } catch {
        /* keep v */
    }
    if (/^assets\//i.test(v)) return v;
    if (/^\/api\/network\/v1\/listing-media\//i.test(v)) return v;
    if (/^https:\/\/[^\s]+$/i.test(v)) return v;
    throw bad(`${field} must be an https:// URL or an assets/ image path.`, "PROFILE_INVALID", { field });
}

function list(value, max, itemMax, field) {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) throw bad(`${field} must be a list.`, "PROFILE_INVALID", { field });
    if (value.length > max) throw bad(`${field} has too many entries (max ${max}).`, "PROFILE_INVALID", { field });
    return value.map((v) => str(String(v), itemMax, field)).filter(Boolean);
}

function slugId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function galleryList(value) {
    if (value === null || value === undefined) return undefined;
    if (!Array.isArray(value)) throw bad("gallery must be a list.", "PROFILE_INVALID", { field: "gallery" });
    if (value.length > 24) throw bad("gallery has too many images (max 24).", "PROFILE_INVALID", { field: "gallery" });
    return value
        .map((row) => {
            if (!row || typeof row !== "object") return null;
            const imageUrl = discoverMediaUrl(row.imageUrl, "gallery.imageUrl");
            if (!imageUrl) return null;
            const caption = row.caption ? str(row.caption, 160, "gallery.caption") : null;
            const id = str(String(row.id || slugId("gal")), 40, "gallery.id") || slugId("gal");
            return { id, imageUrl, ...(caption ? { caption } : {}) };
        })
        .filter(Boolean);
}

function productsList(value) {
    if (value === null || value === undefined) return undefined;
    if (!Array.isArray(value)) throw bad("products must be a list.", "PROFILE_INVALID", { field: "products" });
    if (value.length > 48) throw bad("products has too many entries (max 48).", "PROFILE_INVALID", { field: "products" });
    return value
        .map((row) => {
            if (!row || typeof row !== "object") return null;
            const name = str(row.name, 120, "products.name");
            if (!name) return null;
            const id = str(String(row.id || slugId("prd")), 40, "products.id") || slugId("prd");
            const description = row.description ? str(row.description, 400, "products.description") : null;
            const price = row.price ? str(row.price, 40, "products.price") : null;
            const imageUrl = row.imageUrl ? discoverMediaUrl(row.imageUrl, "products.imageUrl") : null;
            const promotion = row.promotion ? str(row.promotion, 80, "products.promotion") : null;
            return {
                id,
                name,
                ...(description ? { description } : {}),
                ...(price ? { price } : {}),
                ...(imageUrl ? { imageUrl } : {}),
                ...(promotion ? { promotion } : {}),
            };
        })
        .filter(Boolean);
}

/**
 * Validate + normalise a partial profile patch. Unknown keys are rejected (no silent drops; `verified` etc.).
 * @param {object} input
 * @returns {{ profile: object, restricted: object }}
 */
export function validateProfilePatch(input = {}) {
    const allowed = new Set([...PUBLIC_PROFILE_FIELDS, ...RESTRICTED_PROFILE_FIELDS]);
    const unknown = Object.keys(input).filter((k) => !allowed.has(k));
    if (unknown.length) throw bad(`Unknown or non-editable fields: ${unknown.join(", ")}`, "PROFILE_FIELD_NOT_ALLOWED", { fields: unknown });

    const profile = {};
    const restricted = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

    if (has("displayName")) profile.displayName = str(input.displayName, 120, "displayName");
    if (has("industry")) profile.industry = str(input.industry, 120, "industry");
    if (has("shortDescription")) profile.shortDescription = str(input.shortDescription, 600, "shortDescription");
    if (has("location")) profile.location = str(input.location, 160, "location");
    if (has("address")) profile.address = str(input.address, 240, "address");
    if (has("logoUrl")) profile.logoUrl = discoverMediaUrl(input.logoUrl, "logoUrl");
    if (has("coverUrl")) profile.coverUrl = discoverMediaUrl(input.coverUrl, "coverUrl");
    if (has("tags")) profile.tags = [...new Set(list(input.tags, 20, 30, "tags").map((t) => t.toLowerCase()))];
    if (has("languages")) profile.languages = list(input.languages, 10, 30, "languages");
    if (has("geo")) {
        const g = input.geo;
        if (g === null || g === undefined || (typeof g === "object" && g.lat === "" && g.lng === "")) profile.geo = null;
        else if (typeof g !== "object" || !validLatLng(g.lat, g.lng)) throw bad("geo must be { lat, lng } with valid coordinates.", "PROFILE_INVALID", { field: "geo" });
        else profile.geo = { lat: Number(g.lat), lng: Number(g.lng) };
    }
    if (has("serviceAreas")) profile.serviceAreas = list(input.serviceAreas, 20, 80, "serviceAreas");
    if (has("categories")) {
        const cats = list(input.categories, 8, 30, "categories").map((c) => c.toLowerCase());
        const unknownCats = cats.filter((c) => !isKnownCategory(c));
        if (unknownCats.length) throw bad(`Unknown categories: ${unknownCats.join(", ")}`, "PROFILE_INVALID", { field: "categories" });
        profile.categories = [...new Set(cats)];
    }
    if (has("hours")) {
        if (!Array.isArray(input.hours) || input.hours.length > 7) throw bad("hours must be a list of up to 7 {day,time} rows.", "PROFILE_INVALID", { field: "hours" });
        profile.hours = input.hours.map((h) => ({ day: str(h?.day, 20, "hours.day"), time: str(h?.time, 40, "hours.time") })).filter((h) => h.day && h.time);
    }
    if (has("contact")) {
        const c = input.contact || {};
        profile.contact = {
            phone: str(c.phone, 40, "contact.phone"),
            email: str(c.email, 160, "contact.email"),
            website: websiteUrl(c.website, "contact.website"),
        };
        if (profile.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contact.email)) {
            throw bad("contact.email is not a valid email.", "PROFILE_INVALID", { field: "contact.email" });
        }
    }
    if (has("legalName")) restricted.legalName = str(input.legalName, 200, "legalName");
    if (has("registrationNumber")) restricted.registrationNumber = str(input.registrationNumber, 60, "registrationNumber");
    if (has("gallery")) profile.gallery = galleryList(input.gallery);
    if (has("products")) profile.products = productsList(input.products);
    return { profile, restricted };
}

/** Required-to-publish fields still missing from a merged profile. */
export function missingRequiredFields(profile) {
    return REQUIRED_TO_PUBLISH.filter((k) => !String(profile?.[k] || "").trim());
}

async function loadEntry(companyId) {
    await hydrateBusinessDirectory();
    return getBusinessDirectoryEntry(companyId);
}

function publicFromEntry(entry) {
    const out = {};
    for (const k of PUBLIC_PROFILE_FIELDS) if (entry?.[k] !== undefined) out[k] = entry[k];
    return out;
}

async function tenantRecord(companyId, deps) {
    const company = await (deps.getCompany || getCompany)(companyId);
    if (!company) throw Object.assign(new Error("Company not found."), { status: 404, code: "COMPANY_NOT_FOUND" });
    return company;
}

/**
 * Tenant view: published state, draft, restricted block, eligibility + publish blockers.
 * @param {string} companyId
 * @param {{ getCompany?: Function }} [deps]
 */
export async function getListing(companyId, deps = {}) {
    const company = await tenantRecord(companyId, deps);
    const entry = await loadEntry(companyId);
    const entity = await getOrgEntityByCompanyId(companyId);
    const published = Boolean(entry && entry.discoverability === "public");
    const draft = { ...publicFromEntry(entry), ...(entry?.draft || {}) };
    if (!draft.displayName && company.name) draft.displayName = company.name;
    return {
        snId: entity?.snId || null,
        entityStatus: entity?.status || null,
        published,
        publishedAt: entry?.publishedAt || null,
        verified: Boolean(entry?.verified),
        profile: draft,
        live: published ? publicFromEntry(entry) : null,
        restricted: entry?.restricted || {},
        eligibility: (({ eligible, classification, reason }) => ({ eligible, classification, reason }))(
            evaluateNetworkEligibility(company)
        ),
        missingRequired: missingRequiredFields(draft),
    };
}

/**
 * Save draft (and restricted) fields. Does not change what is public until `publishListing`.
 * @param {string} companyId
 * @param {object} input
 * @param {string|null} actorUid
 */
function normalizeListingDraftInput(input = {}) {
    if (input?.profile && typeof input.profile === "object" && !Array.isArray(input.profile)) {
        const { profile, ...rest } = input;
        return { ...rest, ...profile };
    }
    return input;
}

export async function saveListingDraft(companyId, input, actorUid = null, deps = {}) {
    await tenantRecord(companyId, deps);
    const { profile, restricted } = validateProfilePatch(normalizeListingDraftInput(input));
    const entry = await loadEntry(companyId);
    const draft = { ...(entry?.draft || {}), ...profile };
    const nextRestricted = { ...(entry?.restricted || {}), ...restricted };
    await saveBusinessDirectoryEntry(companyId, {
        draft,
        restricted: nextRestricted,
        draftUpdatedAt: new Date().toISOString(),
        draftUpdatedBy: actorUid,
        discoverability: entry?.discoverability || "hidden",
    });
    return getListing(companyId, deps);
}

/**
 * Publish the draft to Sarah Network / Discover. Requires: eligible tenant, complete profile, entity not suspended.
 */
export async function publishListing(companyId, actorUid = null, deps = {}) {
    const company = await tenantRecord(companyId, deps);
    const verdict = evaluateNetworkEligibility(company);
    if (!verdict.eligible) {
        throw Object.assign(new Error("This tenant is not eligible to be listed on Sarah Network."), {
            status: 403,
            code: "NETWORK_NOT_ELIGIBLE",
            classification: verdict.classification,
        });
    }
    const entity = await ensureOrgEntity(companyId, { displayName: company.name || companyId });
    if (entity.status === "suspended") {
        throw Object.assign(new Error("This business is suspended from Sarah Network."), { status: 403, code: "NETWORK_SUSPENDED" });
    }
    const entry = await loadEntry(companyId);
    const draft = { ...(entry?.draft || {}) };
    const merged = { ...publicFromEntry(entry), ...draft };
    if (!merged.displayName && company.name) merged.displayName = company.name;
    const missing = missingRequiredFields(merged);
    if (missing.length) {
        throw bad(`Complete your profile before publishing: ${missing.join(", ")}`, "PROFILE_INCOMPLETE", { missing });
    }
    const categories = merged.categories?.length ? merged.categories : deriveCategories(merged);
    const geoCleared = draft.geo === null;
    if (!geoCleared && !validLatLng(merged.geo?.lat, merged.geo?.lng)) {
        const inferred = inferGeoFromProfile(merged);
        if (inferred) merged.geo = inferred;
        else {
            const geocoded = await geocodeProfileLocation(merged);
            if (geocoded) merged.geo = { lat: geocoded.lat, lng: geocoded.lng };
        }
    }
    await saveBusinessDirectoryEntry(companyId, {
        ...merged,
        categories,
        discoverability: "public",
        publishedAt: new Date().toISOString(),
        publishedBy: actorUid,
        draft: {},
        seeded: false,
    });
    invalidateDirectoryEntity(companyId);
    // SNET-06: a listed org always has its Company Sarah agent identity (idempotent; never blocks publishing).
    await ensureCompanyAgent(companyId).catch(() => null);
    return getListing(companyId, deps);
}

/** Remove the business from Discover (keeps the published copy as the new draft). */
export async function unpublishListing(companyId, actorUid = null, deps = {}) {
    await tenantRecord(companyId, deps);
    const entry = await loadEntry(companyId);
    if (!entry) return getListing(companyId, deps);
    await saveBusinessDirectoryEntry(companyId, {
        discoverability: "hidden",
        draft: { ...publicFromEntry(entry), ...(entry.draft || {}) },
        unpublishedAt: new Date().toISOString(),
        unpublishedBy: actorUid,
    });
    invalidateDirectoryEntity(companyId);
    return getListing(companyId, deps);
}

/**
 * Consumer-facing public profile (listed + not suspended only). Never includes draft or restricted data.
 * @param {string} snId
 */
export async function getPublicProfileBySnId(snId) {
    const entity = await getEntityBySnId(snId);
    const companyId = entity?.refs?.companyId;
    if (!entity || !companyId || entity.status === "suspended") return null;
    const entry = await loadEntry(companyId);
    if (!entry || entry.discoverability !== "public") return null;
    return {
        snId: entity.snId,
        companyId,
        ...publicFromEntry(entry),
        displayName: entry.displayName || companyId,
        categories: deriveCategories(entry),
        verified: Boolean(entry.verified),
        verification: verificationBadge(entry),
        hasCompanySarah: true,
        agent: await publicAgentRef(companyId),
    };
}
