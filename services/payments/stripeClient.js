/**
 * Stripe Checkout Sessions (one-time payment for RS02 consumer plans).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secretKey() {
    return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

function webhookSecret() {
    return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

export function stripeConfigured() {
    return secretKey().length > 10;
}

export function stripePublishableKey() {
    return String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
}

/** @param {string} method @param {string} path @param {URLSearchParams | object} [body] */
async function stripeRequest(method, path, body) {
    const key = secretKey();
    if (!key) return { ok: false, error: "STRIPE_NOT_CONFIGURED" };
    const headers = {
        Authorization: `Bearer ${key}`,
    };
    let payload;
    if (body && method !== "GET") {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) {
            if (v === undefined || v === null) continue;
            params.append(k, String(v));
        }
        payload = params.toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const res = await fetch(`https://api.stripe.com${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : payload,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
        return { ok: false, error: json.error?.message || "Stripe request failed", data: json };
    }
    return { ok: true, data: json };
}

export async function stripeCreateCheckoutSession({
    email,
    amountCents,
    currency,
    reference,
    successUrl,
    cancelUrl,
    productName,
    metadata,
}) {
    const cur = String(currency || "ZAR").toLowerCase();
    const meta = metadata || {};
    const body = {
        mode: "payment",
        customer_email: email,
        client_reference_id: reference,
        success_url: successUrl,
        cancel_url: cancelUrl,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": cur,
        "line_items[0][price_data][unit_amount]": Math.max(100, Number(amountCents) || 0),
        "line_items[0][price_data][product_data][name]": productName || "Sarah plan",
    };
    for (const [k, v] of Object.entries(meta)) {
        body[`metadata[${k}]`] = String(v);
    }
    return stripeRequest("POST", "/v1/checkout/sessions", body);
}

export async function stripeRetrieveCheckoutSession(sessionId) {
    const id = encodeURIComponent(String(sessionId || "").trim());
    if (!id) return { ok: false, error: "SESSION_ID_REQUIRED" };
    return stripeRequest("GET", `/v1/checkout/sessions/${id}`);
}

export function verifyStripeWebhookSignature(rawBody, signatureHeader) {
    const secret = webhookSecret();
    if (!secret || !signatureHeader) return false;
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
    const parts = String(signatureHeader).split(",").reduce((acc, piece) => {
        const [k, v] = piece.split("=");
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
    }, {});
    const ts = parts.t;
    const v1 = parts.v1;
    if (!ts || !v1) return false;
    const toleranceSec = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SEC || 300);
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
    if (!Number.isFinite(Number(ts)) || age > toleranceSec) return false;
    const signed = `${ts}.${buf.toString("utf8")}`;
    const expected = createHmac("sha256", secret).update(signed).digest("hex");
    if (expected.length !== v1.length) return false;
    try {
        return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    } catch {
        return false;
    }
}
