import axios from "axios";
import { bootstrapEnv } from "./env/startupEnv.js";
import { WhatsAppApiError } from "./integrations/errors.js";
import {
    parseMetaWhatsAppError,
    getActionableHint,
    isWhatsAppDevMode,
} from "./integrations/metaWhatsAppErrors.js";

bootstrapEnv();

const SEQUENTIAL_SEND_DELAY_MS = 250;
const GRAPH_API_VERSION = "v21.0";

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

function assertOutboundCredentials(phoneNumberId) {
    if (!process.env.WHATSAPP_TOKEN) {
        const err = new Error("WHATSAPP_TOKEN is not set");
        console.error("[whatsapp]", err.message);
        throw err;
    }
    if (!phoneNumberId) {
        const err = new Error(
            "phoneNumberId is required for outbound WhatsApp (tenant integration or options)"
        );
        console.error("[whatsapp]", err.message);
        throw err;
    }
}

function graphMessagesUrl(phoneNumberId) {
    return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

function authHeaders() {
    return {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
    };
}

/**
 * @param {string} to
 * @param {string} text
 * @param {{ phoneNumberId?: string|null }} [options]
 */
export async function sendWhatsAppMessage(to, text, options = {}) {
    const phoneNumberId = resolveGraphPhoneNumberId(options);
    assertOutboundCredentials(phoneNumberId);

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping outbound send", {
            to,
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
            { headers: authHeaders() }
        );

        console.log("[whatsapp] Message sent", {
            id: response.data?.messages?.[0]?.id,
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
export async function sendWhatsAppImage(to, { link, caption, phoneNumberId: explicitPhoneId } = {}) {
    const phoneNumberId = resolveGraphPhoneNumberId({ phoneNumberId: explicitPhoneId });
    assertOutboundCredentials(phoneNumberId);

    if (!link) {
        throw new Error("Image link is required");
    }

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping outbound image", {
            to,
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
            { headers: authHeaders() }
        );

        console.log("[whatsapp] Image sent", {
            id: response.data?.messages?.[0]?.id,
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
 * @param {{ phoneNumberId?: string|null }} [options]
 */
export async function sendWhatsAppMessagesSequential(to, messages = [], options = {}) {
    const phoneNumberId = resolveGraphPhoneNumberId(options);
    const results = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.type === "image") {
            results.push(
                await sendWhatsAppImage(to, {
                    link: msg.link,
                    caption: msg.caption,
                    phoneNumberId,
                })
            );
        } else {
            results.push(await sendWhatsAppMessage(to, msg.text, { phoneNumberId }));
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
 * @param {{ phoneNumberId?: string|null }} [options]
 */
export async function sendWhatsAppTypingIndicator(messageId, options = {}) {
    if (!messageId) {
        console.warn("[whatsapp] Typing indicator skipped: missing messageId");
        return { skipped: true, reason: "missing_message_id" };
    }

    const phoneNumberId = resolveGraphPhoneNumberId(options);
    if (!process.env.WHATSAPP_TOKEN || !phoneNumberId) {
        console.warn("[whatsapp] Typing indicator skipped: credentials or phoneNumberId not set");
        return { skipped: true, reason: "not_configured" };
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
            { headers: authHeaders() }
        );

        console.log("[whatsapp] Typing indicator sent", {
            messageIdPrefix: String(messageId).slice(0, 24),
            phoneNumberIdSuffix: String(phoneNumberId).slice(-4),
        });
        return response.data;
    } catch (error) {
        const info = parseMetaWhatsAppError(error);
        console.warn("[whatsapp] Typing indicator failed (inbound processing continues):", {
            httpStatus: info.httpStatus,
            code: info.code,
            messageIdPrefix: String(messageId).slice(0, 24),
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

    const metaRes = await axios.get(`https://graph.facebook.com/${GRAPH_API_VERSION}/${id}`, {
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
