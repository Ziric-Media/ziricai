/**
 * Webhook router — canonical /webhook and unified /webhooks/:channel routes.
 */
import { getAdapter, normalizeChannel } from "./adapterRegistry.js";
import { ingestBatch } from "./conversationPipeline.js";
import { WebhookValidationError, IntegrationError } from "./errors.js";
import { logInfo, logError, logWarn } from "./integrationLogger.js";
import { CANONICAL_WHATSAPP_WEBHOOK_PATH, validateMetaWebhookSignature } from "./metaWebhook.js";
import {
    resolveCompanyFromPhoneNumberId,
    maskPhoneNumberId,
} from "./types/integrationConfig.js";

function isProduction() {
    return process.env.NODE_ENV === "production";
}

function extractPhoneNumberId(body) {
    return body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || null;
}

function resolveWebhookCompanyId(explicitCompanyId, phoneNumberId) {
    if (explicitCompanyId) return explicitCompanyId;
    if (isProduction()) return null;
    return process.env.DEFAULT_COMPANY_ID || null;
}

/**
 * Canonical WhatsApp webhook handler (GET verify + POST inbound).
 * Used by /webhook and delegated from /webhooks/whatsapp.
 */
export async function handleWhatsAppWebhook(req, res, companyId = null) {
    const adapter = getAdapter("whatsapp");
    let ctx = { companyId: resolveWebhookCompanyId(companyId, null) };

    try {
        if (req.method === "GET") {
            return adapter.webhookHandler(req, res, ctx);
        }

        if (req.method === "POST") {
            const signature = validateMetaWebhookSignature(req);
            if (!signature.valid) {
                logWarn("whatsapp", ctx.companyId, "Webhook POST rejected", {
                    reason: signature.reason,
                    path: CANONICAL_WHATSAPP_WEBHOOK_PATH,
                });
                console.error("[webhook] POST rejected:", signature.reason);
                throw new WebhookValidationError("Invalid WhatsApp webhook signature", {
                    channel: "whatsapp",
                    companyId: ctx.companyId,
                    reason: signature.reason,
                });
            }

            const phoneNumberId = extractPhoneNumberId(req.body);
            const resolvedCompanyId =
                companyId || (phoneNumberId ? await resolveCompanyFromPhoneNumberId(phoneNumberId) : null);
            ctx = { companyId: resolvedCompanyId };

            const summary = summarizeWebhookBody(req.body);
            logInfo("whatsapp", ctx.companyId, `Incoming POST (${CANONICAL_WHATSAPP_WEBHOOK_PATH})`, summary);

            const handlerResult = await adapter.webhookHandler(req, res, ctx);
            if (res.headersSent) return;

            const body = handlerResult?.body ?? req.body;
            const hasInboundMessage = Boolean(body?.entry?.[0]?.changes?.[0]?.value?.messages?.length);

            if (hasInboundMessage && !resolvedCompanyId) {
                console.warn("[whatsapp] Unknown phone_number_id — skipping pipeline (200 to Meta)", {
                    phoneNumberId: maskPhoneNumberId(phoneNumberId),
                });
                if (!res.headersSent) return res.sendStatus(200);
                return;
            }

            const messages = await adapter.receiveMessage(ctx, body);

            if (messages) {
                await ingestBatch(messages);
            }

            if (!res.headersSent) {
                return res.sendStatus(200);
            }
            return;
        }

        return res.sendStatus(405);
    } catch (err) {
        logError("whatsapp", ctx.companyId, "WhatsApp webhook error", {
            error: err.message,
            code: err.code || err.name,
        });
        if (err instanceof WebhookValidationError) {
            if (!res.headersSent) return res.sendStatus(401);
            return;
        }
        if (!res.headersSent) res.sendStatus(200);
    }
}

/** @deprecated Use handleWhatsAppWebhook — kept for import compatibility. */
export const handleLegacyWhatsAppWebhook = handleWhatsAppWebhook;

/**
 * Handle unified webhook request for non-WhatsApp channels.
 * WhatsApp on /webhooks/whatsapp delegates to the canonical handler.
 */
export async function handleWebhookRequest(req, res, { channel, companyId = null }) {
    const normalized = normalizeChannel(channel);

    if (normalized === "whatsapp") {
        return handleWhatsAppWebhook(req, res, companyId);
    }

    const adapter = getAdapter(normalized);

    if (!adapter) {
        logWarn(normalized, companyId, "Unknown channel webhook");
        return res.status(404).json({ error: `Unknown channel: ${channel}` });
    }

    const ctx = { companyId: companyId || req.tenant?.companyId || null };

    try {
        if (req.method === "GET") {
            const result = await adapter.webhookHandler(req, res, ctx);
            if (result !== undefined && !res.headersSent) {
                return res.status(200).json(result);
            }
            return;
        }

        if (req.method === "POST") {
            if (!adapter.validateWebhook(req)) {
                throw new WebhookValidationError(`Invalid webhook signature for ${normalized}`, {
                    channel: normalized,
                    companyId: ctx.companyId,
                });
            }

            const handlerResult = await adapter.webhookHandler(req, res, ctx);

            if (res.headersSent) return;

            const body = handlerResult?.body ?? req.body;
            const messages = await adapter.receiveMessage(ctx, body);

            if (messages) {
                await ingestBatch(messages);
            }

            if (!res.headersSent) {
                return res.sendStatus(200);
            }
            return;
        }

        return res.sendStatus(405);
    } catch (err) {
        logError(normalized, ctx.companyId, "Webhook handler error", { error: err.message });

        if (err instanceof WebhookValidationError) {
            return res.status(401).json({ error: err.message, code: err.code });
        }
        if (err instanceof IntegrationError) {
            return res.status(err.status || 400).json({ error: err.message, code: err.code });
        }
        return res.status(500).json({ error: err.message || "Webhook processing failed" });
    }
}

function summarizeWebhookBody(body) {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    return {
        object: body?.object,
        field: change?.field,
        hasMessages: Boolean(value?.messages?.length),
        hasStatuses: Boolean(value?.statuses?.length),
        messageCount: value?.messages?.length ?? 0,
        phoneNumberId: maskPhoneNumberId(value?.metadata?.phone_number_id),
    };
}
