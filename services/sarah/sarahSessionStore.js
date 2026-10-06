/**
 * Durable Sarah Portal sessions — Firestore when available, in-memory fallback for local/tests.
 */
import { TENANT_COLLECTIONS } from "../database/schema.js";
import {
    tenantCollectionRef,
    tenantDocRef,
    getDoc,
    setDoc,
    getDocs,
    query,
    queryWhere,
    queryOrderBy,
    queryLimit,
    serverTimestamp,
    useAdminBackend,
} from "../database/firestoreClient.js";
import { sanitizeActionsForTranscript } from "./sanitizeSarahPayload.js";

const memorySessions = new Map();
const MAX_MESSAGES = 100;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;

function createSessionId() {
    return `sarah-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function deriveTitle(firstUserMessage) {
    const t = String(firstUserMessage || "").trim().replace(/\s+/g, " ");
    if (!t) return "Conversation";
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

function normalizeSession(docId, data) {
    if (!data) return null;
    return {
        id: docId,
        companyId: data.companyId,
        userId: data.userId,
        surface: data.surface || "portal",
        title: data.title || "Conversation",
        messages: Array.isArray(data.messages) ? data.messages : [],
        recentActions: Array.isArray(data.recentActions) ? data.recentActions : [],
        context: data.context && typeof data.context === "object" ? data.context : {},
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
        lastMessageAt: data.lastMessageAt?.toMillis?.() || data.lastMessageAt || data.updatedAt || Date.now(),
        status: data.status || "active",
    };
}

function assertSessionAccess(session, { companyId, userId }) {
    if (!session) return false;
    if (session.companyId !== companyId) return false;
    if (session.userId && userId && session.userId !== userId) return false;
    return true;
}

async function readSessionFromFirestore(companyId, sessionId) {
    if (!useAdminBackend()) return null;
    const ref = tenantDocRef(companyId, TENANT_COLLECTIONS.SARAH_SESSIONS, sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return normalizeSession(sessionId, snap.data());
}

async function writeSessionToFirestore(session) {
    if (!useAdminBackend()) return;
    const ref = tenantDocRef(session.companyId, TENANT_COLLECTIONS.SARAH_SESSIONS, session.id);
    const payload = {
        companyId: session.companyId,
        userId: session.userId,
        surface: session.surface,
        title: session.title,
        messages: session.messages,
        recentActions: session.recentActions,
        context: session.context,
        status: session.status || "active",
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
    };
    if (!session._persisted) {
        payload.createdAt = serverTimestamp();
    }
    await setDoc(ref, payload, { merge: true });
    session._persisted = true;
}

function readSessionFromMemory(sessionId) {
    return memorySessions.get(sessionId) || null;
}

function writeSessionToMemory(session) {
    memorySessions.set(session.id, session);
}

function pruneMemoryExpired() {
    const now = Date.now();
    for (const [id, session] of memorySessions) {
        if (now - (session.updatedAt || 0) > SESSION_TTL_MS) memorySessions.delete(id);
    }
}

/**
 * @param {{ sessionId?: string|null, companyId: string, userId: string, surface?: string, createIfMissing?: boolean }}
 */
export async function getOrCreateSarahSession({
    sessionId,
    companyId,
    userId,
    surface = "portal",
    createIfMissing = true,
}) {
    pruneMemoryExpired();

    if (sessionId) {
        let session = readSessionFromMemory(sessionId);
        if (!session) {
            session = await readSessionFromFirestore(companyId, sessionId);
            if (session) writeSessionToMemory(session);
        }
        if (session && assertSessionAccess(session, { companyId, userId })) {
            session.updatedAt = Date.now();
            return session;
        }
    }

    if (!createIfMissing) return null;

    const id = sessionId || createSessionId();
    const session = {
        id,
        companyId,
        userId,
        surface,
        title: "Conversation",
        messages: [],
        recentActions: [],
        context: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
        status: "active",
        _persisted: false,
    };
    writeSessionToMemory(session);
    await writeSessionToFirestore(session);
    return session;
}

export async function loadSarahSession({ companyId, sessionId, userId }) {
    if (!sessionId) return null;
    let session = readSessionFromMemory(sessionId);
    if (!session) {
        session = await readSessionFromFirestore(companyId, sessionId);
        if (session) writeSessionToMemory(session);
    }
    if (!assertSessionAccess(session, { companyId, userId })) return null;
    return session;
}

export async function getLatestSarahSessionForUser(companyId, userId, surface = "portal") {
    if (useAdminBackend()) {
        const col = tenantCollectionRef(companyId, TENANT_COLLECTIONS.SARAH_SESSIONS);
        const q = query(
            col,
            queryWhere("userId", "==", userId),
            queryWhere("surface", "==", surface),
            queryWhere("status", "==", "active"),
            queryOrderBy("lastMessageAt", "desc"),
            queryLimit(1)
        );
        try {
            const snap = await getDocs(q);
            if (!snap.empty) {
                const doc = snap.docs[0];
                const session = normalizeSession(doc.id, doc.data());
                writeSessionToMemory(session);
                return session;
            }
        } catch (err) {
            console.warn("[sarahSessionStore] latest session query failed:", err.message);
        }
    }

    pruneMemoryExpired();
    let latest = null;
    for (const session of memorySessions.values()) {
        if (session.companyId !== companyId || session.userId !== userId || session.surface !== surface) {
            continue;
        }
        if (session.status !== "active") continue;
        if (!latest || (session.lastMessageAt || 0) > (latest.lastMessageAt || 0)) {
            latest = session;
        }
    }
    return latest;
}

export async function createNewSarahSession({ companyId, userId, surface = "portal" }) {
    return getOrCreateSarahSession({
        sessionId: null,
        companyId,
        userId,
        surface,
        createIfMissing: true,
    });
}

export async function appendSarahMessage(
    session,
    role,
    content,
    { actions = null, meta = null } = {}
) {
    if (!session) return null;

    const entry = {
        role,
        content: String(content || ""),
        timestamp: new Date().toISOString(),
    };
    if (actions?.length) {
        entry.actions = sanitizeActionsForTranscript(actions);
    }
    if (meta && typeof meta === "object") {
        entry.meta = meta;
    }

    session.messages.push(entry);
    if (session.messages.length > MAX_MESSAGES) {
        session.messages = session.messages.slice(-MAX_MESSAGES);
    }

    if (role === "user" && session.title === "Conversation") {
        session.title = deriveTitle(content);
    }

    session.updatedAt = Date.now();
    session.lastMessageAt = Date.now();
    writeSessionToMemory(session);
    await writeSessionToFirestore(session);
    return session;
}

export async function recordSarahAction(session, action) {
    if (!session) return;
    session.recentActions.unshift({
        tool: action.tool,
        success: action.success,
        at: new Date().toISOString(),
    });
    session.recentActions = session.recentActions.slice(0, 5);
    session.updatedAt = Date.now();
    writeSessionToMemory(session);
    await writeSessionToFirestore(session);
}

export function getSarahSessionHistory(session) {
    return session?.messages || [];
}

export async function setSarahSessionContext(session, patch) {
    if (!session) return;
    session.context = { ...session.context, ...patch, updatedAt: new Date().toISOString() };
    session.updatedAt = Date.now();
    writeSessionToMemory(session);
    await writeSessionToFirestore(session);
}

export function getSarahSessionContext(session) {
    return session?.context || {};
}

export function serializeSarahSessionForClient(session) {
    if (!session) return null;
    return {
        sessionId: session.id,
        companyId: session.companyId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastMessageAt: session.lastMessageAt,
        messages: session.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            actions: m.actions || undefined,
        })),
    };
}

export const PERSISTENCE_STRATEGY = {
    collection: `companies/{companyId}/${TENANT_COLLECTIONS.SARAH_SESSIONS}/{sessionId}`,
    maxMessages: MAX_MESSAGES,
    ttlDays: 90,
};
