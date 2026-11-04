/**
 * RMS commercial activation and enforcement flags (R0).
 * All commercial checkout defaults OFF until operator enables via Firestore or env kill switch.
 */

const DEFAULT_CONFIG = {
    commercialActivation: {
        rs01CompanyCheckout: false,
        rs02SarahCheckout: false,
        rs03StatusBoost: false,
        rs04DiscoverAds: false,
        rs05Commissions: false,
        rs06Credits: false,
        rs07Addons: false,
        rs08EnterpriseBilling: false,
    },
    enforcement: {
        rs01Limits: "shadow",
        rs02Limits: "shadow",
        rs06Credits: "shadow",
    },
    payments: {
        provider: "none",
        testMode: true,
    },
    catalogueVersionId: "seed-r0-v1",
};

/** @type {typeof DEFAULT_CONFIG | null} */
let cached = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function envKillSwitchActive() {
    const v = process.env.REVENUE_COMMERCIAL_OVERRIDE || "";
    return String(v).toLowerCase() === "disabled";
}

/**
 * @returns {Promise<typeof DEFAULT_CONFIG>}
 */
export async function getRevenueConfig() {
    if (envKillSwitchActive()) {
        return {
            ...DEFAULT_CONFIG,
            commercialActivation: Object.fromEntries(
                Object.keys(DEFAULT_CONFIG.commercialActivation).map((k) => [k, false])
            ),
        };
    }
    const now = Date.now();
    if (cached && now - cachedAt < CACHE_MS) {
        return cached;
    }
    cached = { ...DEFAULT_CONFIG };
    cachedAt = now;
    return cached;
}

export function resetRevenueConfigCacheForTests() {
    cached = null;
    cachedAt = 0;
}

/**
 * @param {keyof typeof DEFAULT_CONFIG.commercialActivation} key
 */
export async function isCommercialActive(key) {
    const cfg = await getRevenueConfig();
    return Boolean(cfg.commercialActivation[key]);
}

/**
 * @param {'rs01Limits'|'rs02Limits'|'rs06Credits'} key
 */
export async function getEnforcementMode(key) {
    const cfg = await getRevenueConfig();
    return cfg.enforcement[key] || "shadow";
}
