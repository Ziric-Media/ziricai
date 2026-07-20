/**
 * Factory for non-messaging connector stubs (calendar, payments, etc.).
 */
import { BaseAdapter } from "../adapters/baseAdapter.js";
import { logInfo } from "../integrationLogger.js";

/**
 * @param {string} connectorType
 * @param {string} [displayName]
 */
export function createStubConnector(connectorType, displayName) {
    const label = displayName || connectorType;

    return class StubConnector extends BaseAdapter {
        getChannelType() {
            return connectorType;
        }

        isConfigured() {
            return false;
        }

        async sendMessage(ctx, payload) {
            logInfo(connectorType, ctx?.companyId, "Stub connector action", payload);
            return this.stubResponse(`${label} integration`);
        }

        async receiveMessage(ctx, rawPayload) {
            return null;
        }

        async webhookHandler(req, res, ctx = {}) {
            if (req.method === "GET") {
                return res.status(200).json({
                    connector: connectorType,
                    configured: false,
                    message: `Connect ${label} in Settings → Integrations.`,
                });
            }
            res.status(200).json(this.stubResponse("webhook processing"));
        }
    };
}
