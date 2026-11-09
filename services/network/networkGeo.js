/**
 * Phase 2.0 — geo helpers for Discover search (pure, no I/O).
 *
 * There is no coordinate store behind Discover yet, so location comes from two sources:
 *   1. an optional explicit `geo: { lat, lng }` the business sets on its listing (rounded to ~1 km before it is shown), or
 *   2. a small built-in gazetteer of South African towns/cities matched against `location` / `serviceAreas` text.
 * The gazetteer also supplies the province ("region") used by the region filter. It is intentionally tiny and
 * code-defined; an external geocoder / PostGIS index is the Stage-B follow-up (SNET_PHASE_2_0.md).
 */

/** name (lower-case) → { lat, lng, province, aliases[] } */
const PLACES = [
    ["johannesburg", -26.2041, 28.0473, "Gauteng", ["joburg", "jozi", "jhb"]],
    ["sandton", -26.1076, 28.0567, "Gauteng", []],
    ["midrand", -25.9992, 28.1263, "Gauteng", []],
    ["soweto", -26.2485, 27.8540, "Gauteng", []],
    ["benoni", -26.1885, 28.3208, "Gauteng", []],
    ["boksburg", -26.2125, 28.2595, "Gauteng", []],
    ["germiston", -26.2178, 28.1672, "Gauteng", []],
    ["pretoria", -25.7479, 28.2293, "Gauteng", ["tshwane"]],
    ["centurion", -25.8603, 28.1894, "Gauteng", []],
    ["cape town", -33.9249, 18.4241, "Western Cape", ["capetown"]],
    ["stellenbosch", -33.9321, 18.8602, "Western Cape", []],
    ["george", -33.9630, 22.4617, "Western Cape", []],
    ["durban", -29.8587, 31.0218, "KwaZulu-Natal", []],
    ["pietermaritzburg", -29.6006, 30.3794, "KwaZulu-Natal", ["pmb"]],
    ["richards bay", -28.7830, 32.0377, "KwaZulu-Natal", []],
    ["gqeberha", -33.9608, 25.6022, "Eastern Cape", ["port elizabeth"]],
    ["east london", -33.0153, 27.9116, "Eastern Cape", []],
    ["bloemfontein", -29.0852, 26.1596, "Free State", []],
    ["polokwane", -23.9045, 29.4689, "Limpopo", ["pietersburg"]],
    ["mbombela", -25.4753, 30.9694, "Mpumalanga", ["nelspruit"]],
    ["emalahleni", -25.8713, 29.2332, "Mpumalanga", ["witbank"]],
    ["middelburg", -25.7751, 29.4648, "Mpumalanga", []],
    ["secunda", -26.5167, 29.1667, "Mpumalanga", []],
    ["kimberley", -28.7282, 24.7499, "Northern Cape", []],
    ["upington", -28.4478, 21.2561, "Northern Cape", []],
    ["mahikeng", -25.8560, 25.6403, "North West", ["mafikeng"]],
    ["rustenburg", -25.6676, 27.2421, "North West", []],
    ["kempton park", -26.1007, 28.2309, "Gauteng", []],
    ["roodepoort", -26.1625, 27.8725, "Gauteng", []],
    ["randburg", -26.0938, 27.9923, "Gauteng", []],
    ["fourways", -26.0167, 28.0167, "Gauteng", []],
    ["atlantis", -33.5667, 18.4833, "Western Cape", []],
    ["hermanus", -34.4187, 19.2345, "Western Cape", []],
    ["knysna", -34.0361, 23.0471, "Western Cape", []],
    ["paarl", -33.7348, 18.9612, "Western Cape", []],
    ["bellville", -33.8985, 18.6292, "Western Cape", []],
    ["newcastle", -27.7577, 29.9318, "KwaZulu-Natal", []],
    ["ladysmith", -28.5615, 29.7795, "KwaZulu-Natal", []],
    ["vanderbijlpark", -26.7034, 27.8076, "Gauteng", ["vanderbiljpark"]],
    ["vereeniging", -26.6731, 27.9265, "Gauteng", []],
    ["potchefstroom", -26.7145, 27.0970, "North West", []],
    ["klerksdorp", -26.8525, 26.6647, "North West", []],
    ["nelspruit", -25.4753, 30.9694, "Mpumalanga", ["mbombela"]],
    ["witbank", -25.8713, 29.2332, "Mpumalanga", ["emalahleni"]],
    ["queenstown", -31.8976, 26.8753, "Eastern Cape", []],
    ["grahamstown", -33.3047, 26.5328, "Eastern Cape", ["makhanda"]],
    ["welkom", -27.9777, 26.7353, "Free State", []],
].map(([name, lat, lng, province, aliases]) => ({ name, lat, lng, province, aliases }));

/**
 * Phase 2.1 — infer coordinates from explicit geo or the gazetteer (used on publish when lat/lon omitted).
 * @param {{ location?: string, serviceAreas?: string[], geo?: { lat: number, lng: number }|null }} profile
 */
export function inferGeoFromProfile(profile) {
    if (profile?.geo && validLatLng(profile.geo.lat, profile.geo.lng)) {
        return { lat: Number(profile.geo.lat), lng: Number(profile.geo.lng) };
    }
    const texts = [profile?.location, ...(Array.isArray(profile?.serviceAreas) ? profile.serviceAreas : [])].filter(Boolean);
    for (const t of texts) {
        const place = resolvePlace(t);
        if (place) return { lat: place.lat, lng: place.lng };
    }
    return null;
}

export const PROVINCES = Object.freeze([...new Set(PLACES.map((p) => p.province))].sort());

const norm = (s) =>
    String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

/** Word-boundary containment of a (possibly multi-word) phrase. */
function containsPhrase(haystack, phrase) {
    return ` ${haystack} `.includes(` ${phrase} `);
}

/** First gazetteer place named in free text ("Emalahleni, South Africa" → Emalahleni). */
export function resolvePlace(text) {
    const t = norm(text);
    if (!t) return null;
    for (const place of PLACES) {
        if (containsPhrase(t, place.name) || place.aliases.some((a) => containsPhrase(t, a))) return place;
    }
    return null;
}

/** Province named in free text ("Gauteng", "kzn" is not guessed). */
export function resolveProvince(text) {
    const t = norm(text);
    if (!t) return null;
    return PROVINCES.find((p) => containsPhrase(t, norm(p))) || null;
}

export function validLatLng(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

/** Great-circle distance in km. */
export function haversineKm(a, b) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ~1 km public precision (2 decimal places). */
export const roundGeo = (g) => ({ lat: Math.round(g.lat * 100) / 100, lng: Math.round(g.lng * 100) / 100 });

/**
 * Public location facts for a directory entry: coordinates (explicit, else gazetteer), province and the places it serves.
 * @param {{ geo?: { lat: number, lng: number }|null, location?: string|null, serviceAreas?: string[] }} entry
 * @returns {{ geo: {lat:number,lng:number}|null, geoSource: "listing"|"gazetteer"|null, region: string|null, regions: string[] }}
 */
export function locateEntry(entry) {
    const texts = [entry?.location, ...(Array.isArray(entry?.serviceAreas) ? entry.serviceAreas : [])].filter(Boolean);
    const places = texts.map(resolvePlace).filter(Boolean);
    const regions = [
        ...new Set([
            ...places.map((p) => p.province),
            ...texts.map(resolveProvince).filter(Boolean),
        ]),
    ];
    const primaryRegion = resolvePlace(entry?.location)?.province || resolveProvince(entry?.location) || regions[0] || null;
    if (entry?.geo && validLatLng(entry.geo.lat, entry.geo.lng)) {
        return { geo: roundGeo({ lat: Number(entry.geo.lat), lng: Number(entry.geo.lng) }), geoSource: "listing", region: primaryRegion, regions };
    }
    const home = resolvePlace(entry?.location) || places[0] || null;
    return {
        geo: home ? { lat: home.lat, lng: home.lng } : null,
        geoSource: home ? "gazetteer" : null,
        region: primaryRegion,
        regions,
    };
}

/**
 * Parse the `near` query parameter: "lat,lng" or a known place name.
 * @returns {{ lat: number, lng: number, label: string|null }|null} null when absent
 * @throws 422 when present but unusable
 */
export function parseNear(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const m = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (m) {
        if (!validLatLng(m[1], m[2])) throw Object.assign(new Error("near must be valid coordinates (lat,lng)."), { status: 422, code: "NEAR_INVALID" });
        return { lat: Number(m[1]), lng: Number(m[2]), label: null };
    }
    const place = resolvePlace(text);
    if (!place) {
        throw Object.assign(new Error("near: unknown place. Use lat,lng or a known town/city (e.g. Emalahleni, Cape Town)."), {
            status: 422,
            code: "NEAR_UNKNOWN_PLACE",
        });
    }
    return { lat: place.lat, lng: place.lng, label: place.name };
}

/** @param {unknown} raw radius in km → 1..500 (default 50) */
export function clampRadiusKm(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 50;
    return Math.min(Math.max(n, 1), 500);
}

/** Token match used by the city filter: every word of `city` must appear in the entry's location / service areas. */
export function matchesCity(entry, city) {
    const want = norm(city);
    if (!want) return true;
    const texts = [entry?.location, ...(Array.isArray(entry?.serviceAreas) ? entry.serviceAreas : [])].map(norm);
    const resolved = resolvePlace(city);
    return texts.some((t) => containsPhrase(t, want) || (resolved && (containsPhrase(t, resolved.name) || resolved.aliases.some((a) => containsPhrase(t, a)))));
}

/** Region filter: province of the entry's home location or of any area it serves. */
export function matchesRegion(entry, region) {
    const want = resolveProvince(region) || norm(region);
    if (!want) return true;
    const info = locateEntry(entry);
    const wantNorm = norm(want);
    if (info.regions.some((r) => norm(r) === wantNorm)) return true;
    const texts = [entry?.location, ...(Array.isArray(entry?.serviceAreas) ? entry.serviceAreas : [])].map(norm);
    return texts.some((t) => containsPhrase(t, wantNorm));
}
