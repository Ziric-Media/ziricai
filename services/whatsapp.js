import axios from "axios";
import { bootstrapEnv } from "./env/startupEnv.js";
import { WhatsAppApiError } from "./integrations/errors.js";
import {
    parseMetaWhatsAppError,
    getActionableHint,
    isWhatsAppDevMode,
} from "./integrations/metaWhatsAppErrors.js";
import {
    resolveWhatsAppCredentials,
    WhatsAppCredentialError,
} from "./integrations/whatsappCredentials.js";
import { getMetaGraphVersion } from "./integrations/metaGraphVersion.js";

export { WhatsAppCredentialError };

bootstrapEnv();

const SEQUENTIAL_SEND_DELAY_MS = 250;
function graphApiVersion() {
    return getMetaGraphVersion();
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve Meta Graph phone_number_id for outbound.
 * Prefer explicit tenant phoneNumberId; fall back to env only for legacy single-number.
 * @param {{ phoneNumberId?: string|null, phone_number_id?: string|null }} [options]
 * @returns {string|null}
 */
export function resolveGraphPhoneNumberId(options = {}) {
    const explicit = options.phoneNumberId ?? options.phone_number_id;
    if (explicit != null && String(explicit).trim()) {
        return String(explicit).trim();
    }
    const envId = process.env.PHONE_NUMBER_ID;
    return envId && String(envId).trim() ? String(envId).trim() : null;
}

function graphMessagesUrl(phoneNumberId) {
    return `https://graph.facebook.com/${graphApiVersion()}/${phoneNumberId}/messages`;
}

/**
 * @param {{ companyId?: string|null, accessToken?: string, credentialsSource?: string }} options
 */
async function resolveOutboundAuth(options = {}) {
    if (options.accessToken && String(options.accessToken).trim()) {
        return {
            accessToken: String(options.accessToken).trim(),
            credentialsSource: options.credentialsSource || "provided",
        };
    }
    const creds = await resolveWhatsAppCredentials(options.companyId ?? null);
    return creds;
}

function authHeaders(accessToken) {
    return {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
}

async function assertOutboundSendContext(options = {}) {
    const phoneNumberId = resolveGraphPhoneNumberId(options);
    if (!phoneNumberId) {
        const err = new WhatsAppCredentialError(
            "phone_number_id_missing",
            "phoneNumberId is required for outbound WhatsApp (tenant integration or options)",
            { companyId: options.companyId ?? null }
        );
        console.error("[whatsapp]", err.message, { companyId: options.companyId ?? null });
        throw err;
    }
    const auth = await resolveOutboundAuth(options);
    return { phoneNumberId, accessToken: auth.accessToken, credentialsSource: auth.credentialsSource };
}

/**
 * @param {string} to
 * @param {string} text
 * @param {{ phoneNumberId?: string|null, companyId?: string|null, accessToken?: string, credentialsSource?: string }} [options]
 */
export async function sendWhatsAppMessage(to, text, options = {}) {
    const ctx = await assertOutboundSendContext(options);
    const { phoneNumberId, accessToken, credentialsSource } = ctx;

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping outbound send", {
            to,
            companyId: options.companyId ?? null,
            credentialsSource,
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
            textLen: text?.length ?? 0,
        });
        return { devMode: true, skipped: true, to, phoneNumberId };
    }

    try {
        const response = await axios.post(
            graphMessagesUrl(phoneNumberId),
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "text",
                text: { body: text },
            },
            { headers: authHeaders(accessToken) }
        );

        console.log("[whatsapp] Message sent", {
            id: response.data?.messages?.[0]?.id,
            companyId: options.companyId ?? null,
            credentialsSource,
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
        });
        return response.data;
    } catch (error) {
        const info = parseMetaWhatsAppError(error);
        console.error("[whatsapp] Meta API error:", info.httpStatus, JSON.stringify(error.response?.data));
        const hint = getActionableHint(info.code);
        if (hint) {
            console.error("[whatsapp]", hint);
        }
        throw new WhatsAppApiError(info.message, {
            metaCode: info.code,
            httpStatus: info.httpStatus,
            retryable: info.retryable,
            cause: error,
        });
    }
}

/**
 * Send a native WhatsApp image message via Meta Graph API.
 * @param {string} to
 * @param {{ link: string, caption?: string, phoneNumberId?: string|null }} options
 */
export async function sendWhatsAppImage(
    to,
    { link, caption, phoneNumberId: explicitPhoneId, companyId, accessToken, credentialsSource } = {}
) {
    const ctx = await assertOutboundSendContext({
        phoneNumberId: explicitPhoneId,
        companyId,
        accessToken,
        credentialsSource,
    });
    const { phoneNumberId, accessToken: token, credentialsSource: source } = ctx;

    if (!link) {
        throw new Error("Image link is required");
    }

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping outbound image", {
            to,
            companyId: companyId ?? null,
            credentialsSource: source,
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
            linkPrefix: String(link).slice(0, 48),
            captionLen: caption?.length ?? 0,
        });
        return { devMode: true, skipped: true, to, type: "image", link, phoneNumberId };
    }

    const imagePayload = { link };
    if (caption) imagePayload.caption = caption;

    try {
        const response = await axios.post(
            graphMessagesUrl(phoneNumberId),
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "image",
                image: imagePayload,
            },
            { headers: authHeaders(token) }
        );

        console.log("[whatsapp] Image sent", {
            id: response.data?.messages?.[0]?.id,
            companyId: companyId ?? null,
            credentialsSource: source,
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
        });
        return response.data;
    } catch (error) {
        const info = parseMetaWhatsAppError(error);
        console.error("[whatsapp] Meta API image error:", info.httpStatus, JSON.stringify(error.response?.data));
        const hint = getActionableHint(info.code);
        if (hint) {
            console.error("[whatsapp]", hint);
        }
        throw new WhatsAppApiError(info.message, {
            metaCode: info.code,
            httpStatus: info.httpStatus,
            retryable: info.retryable,
            cause: error,
        });
    }
}

/**
 * Send multiple WhatsApp messages in order with a small delay between each.
 * @param {string} to
 * @param {Array<{ type: 'text', text: string }|{ type: 'image', link: string, caption?: string }>} messages
 * @param {{ phoneNumberId?: string|null, companyId?: string|null, accessToken?: string, credentialsSource?: string }} [options]
 */
export async function sendWhatsAppMessagesSequential(to, messages = [], options = {}) {
    const sendContext = await assertOutboundSendContext(options);
    const results = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const childOpts = {
            phoneNumberId: sendContext.phoneNumberId,
            companyId: options.companyId,
            accessToken: sendContext.accessToken,
            credentialsSource: sendContext.credentialsSource,
        };
        if (msg.type === "image") {
            results.push(
                await sendWhatsAppImage(to, {
                    link: msg.link,
                    caption: msg.caption,
                    ...childOpts,
                })
            );
        } else {
            results.push(await sendWhatsAppMessage(to, msg.text, childOpts));
        }
        if (i < messages.length - 1) {
            await delay(SEQUENTIAL_SEND_DELAY_MS);
        }
    }
    return results;
}

/**
 * Show WhatsApp typing indicator and mark the inbound message as read.
 * Meta dismisses typing when an outbound message is sent or after ~25 seconds.
 * @param {string} messageId - Inbound wamid from webhook (messages.id)
 * @param {{ phoneNumberId?: string|null, companyId?: string|null, accessToken?: string, credentialsSource?: string }} [options]
 */
export async function sendWhatsAppTypingIndicator(messageId, options = {}) {
    if (!messageId) {
        console.warn("[whatsapp] Typing indicator skipped: missing messageId");
        return { skipped: true, reason: "missing_message_id" };
    }

    let phoneNumberId;
    let accessToken;
    try {
        const ctx = await assertOutboundSendContext(options);
        phoneNumberId = ctx.phoneNumberId;
        accessToken = ctx.accessToken;
    } catch (err) {
        console.warn("[whatsapp] Typing indicator skipped:", err.message);
        return { skipped: true, reason: err.code || "not_configured" };
    }

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping typing indicator", {
            messageIdPrefix: String(messageId).slice(0, 24),
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
        });
        return { devMode: true, skipped: true, phoneNumberId };
    }

    try {
        const response = await axios.post(
            graphMessagesUrl(phoneNumberId),
            {
                messaging_product: "whatsapp",
                status: "read",
                message_id: messageId,
                typing_indicator: {
                    type: "text",
                },
            },
            { headers: authHeaders(accessToken) }
        );

        console.log("[whatsapp] Typing indicator sent", {
            messageIdPrefix: String(messageId).slice(0, 24),
            companyId: options.companyId ?? null,
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
        });
        return response.data;
    } catch (error) {
        const info = parseMetaWhatsAppError(error);
        console.warn("[whatsapp] Typing indicator failed (inbound processing continues):", {
            httpStatus: info.httpStatus,
            code: info.code,
            messageIdPrefix: String(messageId).slice(0, 24),
            companyId: options.companyId ?? null,
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
        });
        return { success: false, error: info.message };
    }
}

/**
 * Download inbound WhatsApp media by Meta media id (not wamid).
 * GET graph /{mediaId} → url, then GET url with Bearer token.
 * @param {string} mediaId
 * @returns {Promise<{ buffer: Buffer, mimeType: string, fileSize: number|null, mediaId: string }>}
 */
export async function downloadWhatsAppMedia(mediaId) {
    const id = String(mediaId || "").trim();
    if (!id) {
        throw new Error("mediaId is required to download WhatsApp media");
    }
    if (!process.env.WHATSAPP_TOKEN) {
        throw new Error("WHATSAPP_TOKEN is not set");
    }

    const metaRes = await axios.get(`https://graph.facebook.com/${graphApiVersion()}/${id}`, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        timeout: 20000,
    });

    const downloadUrl = metaRes.data?.url;
    const mimeType = metaRes.data?.mime_type || "application/octet-stream";
    const fileSize = metaRes.data?.file_size ?? null;

    if (!downloadUrl) {
        throw new Error("Meta media metadata did not include a download URL");
    }

    const binRes = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        responseType: "arraybuffer",
        timeout: 60000,
    });

    const buffer = Buffer.from(binRes.data);
    console.log("[whatsapp] Media downloaded", {
        mediaIdSuffix: id.slice(-6),
        mimeType,
        bytes: buffer.length,
        fileSize,
    });

    return { buffer, mimeType, fileSize, mediaId: id };
}
