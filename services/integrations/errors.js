/**
 * Integration Hub error types.
 */
export class IntegrationError extends Error {
    constructor(message, { code = "INTEGRATION_ERROR", channel = null, companyId = null, cause = null } = {}) {
        super(message);
        this.name = "IntegrationError";
        this.code = code;
        this.channel = channel;
        this.companyId = companyId;
        this.cause = cause;
    }
}

export class RateLimitError extends IntegrationError {
    constructor(message, meta = {}) {
        super(message, { ...meta, code: "RATE_LIMIT" });
        this.name = "RateLimitError";
        this.retryAfterMs = meta.retryAfterMs ?? 60_000;
    }
}

export class WebhookValidationError extends IntegrationError {
    constructor(message, meta = {}) {
        super(message, { ...meta, code: "WEBHOOK_VALIDATION" });
        this.name = "WebhookValidationError";
    }
}

export class AdapterNotConfiguredError extends IntegrationError {
    constructor(channel, companyId = null) {
        super(`${channel} is not connected. Connect this channel in Settings → Integrations.`, {
            code: "NOT_CONFIGURED",
            channel,
            companyId,
        });
        this.name = "AdapterNotConfiguredError";
    }
}
