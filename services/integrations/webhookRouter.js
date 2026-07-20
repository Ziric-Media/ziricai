/**
 * Webhook router — POST /webhooks/:channel and /webhooks/:channel/:companyId
 */
import { getAdapter, normalizeChannel } from "./adapterRegistry.js";
import { ingestBatch } from "./conversationPipeline.js";
import { WebhookValidationError, IntegrationError } from "./errors.js";
import { logInfo, logError, logWarn } from "./integrationLogger.js";

/**
 * Handle unified webhook request.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ channel: string, companyId?: string|null }} routeParams
 */
export async function handleWebhookRequest(req, res, { channel, companyId = null }) {
    const normalized = normalizeChannel(channel);
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

/**
 * Legacy WhatsApp /webhook handler — preserves backward compatibility.
 */
export async function handleLegacyWhatsAppWebhook(req, res) {
    const adapter = getAdapter("whatsapp");
    const ctx = { companyId: process.env.DEFAULT_COMPANY_ID || null };

    try {
        if (req.method === "GET") {
            return adapter.webhookHandler(req, res, ctx);
        }

        const summary = summarizeWebhookBody(req.body);
        logInfo("whatsapp", ctx.companyId, "Incoming POST (legacy /webhook)", summary);

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
    } catch (err) {
        logError("whatsapp", ctx.companyId, "Legacy webhook error", { error: err.message });
        if (!res.headersSent) res.sendStatus(200);
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
        phoneNumberId: value?.metadata?.phone_number_id,
    };
}
