/**
 * Factory for unconfigured messaging channel stubs.
 */
import { BaseAdapter } from "./baseAdapter.js";
import { createUnifiedMessage } from "../types/unifiedMessage.js";
import { logInfo } from "../integrationLogger.js";

/**
 * @param {string} channelType
 * @param {string} [displayName]
 */
export function createStubMessagingAdapter(channelType, displayName) {
    const label = displayName || channelType;

    return class StubMessagingAdapter extends BaseAdapter {
        getChannelType() {
            return channelType;
        }

        isConfigured() {
            return false;
        }

        async sendMessage(ctx, payload) {
            logInfo(channelType, ctx?.companyId, "Stub sendMessage — not configured", { to: payload?.to });
            return this.stubResponse("outbound messaging");
        }

        async receiveMessage(ctx, rawPayload) {
            logInfo(channelType, ctx?.companyId, "Stub receiveMessage — not configured");
            const from = rawPayload?.from || rawPayload?.sender?.id || "unknown";
            return createUnifiedMessage({
                companyId: ctx?.companyId,
                channel: channelType,
                from,
                to: rawPayload?.to || "business",
                text: rawPayload?.text || rawPayload?.message?.text || "",
                metadata: { stub: true, note: `Connect ${label} in Settings → Integrations` },
            });
        }

        validateWebhook(_req) {
            return true;
        }

        async webhookHandler(req, res, ctx = {}) {
            if (req.method === "GET") {
                return res.status(200).json({
                    channel: channelType,
                    configured: false,
                    message: `Connect ${label} in Settings → Integrations.`,
                });
            }
            res.status(200).json(this.stubResponse("webhook processing"));
        }
    };
}
