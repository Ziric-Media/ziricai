/**
 * WhatsApp adapter — wraps existing services/whatsapp.js and Meta webhook format.
 */
import { BaseAdapter } from "./baseAdapter.js";
import {
    sendWhatsAppMessage,
    sendWhatsAppMessagesSequential,
    resolveGraphPhoneNumberId,
} from "../../whatsapp.js";
import { createUnifiedMessage, CHANNELS } from "../types/unifiedMessage.js";
import {
    resolveCompanyFromPhoneNumberId,
} from "../types/integrationConfig.js";
import { WebhookValidationError } from "../errors.js";
import { logInfo, logWarn } from "../integrationLogger.js";
import {
    getVerifyToken,
    validateMetaWebhookSignature,
    verifyMetaWebhookToken,
} from "../metaWebhook.js";
import { getDefaultAiEmployee } from "../../tenants/aiEmployeeService.js";
import { getWhatsAppIntegration } from "../../tenants/integrationService.js";
import {
    resolveWhatsAppCredentials,
    WhatsAppCredentialError,
} from "../whatsappCredentials.js";

export class WhatsAppAdapter extends BaseAdapter {
    getChannelType() {
        return CHANNELS.WHATSAPP;
    }

    /**
     * Shared-token multi-phone: token is global; Graph phone id is per-tenant.
     */
    isConfigured(_ctx = {}) {
        return Boolean(process.env.WHATSAPP_TOKEN);
    }

    /**
     * Resolve outbound Meta phone_number_id: payload → ctx → tenant integration → env fallback.
     * @param {{ companyId?: string|null, phoneNumberId?: string|null }} ctx
     * @param {{ phoneNumberId?: string|null }} payload
     */
    async resolveOutboundPhoneNumberId(ctx = {}, payload = {}) {
        const explicit = payload?.phoneNumberId || ctx?.phoneNumberId;
        if (explicit) return String(explicit).trim();

        if (ctx?.companyId) {
            try {
                const integration = await getWhatsAppIntegration(ctx.companyId);
                if (integration?.phoneNumberId) {
                    const tenantPhone = String(integration.phoneNumberId).trim();
                    const explicit = payload?.phoneNumberId || ctx?.phoneNumberId;
                    if (
                        explicit &&
                        String(explicit).trim() &&
                        String(explicit).trim() !== tenantPhone
                    ) {
                        throw new WhatsAppCredentialError(
                            "phone_number_id_mismatch",
                            "Outbound phoneNumberId does not match tenant WhatsApp integration",
                            { companyId: ctx.companyId }
                        );
                    }
                    return tenantPhone;
                }
                throw new WhatsAppCredentialError(
                    "phone_number_id_missing",
                    "Tenant WhatsApp integration has no phoneNumberId",
                    { companyId: ctx.companyId }
                );
            } catch (err) {
                if (err instanceof WhatsAppCredentialError) throw err;
                logWarn(CHANNELS.WHATSAPP, ctx.companyId, "Failed to load WhatsApp integration for outbound", {
                    error: err.message,
                });
                throw new WhatsAppCredentialError(
                    "integration_not_found",
                    "WhatsApp integration not found for tenant",
                    { companyId: ctx.companyId }
                );
            }
        }

        return resolveGraphPhoneNumberId({});
    }

    async sendMessage(ctx, payload) {
        const { to, text, messages } = payload;
        const companyId = ctx?.companyId || null;
        const phoneNumberId = await this.resolveOutboundPhoneNumberId(ctx, payload);

        let accessToken;
        let credentialsSource;
        if (companyId) {
            const creds = await resolveWhatsAppCredentials(companyId);
            accessToken = creds.accessToken;
            credentialsSource = creds.credentialsSource;
        }

        const sendOptions = {
            phoneNumberId,
            companyId,
            accessToken,
            credentialsSource,
        };

        logInfo(CHANNELS.WHATSAPP, companyId, "Sending message", {
            to,
            parts: messages?.length || (text ? 1 : 0),
            credentialsSource: credentialsSource || (companyId ? null : "env"),
            phoneNumberIdSuffix: phoneNumberId ? String(phoneNumberId).slice(-4) : null,
        });
        if (Array.isArray(messages) && messages.length) {
            return sendWhatsAppMessagesSequential(to, messages, sendOptions);
        }
        return sendWhatsAppMessage(to, text, sendOptions);
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
        const companyId = ctx?.companyId || (await resolveCompanyFromPhoneNumberId(phoneNumberId));

        if (companyId) {
            const agent = await getDefaultAiEmployee(companyId).catch(() => null);
            console.log("[whatsapp] AI employee resolved", {
                companyId,
                agentId: agent?.id || null,
                agentName: agent?.name || null,
            });
        }

        const contactName = value?.contacts?.[0]?.profile?.name || null;
        const from = message.from;
        const text = message.text?.body || "";
        const messageType = message.type;

        const mediaPayload = messageType !== "text" ? message?.[messageType] || null : null;
        const mediaId = mediaPayload?.id || null;
        const media = mediaId
            ? [
                  {
                      type: messageType,
                      id: mediaId,
                      mimeType: mediaPayload?.mime_type || null,
                      voice: Boolean(mediaPayload?.voice),
                  },
              ]
            : messageType !== "text"
              ? [{ type: messageType, id: null, mimeType: null, voice: false }]
              : [];

        return createUnifiedMessage({
            companyId,
            channel: CHANNELS.WHATSAPP,
            externalId: message.id,
            from,
            to: phoneNumberId || process.env.PHONE_NUMBER_ID || "",
            text,
            media,
            timestamp: message.timestamp
                ? new Date(Number(message.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
            metadata: {
                messageType,
                contactName,
                phoneNumberId,
                displayPhone: value?.metadata?.display_phone_number,
                voiceNote: messageType === "audio" && Boolean(mediaPayload?.voice),
            },
        });
    }

    async downloadMedia(_ctx, mediaId) {
        const { downloadWhatsAppMedia } = await import("../../whatsapp.js");
        return downloadWhatsAppMedia(mediaId);
    }

    async getProfile(_ctx, userId) {
        return { id: userId, channel: CHANNELS.WHATSAPP };
    }

    validateWebhook(req) {
        const result = validateMetaWebhookSignature(req);
        if (!result.valid) {
            logWarn(CHANNELS.WHATSAPP, null, "Webhook signature rejected", {
                reason: result.reason || "Webhook signature validation failed",
            });
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
            const verifyTokenConfigured = Boolean(getVerifyToken());
            const tokenMatch = verifyMetaWebhookToken(token);

            logInfo(CHANNELS.WHATSAPP, ctx?.companyId, "Verification request", {
                mode,
                tokenMatch,
                verifyTokenConfigured,
            });

            if (mode === "subscribe" && tokenMatch) {
                return res.status(200).type("text/plain").send(String(challenge));
            }

            if (!mode && !token && !challenge) {
                return res.status(403).json({
                    error: "Forbidden",
                    hint: "Meta webhook verify requires hub.mode=subscribe and matching hub.verify_token.",
                    verifyTokenConfigured,
                });
            }

            if (mode === "subscribe" && !verifyTokenConfigured) {
                logWarn(CHANNELS.WHATSAPP, ctx?.companyId, "VERIFY_TOKEN not configured on server");
            } else if (mode === "subscribe" && !tokenMatch) {
                logWarn(
                    CHANNELS.WHATSAPP,
                    ctx?.companyId,
                    "Verify token mismatch (check Railway VERIFY_TOKEN vs Meta Console)"
                );
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
