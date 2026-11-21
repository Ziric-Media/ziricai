/**
 * Personal Sarah — user's geographic lens (profile country/city → search + news locale).
 */

const COUNTRY_ALIASES = {
    za: "South Africa",
    "south africa": "South Africa",
    zw: "Zimbabwe",
    zimbabwe: "Zimbabwe",
    ng: "Nigeria",
    ke: "Kenya",
    gb: "United Kingdom",
    uk: "United Kingdom",
    us: "United States",
    usa: "United States",
};

/**
 * @param {{ country?: string|null, city?: string|null, locale?: string|null }} ctx
 */
export function resolvePersonalSarahUserLocale(ctx = {}) {
    const countryRaw = String(ctx.country || "").trim();
    const locale = String(ctx.locale || "en-ZA").trim();
    const lower = countryRaw.toLowerCase();
    let label = COUNTRY_ALIASES[lower] || countryRaw || null;

    if (!label && /^en-ZA/i.test(locale)) label = "South Africa";
    if (!label) label = "South Africa";

    let gl = "ZA";
    let hl = "en-ZA";
    if (/zimbabwe|zw/i.test(label) || /\bzw\b/i.test(lower)) {
        gl = "ZW";
        hl = "en-ZW";
    } else if (/nigeria/i.test(label)) {
        gl = "NG";
        hl = "en-NG";
    } else if (/kenya/i.test(label)) {
        gl = "KE";
        hl = "en-KE";
    } else if (/united kingdom|uk/i.test(label)) {
        gl = "GB";
        hl = "en-GB";
    } else if (/united states|usa/i.test(label)) {
        gl = "US";
        hl = "en-US";
    }

    const newsRegion = gl === "ZW" ? "zw" : gl === "ZA" ? "za" : "world";

    return {
        country: label,
        countryRaw: countryRaw || label,
        city: ctx.city ? String(ctx.city).trim() : null,
        locale,
        googleNewsGl: gl,
        googleNewsHl: hl,
        newsRegion,
        searchBoost: [ctx.city, label].filter(Boolean).join(", "),
    };
}

/**
 * @param {string} message
 * @param {{ searchBoost?: string }} locale
 */
export function enrichQueryWithUserLocale(message, locale = {}) {
    const m = String(message || "").trim();
    const boost = String(locale.searchBoost || locale.country || "").trim();
    if (!boost) return m;
    const lower = m.toLowerCase();
    const boostLower = boost.toLowerCase();
    if (boostLower.split(",").some((part) => lower.includes(part.trim()))) return m;
    if (/\bhere\b|\blocally\b|\bin my country\b|\bwhere i am\b/i.test(m)) {
        return `${m.replace(/\bhere\b/gi, "").trim()} ${locale.country || boost}`.trim();
    }
    return `${m} ${locale.country || boost}`.trim();
}