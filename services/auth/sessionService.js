/**
 * Active session tracking — in-memory for dev/demo.
 *
 * Production path (documented, not yet wired):
 *   users/{uid}/sessions/{sessionId}
 *     - createdAt, lastSeenAt, userAgent, ipHash, revoked
 *
 * Invalidate on POST /api/auth/logout; prune stale sessions periodically.
 */
import { randomBytes } from "crypto";

/** @type {Map<string, { sessionId: string, uid: string, createdAt: string, lastSeenAt: string, userAgent: string|null, revoked: boolean }>} */
const activeSessions = new Map();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function sessionKey(uid, sessionId) {
    return `${uid}:${sessionId}`;
}

/**
 * Register or refresh a session for the authenticated user.
 * @param {string} uid
 * @param {{ userAgent?: string|null }} [meta]
 */
export function trackSession(uid, meta = {}) {
    if (!uid) return null;
    const now = new Date().toISOString();
    const existing = [...activeSessions.values()].find((s) => s.uid === uid && !s.revoked);
    if (existing) {
        existing.lastSeenAt = now;
        if (meta.userAgent) existing.userAgent = meta.userAgent;
        return existing.sessionId;
    }

    const sessionId = randomBytes(16).toString("hex");
    activeSessions.set(sessionKey(uid, sessionId), {
        sessionId,
        uid,
        createdAt: now,
        lastSeenAt: now,
        userAgent: meta.userAgent || null,
        revoked: false,
    });
    pruneStaleSessions();
    return sessionId;
}

/** @param {string} uid */
export function invalidateSession(uid) {
    if (!uid) return 0;
    let count = 0;
    for (const [key, session] of activeSessions.entries()) {
        if (session.uid === uid && !session.revoked) {
            session.revoked = true;
            activeSessions.delete(key);
            count += 1;
        }
    }
    return count;
}

/** @param {string} uid */
export function getActiveSessions(uid) {
    return [...activeSessions.values()].filter((s) => s.uid === uid && !s.revoked);
}

function pruneStaleSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [key, session] of activeSessions.entries()) {
        if (new Date(session.lastSeenAt).getTime() < cutoff || session.revoked) {
            activeSessions.delete(key);
        }
    }
}

/**
 * Build session payload for GET /api/auth/session.
 * @param {object} auth — from resolveAuthFromRequest
 */
export function buildSessionResponse(auth, { sessionId } = {}) {
    const profile = auth.profile || {};
    const companyId = profile.companyId || profile.company || null;

    return {
        uid: auth.uid,
        email: auth.email,
        role: auth.role,
        isSuperAdmin: auth.isSuperAdmin,
        companyId,
        profile: profile
            ? {
                  uid: auth.uid,
                  email: profile.email || auth.email,
                  fullName: profile.fullName || profile.name || null,
                  role: auth.role,
                  companyId,
                  status: profile.status || "active",
                  mfaEnabled: Boolean(profile.mfaEnabled),
              }
            : null,
        sessionId: sessionId || null,
        enforcement: (process.env.TENANT_SCOPE_ENFORCEMENT || "lax").toLowerCase(),
    };
}
