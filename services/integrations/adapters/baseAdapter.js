/**
 * Base adapter interface for all messaging channels.
 * Subclasses must implement required methods.
 */
import { AdapterNotConfiguredError } from "../errors.js";

export class BaseAdapter {
    /** @returns {string} */
    getChannelType() {
        throw new Error("getChannelType() must be implemented");
    }

    /** @returns {boolean} */
    isConfigured(_ctx = {}) {
        return false;
    }

    /**
     * Send outbound message.
     * @param {{ companyId?: string|null }} ctx
     * @param {{ to: string, text: string, media?: unknown[] }} payload
     */
    async sendMessage(_ctx, _payload) {
        throw new Error("sendMessage() must be implemented");
    }

    /**
     * Parse inbound webhook/event into UnifiedMessage(s).
     * @param {{ companyId?: string|null }} ctx
     * @param {unknown} rawPayload
     * @returns {Promise<import('../types/unifiedMessage.js').UnifiedMessage|import('../types/unifiedMessage.js').UnifiedMessage[]|null>}
     */
    async receiveMessage(_ctx, _rawPayload) {
        throw new Error("receiveMessage() must be implemented");
    }

    /**
     * @param {{ companyId?: string|null }} ctx
     * @param {string} userId
     */
    async getProfile(_ctx, _userId) {
        return null;
    }

    /**
     * @param {{ companyId?: string|null }} ctx
     * @param {{ buffer?: Buffer, url?: string, mimeType?: string, filename?: string }} media
     */
    async uploadMedia(_ctx, _media) {
        throw new AdapterNotConfiguredError(this.getChannelType());
    }

    /**
     * @param {{ companyId?: string|null }} ctx
     * @param {string} mediaId
     */
    async downloadMedia(_ctx, _mediaId) {
        throw new AdapterNotConfiguredError(this.getChannelType());
    }

    /**
     * Express webhook handler (optional override).
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {{ companyId?: string|null }} ctx
     */
    async webhookHandler(_req, _res, _ctx = {}) {
        throw new Error("webhookHandler() must be implemented or use default webhook router");
    }

    /**
     * Validate webhook signature / authenticity.
     * @param {import('express').Request} req
     * @returns {boolean}
     */
    validateWebhook(_req) {
        return true;
    }

    /** Helpful stub response for unconfigured channels */
    stubResponse(action = "send") {
        const channel = this.getChannelType();
        return {
            stub: true,
            channel,
            success: false,
            message: `Connect ${channel} in Settings → Integrations to enable ${action}.`,
        };
    }
}
