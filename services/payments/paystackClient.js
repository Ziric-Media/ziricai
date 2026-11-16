/**
 * Paystack — initialize and verify transactions (ZAR).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secretKey() {
    return String(process.env.PAYSTACK_SECRET_KEY || "").trim();
}

export function paystackConfigured() {
    return secretKey().length > 10;
}

export function paystackPublicKey() {
    return String(process.env.PAYSTACK_PUBLIC_KEY || "").trim();
}

/** @param {string} method @param {string} path @param {object} [body] */
async function paystackRequest(method, path, body) {
    const key = secretKey();
    if (!key) return { ok: false, error: "PAYSTACK_NOT_CONFIGURED" };
    const res = await fetch(`https://api.paystack.co${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === false) {
        return { ok: false, error: json.message || "Paystack request failed", data: json };
    }
    return { ok: true, data: json.data };
}

export async function paystackInitializeTransaction({ email, amountCents, reference, callbackUrl, metadata }) {
    return paystackRequest("POST", "/transaction/initialize", {
        email,
        amount: Math.max(100, Number(amountCents) || 0),
        currency: "ZAR",
        reference,
        callback_url: callbackUrl,
        metadata,
    });
}

export async function paystackVerifyTransaction(reference) {
    const ref = encodeURIComponent(String(reference || "").trim());
    if (!ref) return { ok: false, error: "REFERENCE_REQUIRED" };
    return paystackRequest("GET", `/transaction/verify/${ref}`);
}

export function verifyPaystackWebhookSignature(rawBody, signatureHeader) {
    const key = secretKey();
    if (!key || !signatureHeader) return false;
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
    const hash = createHmac("sha512", key).update(buf).digest("hex");
    const sig = String(signatureHeader);
    if (hash.length !== sig.length) return false;
    try {
        return timingSafeEqual(Buffer.from(hash, "utf8"), Buffer.from(sig, "utf8"));
    } catch {
        return false;
    }
}
