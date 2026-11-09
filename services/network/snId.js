/**
 * SNET-01a — Sarah Network opaque identifiers (SN-ID). See docs/architecture/SNET_01a_SN_ID_ADR.md.
 *
 * Format: `sn_{kind}_{16 chars Crockford base32}` (80 random bits). Immutable; never derived from
 * companyId / uid / tenant slug.
 */
import { randomBytes } from "node:crypto";

export const SN_ID_KINDS = Object.freeze({
    BUSINESS: "biz",
    ORGANISATION: "org",
    BRANCH: "brn",
    AI_AGENT: "ai",
    PERSON: "per",
});

const KIND_VALUES = new Set(Object.values(SN_ID_KINDS));
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SN_ID_PATTERN = /^sn_(biz|org|brn|ai|per)_[0-9A-HJKMNP-TV-Z]{16}$/;

function base32(bytes) {
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    return out;
}

/**
 * @param {string} kind one of SN_ID_KINDS
 * @returns {string}
 */
export function mintSnId(kind) {
    if (!KIND_VALUES.has(kind)) {
        throw Object.assign(new Error(`Unknown SN-ID kind: ${kind}`), { status: 400, code: "SN_ID_KIND_INVALID" });
    }
    return `sn_${kind}_${base32(randomBytes(10))}`;
}

/** @param {unknown} value */
export function isValidSnId(value) {
    return typeof value === "string" && SN_ID_PATTERN.test(value);
}

/** @param {string} snId @returns {string|null} */
export function snIdKind(snId) {
    return isValidSnId(snId) ? snId.split("_")[1] : null;
}
