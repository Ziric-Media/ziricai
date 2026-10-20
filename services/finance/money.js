/**
 * Currency amounts as integer minor units (no float arithmetic for totals).
 */
const DEFAULT_EXPONENT = 2;

/** @type {Record<string, number>} */
const CURRENCY_EXPONENT = {
    ZAR: 2,
    USD: 2,
    EUR: 2,
    GBP: 2,
    JPY: 0,
};

export function currencyExponent(currency) {
    const c = String(currency || "ZAR").trim().toUpperCase();
    return CURRENCY_EXPONENT[c] ?? DEFAULT_EXPONENT;
}

/**
 * Parse a major-unit amount (e.g. 10.50) into minor units (1050).
 * @param {number|string} major
 * @param {string} currency
 */
export function toMinorUnits(major, currency = "ZAR") {
    const exp = currencyExponent(currency);
    const n = typeof major === "string" ? Number(major.trim()) : Number(major);
    if (!Number.isFinite(n)) {
        throw Object.assign(new Error("Invalid amount"), { code: "FINANCE_AMOUNT_INVALID" });
    }
    const factor = 10 ** exp;
    const minor = Math.round(n * factor);
    if (!Number.isSafeInteger(minor)) {
        throw Object.assign(new Error("Amount out of range"), { code: "FINANCE_AMOUNT_INVALID" });
    }
    return minor;
}

export function fromMinorUnits(minor, currency = "ZAR") {
    const exp = currencyExponent(currency);
    const m = Number(minor);
    if (!Number.isSafeInteger(m)) {
        throw Object.assign(new Error("Invalid minor amount"), { code: "FINANCE_AMOUNT_INVALID" });
    }
    return m / 10 ** exp;
}

export function assertPositiveMinor(minor) {
    const m = Number(minor);
    if (!Number.isSafeInteger(m) || m <= 0) {
        throw Object.assign(new Error("amount must be a positive integer minor unit value"), {
            code: "FINANCE_AMOUNT_INVALID",
        });
    }
    return m;
}

export function addMinor(a, b) {
    const sum = Number(a) + Number(b);
    if (!Number.isSafeInteger(sum)) {
        throw Object.assign(new Error("Amount overflow"), { code: "FINANCE_AMOUNT_INVALID" });
    }
    return sum;
}
