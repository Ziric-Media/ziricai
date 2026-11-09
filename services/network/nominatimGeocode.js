/**
 * Phase 2.2 — optional Nominatim geocode for listing publish (South Africa bias).
 * Disabled when NOMINATIM_DISABLED=1; rate-limited in-process (default 1 req/s).
 */
import { validLatLng } from "./networkGeo.js";

const USER_AGENT = "ZiricAI-SarahNetwork/2.2 (contact: platform@ziricai.com)";
const MIN_INTERVAL_MS = Number(process.env.NOMINATIM_MIN_INTERVAL_MS || 1100);

let lastRequestAt = 0;
/** @type {typeof fetch | null} */
let fetchImpl = typeof fetch === "function" ? fetch : null;

export function setNominatimFetchForTests(fn) {
    fetchImpl = fn;
}

export function resetNominatimForTests() {
    lastRequestAt = 0;
    fetchImpl = typeof fetch === "function" ? fetch : null;
}

function buildQuery(profile) {
    const loc = String(profile?.location || "").trim();
    const areas = Array.isArray(profile?.serviceAreas) ? profile.serviceAreas.map(String).filter(Boolean) : [];
    const region =
        String(profile?.region || profile?.province || "").trim() ||
        (loc.match(/\b(Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Free State|Limpopo|Mpumalanga|Northern Cape|North West)\b/i)?.[0] || "");
    const city = String(profile?.city || "").trim();
    const parts = [loc, city, ...areas.slice(0, 2), region, "South Africa"].filter(Boolean);
    return [...new Set(parts)].join(", ");
}

async function throttle() {
    const now = Date.now();
    const wait = lastRequestAt + MIN_INTERVAL_MS - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
}

/**
 * @param {{ location?: string, city?: string, region?: string, serviceAreas?: string[] }} profile
 * @returns {Promise<{ lat: number, lng: number, source: 'nominatim' }|null>}
 */
export async function geocodeProfileLocation(profile) {
    if (String(process.env.NOMINATIM_DISABLED || "") === "1") return null;
    const q = buildQuery(profile);
    if (!q || q.length < 4) return null;
    if (!fetchImpl) return null;
    await throttle();
    try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", q);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "1");
        url.searchParams.set("countrycodes", "za");
        const res = await fetchImpl(url.toString(), {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        });
        if (!res.ok) return null;
        const rows = await res.json();
        const hit = Array.isArray(rows) ? rows[0] : null;
        const lat = Number(hit?.lat);
        const lng = Number(hit?.lon);
        if (!validLatLng(lat, lng)) return null;
        return { lat, lng, source: "nominatim" };
    } catch {
        return null;
    }
}
