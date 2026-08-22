/**
 * WhatsApp adapter — wraps existing services/whatsapp.js and Meta webhook format.
 */
import { BaseAdapter } from "./baseAdapter.js";
import { sendWhatsAppMessage } from "../../whatsapp.js";
import { createUnifiedMessage, CHANNELS } from "../types/unifiedMessage.js";
import { resolveCompanyFromPhoneNumberId } from "../types/integrationConfig.js";
import { WebhookValidationError } from "../errors.js";
import { logInfo, logWarn } from "../integrationLogger.js";
import {
    getVerifyToken,
    validateMetaWebhookSignature,
    verifyMetaWebhookToken,
} from "../metaWebhook.js";

export class WhatsAppAdapter extends BaseAdapter {
    getChannelType() {
        return CHANNELS.WHATSAPP;
    }

    isConfigured(_ctx = {}) {
        return Boolean(process.env.PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN);
    }

    async sendMessage(ctx, payload) {
        const { to, text } = payload;
        logInfo(CHANNELS.WHATSAPP, ctx?.companyId, "Sending message", { to });
        return sendWhatsAppMessage(to, text);
    }

    /**
     * Parse Meta WhatsApp Cloud API webhook body.
     */
    async receiveMessage(ctx, rawPayload) {
        const entry = rawPayload?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (!message) return null;

        const phoneNumberId = value?.metadata?.phone_number_id;
        const companyId =
            ctx?.companyId || resolveCompanyFromPhoneNumberId(phoneNumberId);
        const contactName = value?.contacts?.[0]?.profile?.name || null;
        const from = message.from;
        const text = message.text?.body || "";
        const messageType = message.type;

        return createUnifiedMessage({
            companyId,
            channel: CHANNELS.WHATSAPP,
            externalId: message.id,
            from,
            to: phoneNumberId || process.env.PHONE_NUMBER_ID || "",
            text,
            media: messageType !== "text" ? [{ type: messageType, id: message.id }] : [],
            timestamp: message.timestamp
                ? new Date(Number(message.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
            metadata: {
                messageType,
                contactName,
                phoneNumberId,
                displayPhone: value?.metadata?.display_phone_number,
            },
        });
    }

    async getProfile(_ctx, userId) {
        return { id: userId, channel: CHANNELS.WHATSAPP };
    }

    validateWebhook(req) {
        const result = validateMetaWebhookSignature(req);
        if (!result.valid) {
            logWarn(CHANNELS.WHATSAPP, null, result.reason || "Webhook signature validation failed");
        }
        return result.valid;
    }

    /**
     * Legacy /webhook GET verification + POST handler.
     */
    async webhookHandler(req, res, ctx = {}) {
        if (req.method === "GET") {
            const mode = req.query["hub.mode"];
            const token = req.query["hub.verify_token"];
            const challenge = req.query["hub.challenge"];
            const tokenMatch = verifyMetaWebhookToken(token);

            logInfo(CHANNELS.WHATSAPP, ctx?.companyId, "Verification request", {
                mode,
                tokenMatch,
                verifyTokenConfigured: Boolean(getVerifyToken()),
            });

            if (mode === "subscribe" && tokenMatch) {
                return res.status(200).type("text/plain").send(String(challenge));
            }
            return res.sendStatus(403);
        }

        if (req.method === "POST") {
            const value = req.body?.entry?.[0]?.changes?.[0]?.value;
            if (value?.statuses?.length && !value?.messages?.length) {
                logInfo(CHANNELS.WHATSAPP, ctx?.companyId, "Delivery/status update only");
                return res.sendStatus(200);
            }

            return { handled: true, body: req.body };
        }

        return res.sendStatus(405);
    }
}

export const whatsappAdapter = new WhatsAppAdapter();
