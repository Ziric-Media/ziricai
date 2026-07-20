/**
 * Structured integration event logging (in-memory ring buffer for demo).
 */

const MAX_EVENTS = 500;
const events = [];

/**
 * @param {'info'|'warn'|'error'|'debug'} level
 * @param {string} channel
 * @param {string|null} companyId
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export function logIntegration(level, channel, companyId, message, meta = {}) {
    const entry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        level,
        channel,
        companyId: companyId || null,
        message,
        meta,
        timestamp: new Date().toISOString(),
    };

    events.unshift(entry);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

    const prefix = `[integration][${channel}]${companyId ? `[${companyId}]` : ""}`;
    const line = `${prefix} ${message}`;
    if (level === "error") console.error(line, meta);
    else if (level === "warn") console.warn(line, meta);
    else console.log(line, Object.keys(meta).length ? meta : "");
}

export function logInfo(channel, companyId, message, meta) {
    logIntegration("info", channel, companyId, message, meta);
}

export function logWarn(channel, companyId, message, meta) {
    logIntegration("warn", channel, companyId, message, meta);
}

export function logError(channel, companyId, message, meta) {
    logIntegration("error", channel, companyId, message, meta);
}

/**
 * @param {string} [companyId]
 * @param {{ limit?: number, channel?: string }} [options]
 */
export function getIntegrationLogs(companyId, options = {}) {
    const limit = options.limit ?? 50;
    let filtered = events;
    if (companyId) filtered = filtered.filter((e) => e.companyId === companyId);
    if (options.channel) filtered = filtered.filter((e) => e.channel === options.channel);
    return filtered.slice(0, limit);
}

export function clearIntegrationLogs() {
    events.length = 0;
}
