/**
 * Integration Hub — central registry, outbound dispatch, monitoring.
 */
import { getAdapter, initAdapterRegistry, getChannelStatus } from "./adapterRegistry.js";
import { bootstrapIntegrationConfig } from "./types/integrationConfig.js";
import { checkRateLimit } from "./rateLimiter.js";
import { scheduleRetry, getRetryQueueStats } from "./retryQueue.js";
import { logInfo, logError, getIntegrationLogs } from "./integrationLogger.js";
import { IntegrationError, RateLimitError, AdapterNotConfiguredError } from "./errors.js";
import { isRetryableOutboundError } from "./metaWhatsAppErrors.js";
import { handleWebhookRequest, handleWhatsAppWebhook, handleLegacyWhatsAppWebhook } from "./webhookRouter.js";
import { ingest, ingestBatch } from "./conversationPipeline.js";
import { requireTenantOrPlatformAccess } from "../core/tenantContext.js";
import { requirePlatformAccess } from "../auth/platformAuth.js";
import { listIntegrations } from "../tenants/integrationService.js";
import { resolvePilotDataCompanyId } from "../storage/centralMotorsPilot.js";
import { CHANNELS } from "./types/unifiedMessage.js";

let initialized = false;

const ACTIVE_INTEGRATION_STATUSES = new Set(["active", "connected"]);

/**
 * Merge tenant integration docs into adapter channel catalog rows.
 * @param {object[]} channels
 * @param {object[]} integrations sanitized integration records
 */
export function mergeTenantIntegrationsIntoChannels(channels, integrations = []) {
    const byChannel = new Map();
    for (const rec of integrations) {
        const key = rec.channel || rec.provider;
        if (key) byChannel.set(key, rec);
    }

    return channels.map((ch) => {
        const rec = byChannel.get(ch.channel);
        if (!rec) return ch;
        const status = String(rec.status || "").toLowerCase();
        const tenantConnected = ACTIVE_INTEGRATION_STATUSES.has(status);
        return {
            ...ch,
            configured: tenantConnected,
            integrationStatus: rec.status || null,
            displayPhoneNumber: rec.displayPhoneNumber || null,
            phoneNumberId: rec.phoneNumberId || null,
        };
    });
}

async function listSanitizedIntegrations(companyId) {
    const items = await listIntegrations(companyId);
    return items.map((rec) => {
        const {
            config,
            accessToken,
            whatsappToken,
            token,
            privateKey,
            credentials,
            ...safe
        } = rec;
        return {
            ...safe,
            channel: safe.channel || safe.provider,
            phoneNumberId: safe.phoneNumberId
                ? `***${String(safe.phoneNumberId).slice(-4)}`
                : null,
        };
    });
}

function isOutboundRetryable(err) {
    return isRetryableOutboundError(err);
}

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
        const retryable = isOutboundRetryable(err);
        const metaCode = err.metaCode ?? null;

        if (retryable) {
            logError(channel, companyId, "Send failed — scheduling retry", {
                error: err.message,
                metaCode,
            });
            scheduleRetry({
                channel,
                companyId,
                fn: (retryCtx, retryPayload) => adapter.sendMessage(retryCtx, retryPayload),
                ctx: { ...ctx, companyId },
                payload,
            });
        } else {
            logError(channel, companyId, "Send failed — not retryable (config/recipient error)", {
                error: err.message,
                metaCode,
            });
        }
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

    app.get("/api/integrations/health", requirePlatformAccess(), (req, res) => {
        const companyId = req.query.companyId || process.env.DEFAULT_COMPANY_ID || null;
        res.json({
            status: "ok",
            companyId,
            channels: getChannelStatus(companyId),
            retryQueue: getRetryQueueStats(),
            timestamp: new Date().toISOString(),
        });
    });

    app.get("/api/integrations/logs/:companyId", requireTenantOrPlatformAccess(), (req, res) => {
        const limit = Number(req.query.limit) || 50;
        const channel = req.query.channel || undefined;
        const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
        const logs = getIntegrationLogs(dataCompanyId, { limit, channel });
        res.json({ items: logs, count: logs.length, companyId: req.params.companyId });
    });

    app.get("/api/integrations/channels/:companyId", requireTenantOrPlatformAccess(), async (req, res) => {
        const portalCompanyId = req.params.companyId;
        const dataCompanyId = resolvePilotDataCompanyId(portalCompanyId);
        const integrations = await listSanitizedIntegrations(dataCompanyId);
        let channels = getChannelStatus(dataCompanyId);
        channels = mergeTenantIntegrationsIntoChannels(channels, integrations);

        const waRow = channels.find((c) => c.channel === CHANNELS.WHATSAPP);
        const waIntegration = integrations.find(
            (i) => (i.channel || i.provider) === CHANNELS.WHATSAPP
        );
        if (waRow && waIntegration && waRow.configured) {
            waRow.description = waRow.displayPhoneNumber
                ? `Connected · ${waRow.displayPhoneNumber}`
                : "WhatsApp Business API connected for this workspace";
        }

        res.json({
            companyId: portalCompanyId,
            dataCompanyId,
            channels,
            integrations,
        });
    });
}

export {
    handleWhatsAppWebhook,
    handleLegacyWhatsAppWebhook,
    ingest,
    ingestBatch,
    getChannelStatus,
    getIntegrationLogs,
    getAdapter,
};
