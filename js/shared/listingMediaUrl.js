/**
 * Listing images are served at /api/network/v1/listing-media/:id/content?token=…
 * Rewrite to the current site origin so Netlify /api proxy works (portal + Sarah App).
 */

const LISTING_MEDIA_PATH =
  /^\/api\/network\/v1\/listing-media\/[^/]+\/content(?:\?.*)?$/i;

/**
 * @param {string} url
 * @returns {string|null} pathname + search, e.g. /api/network/v1/listing-media/…/content?token=…
 */
export function listingMediaPathQuery(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, "https://ziricai.local");
    if (!u.pathname.includes("/api/network/v1/listing-media/")) return null;
    if (!u.pathname.endsWith("/content")) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    if (raw.startsWith("/api/network/v1/listing-media/")) return raw;
    return null;
  }
}

/**
 * @param {string} url
 * @param {string} [origin] defaults to window.location.origin in browser
 */
export function resolveListingMediaDisplayUrl(url, origin) {
  const pq = listingMediaPathQuery(url);
  if (!pq) return rawOrEmpty(url);
  const base =
    origin ||
    (typeof globalThis !== "undefined" && globalThis.location?.origin) ||
    "https://sarah.ziricai.com";
  return `${String(base).replace(/\/$/, "")}${pq}`;
}

function rawOrEmpty(url) {
  return String(url || "").trim();
}

function siteOrigin(origin) {
  return (
    origin ||
    (typeof globalThis !== "undefined" && globalThis.location?.origin) ||
    "https://sarah.ziricai.com"
  );
}

/**
 * Discover product/gallery images: listing-media API paths, platform assets/, or https URLs.
 * @param {string} url
 * @param {string} [origin]
 */
export function resolveDiscoverProductDisplayUrl(url, origin) {
  const raw = rawOrEmpty(url);
  if (!raw) return "";
  const listing = listingMediaPathQuery(raw);
  if (listing) {
    return `${String(siteOrigin(origin)).replace(/\/$/, "")}${listing}`;
  }
  if (/^assets\//i.test(raw)) {
    return `${String(siteOrigin(origin)).replace(/\/$/, "")}/${raw.replace(/^\//, "")}`;
  }
  if (raw.startsWith("/")) {
    return `${String(siteOrigin(origin)).replace(/\/$/, "")}${raw}`;
  }
  return raw;
}
