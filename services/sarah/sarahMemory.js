/**
 * Sarah session memory — in-memory store with topic context for multi-turn flows.
 */

const sessions = new Map();
const MAX_MESSAGES = 10;
const SESSION_TTL_MS = 1000 * 60 * 60 * 4;

function pruneExpired() {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
    }
}

function createSessionId() {
    return `sarah-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {string|null} sessionId
 * @param {string} companyId
 */
export function getOrCreateSession(sessionId, companyId) {
    pruneExpired();

    if (sessionId && sessions.has(sessionId)) {
        const existing = sessions.get(sessionId);
        if (existing.companyId === companyId) {
            existing.updatedAt = Date.now();
            return existing;
        }
    }

    const id = sessionId || createSessionId();
    const session = {
        id,
        companyId,
        messages: [],
        recentActions: [],
        context: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    sessions.set(id, session);
    return session;
}

export function appendMessage(sessionId, role, content) {
    const session = sessions.get(sessionId);
    if (!session) return null;

    session.messages.push({ role, content, at: new Date().toISOString() });
    if (session.messages.length > MAX_MESSAGES) {
        session.messages = session.messages.slice(-MAX_MESSAGES);
    }
    session.updatedAt = Date.now();
    return session;
}

export function recordAction(sessionId, action) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.recentActions.unshift({ ...action, at: new Date().toISOString() });
    session.recentActions = session.recentActions.slice(0, 5);
    session.updatedAt = Date.now();
}

export function getSessionHistory(sessionId) {
    const session = sessions.get(sessionId);
    return session?.messages || [];
}

/** Persist last discussed agent/KB topic for multi-turn continuity. */
export function setSessionContext(sessionId, patch) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.context = { ...session.context, ...patch, updatedAt: new Date().toISOString() };
    session.updatedAt = Date.now();
}

export function getSessionContext(sessionId) {
    return sessions.get(sessionId)?.context || {};
}

/**
 * Build context hint string for Sarah system prompt from session memory.
 */
export function buildSessionContextHint(sessionId) {
    const ctx = getSessionContext(sessionId);
    const parts = [];
    if (ctx.lastAgentName) parts.push(`Last discussed AI employee: ${ctx.lastAgentName}`);
    if (ctx.lastKbTopic) parts.push(`Last knowledge topic: ${ctx.lastKbTopic}`);
    if (ctx.lastKnowledgeBaseId) parts.push(`Active KB: ${ctx.lastKnowledgeBaseId}`);
    return parts.length ? parts.join(". ") + "." : "";
}

export const PERSISTENCE_STRATEGY = {
    collection: "companies/{companyId}/sarahSessions/{sessionId}",
    maxMessages: MAX_MESSAGES,
    ttlDays: 90,
    tenantMemoryCollection: "companies/{companyId}/sarahMemory",
};
