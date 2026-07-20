/**
 * WhatsApp adapter — wraps existing services/whatsapp.js and Meta webhook format.
 */
import crypto from "crypto";
import { BaseAdapter } from "./baseAdapter.js";
import { sendWhatsAppMessage } from "../../whatsapp.js";
import { createUnifiedMessage, CHANNELS } from "../types/unifiedMessage.js";
import { resolveCompanyFromPhoneNumberId } from "../types/integrationConfig.js";
import { WebhookValidationError } from "../errors.js";
import { logInfo, logWarn } from "../integrationLogger.js";

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
        const secret = process.env.META_APP_SECRET || process.env.APP_SECRET;
        if (!secret) return true;

        const signature = req.headers["x-hub-signature-256"];
        if (!signature) {
            logWarn(CHANNELS.WHATSAPP, null, "Missing X-Hub-Signature-256 header");
            return false;
        }

        const rawBody = req.rawBody || JSON.stringify(req.body);
        const expected =
            "sha256=" +
            crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expected)
            );
        } catch {
            return false;
        }
    }

    /**
     * Legacy /webhook GET verification + POST handler.
     */
    async webhookHandler(req, res, ctx = {}) {
        if (req.method === "GET") {
            const mode = req.query["hub.mode"];
            const token = req.query["hub.verify_token"];
            const challenge = req.query["hub.challenge"];

            logInfo(CHANNELS.WHATSAPP, ctx?.companyId, "Verification request", {
                mode,
                tokenMatch: token === process.env.VERIFY_TOKEN,
            });

            if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
                return res.status(200).type("text/plain").send(String(challenge));
            }
            return res.sendStatus(403);
        }

        if (req.method === "POST") {
            if (!this.validateWebhook(req)) {
                throw new WebhookValidationError("Invalid WhatsApp webhook signature", {
                    channel: CHANNELS.WHATSAPP,
                    companyId: ctx?.companyId,
                });
            }

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
