/**
 * Meta WhatsApp Cloud API error parsing and retry policy.
 */

const CONFIG_ERROR_CODE_MIN = 131000;
const CONFIG_ERROR_CODE_MAX = 131999;

const RETRYABLE_META_CODES = new Set([
    2, // Temporary API service issue
    4, // API Too Many Calls
    80007, // Rate limit
    130429, // Throughput rate limit
]);

/**
 * @param {{ code?: number|null, httpStatus?: number|null }} params
 * @returns {boolean}
 */
export function isRetryableMetaWhatsAppError({ code, httpStatus }) {
    if (httpStatus === 429) return true;
    if (httpStatus != null && httpStatus >= 500 && httpStatus < 600) return true;
    if (code != null && RETRYABLE_META_CODES.has(code)) return true;
    if (code != null && code >= CONFIG_ERROR_CODE_MIN && code <= CONFIG_ERROR_CODE_MAX) return false;
    if (code === 190 || code === 102 || code === 10) return false;
    if (httpStatus != null && httpStatus >= 400 && httpStatus < 500) return false;
    if (httpStatus != null && httpStatus >= 500) return true;
    return false;
}

/**
 * @param {import('axios').AxiosError|Error} error
 */
export function parseMetaWhatsAppError(error) {
    const httpStatus = error.response?.status ?? null;
    const meta = error.response?.data?.error ?? {};
    const code = typeof meta.code === "number" ? meta.code : null;
    const subcode = typeof meta.error_subcode === "number" ? meta.error_subcode : null;
    const type = meta.type ?? null;
    const message = meta.message || error.message || "WhatsApp API request failed";
    const retryable = isRetryableMetaWhatsAppError({ code, httpStatus });

    return { code, subcode, type, message, httpStatus, retryable };
}

/**
 * @param {number|null} code
 * @returns {string|null}
 */
export function getActionableHint(code) {
    if (code === 131030) {
        return (
            "Dev allowlist: add the recipient number (E.164 digits only, e.g. 27821234567) under " +
            "Meta → WhatsApp → API Setup → To list, then message again."
        );
    }
    if (code != null && code >= CONFIG_ERROR_CODE_MIN && code <= CONFIG_ERROR_CODE_MAX) {
        return "WhatsApp configuration error — check Meta Business Manager settings; retries will not help.";
    }
    return null;
}

export function isWhatsAppDevMode() {
    if (process.env.WHATSAPP_DEV_MODE === "true") return true;
    if (process.env.PHONE_NUMBER_ID === "123456123") return true;
    return false;
}

/**
 * @param {Error & { retryable?: boolean, metaCode?: number|null }} err
 */
export function isRetryableOutboundError(err) {
    if (err?.name === "WhatsAppApiError") return Boolean(err.retryable);
    if (typeof err?.retryable === "boolean") return err.retryable;
    return true;
}
