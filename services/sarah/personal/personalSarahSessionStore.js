/**
 * U2 — Personal Sarah sessions at personalSarah/{uid}/sessions/{sessionId}.
 */
import { PERSONAL_SARAH_COLLECTIONS } from "../../database/schema.js";
import {
    personalSarahDocRef,
    personalSarahCollectionRef,
    getDoc,
    setDoc,
    getDocs,
    query,
    queryWhere,
    queryOrderBy,
    queryLimit,
    serverTimestamp,
    useAdminBackend,
} from "../../database/firestoreClient.js";

const memorySessions = new Map();
const MAX_MESSAGES = 100;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const SURFACE = "personal_app";

function createSessionId() {
    return `ps-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function deriveTitle(firstUserMessage) {
    const t = String(firstUserMessage || "").trim().replace(/\s+/g, " ");
    if (!t) return "My Sarah";
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

function normalizeSession(docId, data) {
    if (!data) return null;
    return {
        id: docId,
        userId: data.userId,
        surface: data.surface || SURFACE,
        title: data.title || "My Sarah",
        messages: Array.isArray(data.messages) ? data.messages : [],
        recentActions: Array.isArray(data.recentActions) ? data.recentActions : [],
        context: data.context && typeof data.context === "object" ? data.context : {},
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
        lastMessageAt: data.lastMessageAt?.toMillis?.() || data.lastMessageAt || data.updatedAt || Date.now(),
        status: data.status || "active",
    };
}

function assertAccess(session, userId) {
    return Boolean(session && session.userId === userId);
}

async function readFromFirestore(uid, sessionId) {
    if (!useAdminBackend()) return null;
    const snap = await getDoc(personalSarahDocRef(uid, PERSONAL_SARAH_COLLECTIONS.SESSIONS, sessionId));
    if (!snap.exists()) return null;
    return normalizeSession(sessionId, snap.data());
}

async function writeToFirestore(session) {
    if (!useAdminBackend()) return;
    const ref = personalSarahDocRef(session.userId, PERSONAL_SARAH_COLLECTIONS.SESSIONS, session.id);
    const payload = {
        userId: session.userId,
        surface: session.surface || SURFACE,
        title: session.title,
        messages: session.messages,
        recentActions: session.recentActions,
        context: session.context,
        status: session.status || "active",
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
    };
    if (!session._persisted) payload.createdAt = serverTimestamp();
    await setDoc(ref, payload, { merge: true });
    session._persisted = true;
}

export async function getOrCreatePersonalSarahSession({ sessionId, userId, createIfMissing = true }) {
    if (!userId) return null;

    if (sessionId) {
        let session = memorySessions.get(sessionId);
        if (!session) {
            session = await readFromFirestore(userId, sessionId);
            if (session) memorySessions.set(sessionId, session);
        }
        if (session && assertAccess(session, userId)) {
            session.updatedAt = Date.now();
            return session;
        }
    }

    if (!createIfMissing) return null;

    const id = sessionId && assertAccess(memorySessions.get(sessionId), userId) ? sessionId : createSessionId();
    const session = {
        id,
        userId,
        surface: SURFACE,
        title: "My Sarah",
        messages: [],
        recentActions: [],
        context: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
        status: "active",
        _persisted: false,
    };
    memorySessions.set(id, session);
    await writeToFirestore(session);
    return session;
}

export async function getLatestPersonalSarahSession(userId) {
    if (!userId) return null;

    if (useAdminBackend()) {
        try {
            const col = personalSarahCollectionRef(userId, PERSONAL_SARAH_COLLECTIONS.SESSIONS);
            const q = query(
                col,
                queryWhere("userId", "==", userId),
                queryWhere("surface", "==", SURFACE),
                queryWhere("status", "==", "active"),
                queryOrderBy("lastMessageAt", "desc"),
                queryLimit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                const docSnap = snap.docs[0];
                const session = normalizeSession(docSnap.id, docSnap.data());
                memorySessions.set(session.id, session);
                return session;
            }
        } catch (err) {
            console.warn("[personalSarahSessionStore] query failed:", err.message);
        }
    }

    let latest = null;
    for (const session of memorySessions.values()) {
        if (session.userId !== userId || session.surface !== SURFACE || session.status !== "active") continue;
        if (!latest || (session.lastMessageAt || 0) > (latest.lastMessageAt || 0)) latest = session;
    }
    return latest;
}

export function getPersonalSarahSessionHistory(session) {
    return (session?.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
    }));
}

export async function appendPersonalSarahMessage(session, role, content) {
    if (!session) return null;
    const entry = {
        role,
        content: String(content || ""),
        timestamp: new Date().toISOString(),
    };
    session.messages.push(entry);
    if (session.messages.length > MAX_MESSAGES) {
        session.messages = session.messages.slice(-MAX_MESSAGES);
    }
    if (role === "user" && session.title === "My Sarah") {
        session.title = deriveTitle(content);
    }
    session.updatedAt = Date.now();
    session.lastMessageAt = Date.now();
    memorySessions.set(session.id, session);
    await writeToFirestore(session);
    return session;
}

export async function recordPersonalSarahAction(session, action) {
    if (!session) return;
    session.recentActions.unshift({
        tool: action.tool,
        success: action.success,
        at: new Date().toISOString(),
    });
    session.recentActions = session.recentActions.slice(0, 20);
    memorySessions.set(session.id, session);
    await writeToFirestore(session);
}

function lastMessagePreview(session) {
    const msgs = session?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const m = msgs[i];
        if (m.role !== "user" && m.role !== "assistant") continue;
        const t = String(m.content || "").trim().replace(/\s+/g, " ");
        if (!t) continue;
        return t.length > 120 ? `${t.slice(0, 117)}…` : t;
    }
    return "";
}

export function serializePersonalSarahSessionSummary(session) {
    if (!session) return null;
    return {
        id: session.id,
        title: session.title || "My Sarah",
        updatedAt: session.updatedAt,
        lastMessageAt: session.lastMessageAt || session.updatedAt,
        lastMessagePreview: lastMessagePreview(session),
    };
}

export function serializePersonalSarahSessionDetail(session) {
    if (!session) return null;
    return {
        id: session.id,
        title: session.title || "My Sarah",
        messages: session.messages || [],
        updatedAt: session.updatedAt,
        lastMessageAt: session.lastMessageAt || session.updatedAt,
        status: session.status || "active",
    };
}

/**
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
export async function getPersonalSarahSessionForUser(userId, sessionId) {
    if (!userId || !sessionId) return null;

    let session = memorySessions.get(sessionId);
    if (!session) {
        session = await readFromFirestore(userId, sessionId);
        if (session) memorySessions.set(sessionId, session);
    }
    if (!assertAccess(session, userId)) return null;
    return session;
}

/**
 * @param {string} userId
 * @param {{ title?: string }} [options]
 */
export async function createPersonalSarahSession(userId, options = {}) {
    if (!userId) return null;
    const title = String(options.title || "My Sarah").trim() || "My Sarah";
    const session = {
        id: createSessionId(),
        userId,
        surface: SURFACE,
        title,
        messages: [],
        recentActions: [],
        context: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
        status: "active",
        _persisted: false,
    };
    memorySessions.set(session.id, session);
    await writeToFirestore(session);
    return session;
}

/**
 * @param {string} userId
 * @param {{ limit?: number }} [options]
 */
export async function listPersonalSarahSessions(userId, options = {}) {
    if (!userId) return [];
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const collected = [];

    if (useAdminBackend()) {
        try {
            const col = personalSarahCollectionRef(userId, PERSONAL_SARAH_COLLECTIONS.SESSIONS);
            const q = query(
                col,
                queryWhere("userId", "==", userId),
                queryWhere("surface", "==", SURFACE),
                queryWhere("status", "==", "active"),
                queryOrderBy("lastMessageAt", "desc"),
                queryLimit(limit)
            );
            const snap = await getDocs(q);
            for (const docSnap of snap.docs) {
                const session = normalizeSession(docSnap.id, docSnap.data());
                memorySessions.set(session.id, session);
                collected.push(session);
            }
        } catch (err) {
            console.warn("[personalSarahSessionStore] list query failed:", err.message);
        }
    }

    if (!collected.length) {
        for (const session of memorySessions.values()) {
            if (session.userId !== userId || session.surface !== SURFACE || session.status !== "active") continue;
            collected.push(session);
        }
        collected.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    }

    return collected.slice(0, limit).map(serializePersonalSarahSessionSummary);
}

export function clearPersonalSarahSessionsForTests() {
    memorySessions.clear();
}
