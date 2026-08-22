/**
 * Meta WhatsApp webhook helpers — raw body capture, verify token, HMAC signature.
 */
import crypto from "crypto";

/** Canonical Meta callback path (also used in Meta Developer Console). */
export const CANONICAL_WHATSAPP_WEBHOOK_PATH = "/webhook";

/**
 * Normalize request path for webhook routing (no query string, no trailing slash).
 * @param {import('express').Request} req
 */
export function normalizeWebhookPath(req) {
    const raw = req.originalUrl || req.url || req.path || "";
    const pathOnly = String(raw).split("?")[0].replace(/\/+$/, "") || "/";
    return pathOnly;
}

/**
 * @param {string} path
 */
export function isMetaWebhookPath(path) {
    return path === CANONICAL_WHATSAPP_WEBHOOK_PATH || path.startsWith("/webhooks/");
}

export function getVerifyToken() {
    return String(
        process.env.VERIFY_TOKEN ||
            process.env.WHATSAPP_VERIFY_TOKEN ||
            process.env.WEBHOOK_VERIFY_TOKEN ||
            ""
    ).trim();
}

export function getMetaAppSecret() {
    return String(process.env.META_APP_SECRET || process.env.APP_SECRET || "").trim();
}

/**
 * Validate X-Hub-Signature-256 against raw request bytes.
 * @param {import('express').Request} req
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateMetaWebhookSignature(req) {
    const secret = getMetaAppSecret();
    if (!secret) {
        return { valid: false, reason: "META_APP_SECRET not configured" };
    }

    const signatureHeader = req.get("x-hub-signature-256");
    if (!signatureHeader) {
        return { valid: false, reason: "Missing X-Hub-Signature-256 header" };
    }

    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature.startsWith("sha256=")) {
        return { valid: false, reason: "Invalid X-Hub-Signature-256 format" };
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
        return { valid: false, reason: "Raw request body not captured" };
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
    const expected =
        "sha256=" + crypto.createHmac("sha256", secret).update(bodyBuffer).digest("hex");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (sigBuf.length !== expectedBuf.length) {
        return { valid: false, reason: "Invalid WhatsApp webhook signature" };
    }

    try {
        if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return { valid: false, reason: "Invalid WhatsApp webhook signature" };
        }
    } catch {
        return { valid: false, reason: "Invalid WhatsApp webhook signature" };
    }

    return { valid: true };
}

/**
 * Compare hub.verify_token from Meta subscription handshake.
 * @param {string|undefined|null} token
 */
export function verifyMetaWebhookToken(token) {
    const expected = getVerifyToken();
    if (!expected) return false;
    return String(token || "").trim() === expected;
}
