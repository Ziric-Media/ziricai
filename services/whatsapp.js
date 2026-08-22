import axios from "axios";
import { bootstrapEnv } from "./env/startupEnv.js";
import { WhatsAppApiError } from "./integrations/errors.js";
import {
    parseMetaWhatsAppError,
    getActionableHint,
    isWhatsAppDevMode,
} from "./integrations/metaWhatsAppErrors.js";

bootstrapEnv();

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
