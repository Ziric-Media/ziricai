/**
 * Meta Graph helpers for WhatsApp Embedded Signup (server-side only).
 */
import { logError } from "./integrationLogger.js";
import { getMetaGraphVersion } from "./metaGraphVersion.js";

function graphVersion() {
    return getMetaGraphVersion();
}

function appId() {
    return String(process.env.META_APP_ID || process.env.FB_APP_ID || "").trim();
}

function appSecret() {
    return String(process.env.META_APP_SECRET || process.env.APP_SECRET || "").trim();
}

/**
 * @param {object} meta
 * @returns {string}
 */
export function humanizeMetaGraphError(meta = {}, fallback = "Meta API request failed") {
    const code = meta.code;
    const sub = meta.error_subcode;
    const msg = String(meta.message || fallback);

    if (sub === 36008 || /redirect_uri/i.test(msg)) {
        return "Meta could not validate the signup session. Close the popup and try Connect WhatsApp again.";
    }
    if (code === 190 || /access token/i.test(msg)) {
        return "Meta authorization expired or was revoked. Please connect WhatsApp again.";
    }
    if (code === 10 || /permission/i.test(msg)) {
        return "Meta denied access — ensure whatsapp_business_management and whatsapp_business_messaging are granted to the ZiricAI app.";
    }
    if (/invalid oauth/i.test(msg) || code === 100) {
        return "Meta rejected the authorization code. Try Connect WhatsApp again within a minute of completing Meta signup.";
    }
    return "We could not finish WhatsApp setup with Meta. Try again or contact support if this persists.";
}

async function graphGet(path, accessToken, query = {}) {
    const params = new URLSearchParams(query);
    const qs = params.toString();
    const url = `https://graph.facebook.com/${graphVersion()}${path}${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(humanizeMetaGraphError(data.error || {}, data.error?.message));
        err.status = res.status;
        err.meta = data.error || null;
        throw err;
    }
    return data;
}

async function graphPost(path, accessToken, body = null) {
    const url = `https://graph.facebook.com/${graphVersion()}${path}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(humanizeMetaGraphError(data.error || {}, data.error?.message));
        err.status = res.status;
        err.meta = data.error || null;
        throw err;
    }
    return data;
}

/**
 * Exchange Embedded Signup authorization code for a business access token.
 * @param {string} code
 * @returns {Promise<{ accessToken: string, tokenType?: string|null }>}
 */
export async function exchangeEmbeddedSignupCode(code) {
    const clientId = appId();
    const clientSecret = appSecret();
    if (!clientId || !clientSecret) {
        const err = new Error("Server Meta app credentials are not configured (META_APP_ID / META_APP_SECRET)");
        err.status = 503;
        throw err;
    }
    if (!code?.trim()) {
        const err = new Error("Authorization code from Meta is missing");
        err.status = 400;
        throw err;
    }

    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code).trim(),
    });

    const url = `https://graph.facebook.com/${graphVersion()}/oauth/access_token?${params}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.access_token) {
        logError("whatsapp", null, "Embedded signup code exchange failed", {
            httpStatus: res.status,
            metaCode: data.error?.code ?? null,
            metaSubcode: data.error?.error_subcode ?? null,
        });
        const err = new Error(humanizeMetaGraphError(data.error || {}));
        err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
        err.meta = data.error || null;
        throw err;
    }

    return {
        accessToken: String(data.access_token),
        tokenType: data.token_type || null,
    };
}

/**
 * @param {string} accessToken
 * @param {string} phoneNumberId
 */
export async function fetchPhoneNumberProfile(accessToken, phoneNumberId) {
    return graphGet(`/${encodeURIComponent(phoneNumberId)}`, accessToken, {
        fields: "display_phone_number,verified_name,quality_rating,status",
    });
}

/**
 * @param {string} accessToken
 * @param {string} wabaId
 */
export async function fetchWabaProfile(accessToken, wabaId) {
    return graphGet(`/${encodeURIComponent(wabaId)}`, accessToken, {
        fields: "name,id,account_review_status",
    });
}

/**
 * Subscribe ZiricAI app to customer WABA webhooks.
 * @param {string} accessToken
 * @param {string} wabaId
 */
export async function subscribeAppToWaba(accessToken, wabaId) {
    if (!wabaId) return { success: false, skipped: true };
    try {
        const result = await graphPost(`/${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken);
        return { success: true, result };
    } catch (err) {
        logError("whatsapp", null, "WABA subscribed_apps failed", {
            wabaId,
            error: err.message,
            metaCode: err.meta?.code ?? null,
        });
        return { success: false, error: err.message };
    }
}

/**
 * Verify phone + optional WABA are readable with the given token.
 * @param {{ accessToken: string, phoneNumberId: string, wabaId?: string|null }} params
 */
export async function verifyEmbeddedSignupAssets(params) {
    const { accessToken, phoneNumberId, wabaId } = params;
    const phone = await fetchPhoneNumberProfile(accessToken, phoneNumberId);
    let waba = null;
    let wabaSubscribed = null;

    if (wabaId) {
        waba = await fetchWabaProfile(accessToken, wabaId);
        wabaSubscribed = await subscribeAppToWaba(accessToken, wabaId);
    }

    return {
        displayPhoneNumber: phone.display_phone_number || null,
        verifiedBusinessName: phone.verified_name || waba?.name || null,
        phoneStatus: phone.status || null,
        wabaName: waba?.name || null,
        wabaReviewStatus: waba?.account_review_status || null,
        wabaWebhookSubscribed: Boolean(wabaSubscribed?.success),
    };
}
