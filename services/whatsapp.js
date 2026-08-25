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

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWhatsAppMessage(to, text) {
    if (!process.env.PHONE_NUMBER_ID || !process.env.WHATSAPP_TOKEN) {
        const err = new Error("PHONE_NUMBER_ID or WHATSAPP_TOKEN is not set");
        console.error("[whatsapp]", err.message);
        throw err;
    }

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping outbound send", {
            to,
            textLen: text?.length ?? 0,
        });
        return { devMode: true, skipped: true, to };
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "text",
                text: { body: text },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("[whatsapp] Message sent, id:", response.data?.messages?.[0]?.id);
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
 * @param {{ link: string, caption?: string }} options
 */
export async function sendWhatsAppImage(to, { link, caption } = {}) {
    if (!process.env.PHONE_NUMBER_ID || !process.env.WHATSAPP_TOKEN) {
        const err = new Error("PHONE_NUMBER_ID or WHATSAPP_TOKEN is not set");
        console.error("[whatsapp]", err.message);
        throw err;
    }

    if (!link) {
        throw new Error("Image link is required");
    }

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping outbound image", {
            to,
            linkPrefix: String(link).slice(0, 48),
            captionLen: caption?.length ?? 0,
        });
        return { devMode: true, skipped: true, to, type: "image", link };
    }

    const imagePayload = { link };
    if (caption) imagePayload.caption = caption;

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "image",
                image: imagePayload,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("[whatsapp] Image sent, id:", response.data?.messages?.[0]?.id);
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
 */
export async function sendWhatsAppMessagesSequential(to, messages = []) {
    const results = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.type === "image") {
            results.push(await sendWhatsAppImage(to, { link: msg.link, caption: msg.caption }));
        } else {
            results.push(await sendWhatsAppMessage(to, msg.text));
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
 */
export async function sendWhatsAppTypingIndicator(messageId) {
    if (!messageId) {
        console.warn("[whatsapp] Typing indicator skipped: missing messageId");
        return { skipped: true, reason: "missing_message_id" };
    }

    if (!process.env.PHONE_NUMBER_ID || !process.env.WHATSAPP_TOKEN) {
        console.warn("[whatsapp] Typing indicator skipped: credentials not set");
        return { skipped: true, reason: "not_configured" };
    }

    if (isWhatsAppDevMode()) {
        console.log("[whatsapp] WHATSAPP_DEV_MODE: skipping typing indicator", {
            messageIdPrefix: String(messageId).slice(0, 24),
        });
        return { devMode: true, skipped: true };
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                status: "read",
                message_id: messageId,
                typing_indicator: {
                    type: "text",
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("[whatsapp] Typing indicator sent", {
            messageIdPrefix: String(messageId).slice(0, 24),
        });
        return response.data;
    } catch (error) {
        const info = parseMetaWhatsAppError(error);
        console.warn("[whatsapp] Typing indicator failed (inbound processing continues):", {
            httpStatus: info.httpStatus,
            code: info.code,
            messageIdPrefix: String(messageId).slice(0, 24),
        });
        return { success: false, error: info.message };
    }
}
