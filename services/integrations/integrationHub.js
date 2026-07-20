/**
 * Integration Hub — central registry, outbound dispatch, monitoring.
 */
import { getAdapter, initAdapterRegistry, getChannelStatus } from "./adapterRegistry.js";
import { bootstrapIntegrationConfig } from "./types/integrationConfig.js";
import { checkRateLimit } from "./rateLimiter.js";
import { scheduleRetry, getRetryQueueStats } from "./retryQueue.js";
import { logInfo, logError, getIntegrationLogs } from "./integrationLogger.js";
import { IntegrationError, RateLimitError, AdapterNotConfiguredError } from "./errors.js";
import { handleWebhookRequest, handleLegacyWhatsAppWebhook } from "./webhookRouter.js";
import { ingest, ingestBatch } from "./conversationPipeline.js";
import { requireTenantScope } from "../core/tenantContext.js";

let initialized = false;

export function initIntegrationHub() {
    if (initialized) return;
    bootstrapIntegrationConfig();
    initAdapterRegistry();
    initialized = true;
    logInfo("hub", null, "Integration Hub initialized");
}

/**
 * Send outbound message via the correct channel adapter.
 * @param {string} channel
 * @param {{ companyId?: string|null }} ctx
 * @param {{ to: string, text: string, media?: unknown[] }} payload
 */
export async function sendMessage(channel, ctx, payload) {
    initIntegrationHub();
    const adapter = getAdapter(channel);
    if (!adapter) {
        throw new IntegrationError(`Unknown channel: ${channel}`, { channel, companyId: ctx?.companyId });
    }

    const companyId = ctx?.companyId || process.env.DEFAULT_COMPANY_ID || null;

    if (!adapter.isConfigured(ctx)) {
        throw new AdapterNotConfiguredError(channel, companyId);
    }

    try {
        checkRateLimit(companyId, channel);
    } catch (err) {
        if (err instanceof RateLimitError) {
            logError(channel, companyId, "Rate limit exceeded", { to: payload?.to });
            throw err;
        }
        throw err;
    }

    try {
        logInfo(channel, companyId, "Outbound send", { to: payload?.to });
        return await adapter.sendMessage({ ...ctx, companyId }, payload);
    } catch (err) {
        logError(channel, companyId, "Send failed — scheduling retry", { error: err.message });
        scheduleRetry({
            channel,
            companyId,
            fn: (retryCtx, retryPayload) => adapter.sendMessage(retryCtx, retryPayload),
            ctx: { ...ctx, companyId },
            payload,
        });
        throw err;
    }
}

/**
 * Reply to an inbound conversation (resolves channel from message context).
 * @param {{ channel: string, companyId?: string|null, to: string, text: string }} opts
 */
export async function reply(opts) {
    const { channel, companyId, to, text } = opts;
    return sendMessage(channel || "whatsapp", { companyId }, { to, text });
}

export function mountIntegrationRoutes(app) {
    initIntegrationHub();

    app.get("/webhooks/:channel", async (req, res) => {
        await handleWebhookRequest(req, res, {
            channel: req.params.channel,
            companyId: null,
        });
    });

    app.post("/webhooks/:channel", async (req, res) => {
        await handleWebhookRequest(req, res, {
            channel: req.params.channel,
            companyId: null,
        });
    });

    app.post("/webhooks/:channel/:companyId", async (req, res) => {
        await handleWebhookRequest(req, res, {
            channel: req.params.channel,
            companyId: req.params.companyId,
        });
    });

    app.get("/api/integrations/health", (req, res) => {
        const companyId = req.query.companyId || process.env.DEFAULT_COMPANY_ID || null;
        res.json({
            status: "ok",
            companyId,
            channels: getChannelStatus(companyId),
            retryQueue: getRetryQueueStats(),
            timestamp: new Date().toISOString(),
        });
    });

    app.get("/api/integrations/logs/:companyId", requireTenantScope({ optional: true }), (req, res) => {
        const limit = Number(req.query.limit) || 50;
        const channel = req.query.channel || undefined;
        const logs = getIntegrationLogs(req.params.companyId, { limit, channel });
        res.json({ items: logs, count: logs.length });
    });

    app.get("/api/integrations/channels/:companyId", requireTenantScope({ optional: true }), (req, res) => {
        res.json({
            companyId: req.params.companyId,
            channels: getChannelStatus(req.params.companyId),
        });
    });
}

export {
    handleLegacyWhatsAppWebhook,
    ingest,
    ingestBatch,
    getChannelStatus,
    getIntegrationLogs,
    getAdapter,
};
