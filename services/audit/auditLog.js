/**
 * Audit log stub — in-memory ring buffer for security-sensitive events.
 * Production: persist to Firestore `platformAudit` or external SIEM.
 */

const MAX_ENTRIES = 500;
/** @type {object[]} */
const entries = [];

/**
 * @param {string} action
 * @param {object} [meta]
 */
export function auditLog(action, meta = {}) {
    const entry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action,
        at: new Date().toISOString(),
        ...meta,
    };
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    console.log("[audit]", action, meta.companyId || meta.uid || meta.path || "");
    return entry;
}

export function listAuditEntries({ limit = 50, action = null } = {}) {
    let list = entries;
    if (action) list = list.filter((e) => e.action === action);
    return list.slice(0, limit);
}

export function clearAuditLog() {
    entries.length = 0;
}
