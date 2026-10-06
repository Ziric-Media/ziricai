/**
 * Mission Control Sarah sessions — operator-scoped under platform/sarahSessions.
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import {
    platformSarahSessionPath,
    platformSarahSessionsCollectionPath,
} from "../database/schema.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { MC_SCOPE } from "./mcToolPolicy.js";
import { sanitizeActionsForTranscript } from "./sanitizeSarahPayload.js";

const memorySessions = new Map();
const MAX_MESSAGES = 100;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export function mcScopeKey(scopedCompanyId) {
    const id = String(scopedCompanyId || "").trim();
    return id ? `tenant:${id}` : "platform";
}

function createSessionId() {
    return `mc-sarah-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
        operatorUid: data.operatorUid,
        scopeKey: data.scopeKey || "platform",
        scopeMode: data.scopeMode || MC_SCOPE.PLATFORM,
        scopedCompanyId: data.scopedCompanyId ?? null,
        surface: data.surface || "mission_control",
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

function assertMcSessionAccess(session, { operatorUid, scopeKey }) {
    if (!session) return false;
    if (session.operatorUid !== operatorUid) return false;
    if (scopeKey && session.scopeKey !== scopeKey) return false;
    return true;
}

async function readSessionFromFirestore(sessionId) {
    if (!useAdminBackend()) return null;
    const db = getAdminFirestore();
    const snap = await db.doc(platformSarahSessionPath(sessionId)).get();
    if (!snap.exists) return null;
    return normalizeSession(sessionId, snap.data());
}

async function writeSessionToFirestore(session) {
    if (!useAdminBackend()) return;
    const db = getAdminFirestore();
    const ref = db.doc(platformSarahSessionPath(session.id));
    const payload = {
        operatorUid: session.operatorUid,
        scopeKey: session.scopeKey,
        scopeMode: session.scopeMode,
        scopedCompanyId: session.scopedCompanyId,
        surface: session.surface,
        title: session.title,
        messages: session.messages,
        recentActions: session.recentActions,
        context: session.context,
        status: session.status || "active",
        updatedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
    };
    if (!session._persisted) {
        payload.createdAt = new Date().toISOString();
    }
    await ref.set(payload, { merge: true });
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
 * @param {{
 *   sessionId?: string|null,
 *   operatorUid: string,
 *   scopeMode?: string,
 *   scopedCompanyId?: string|null,
 *   createIfMissing?: boolean,
 * }}
 */
export async function getOrCreateMcSarahSession({
    sessionId,
    operatorUid,
    scopeMode = MC_SCOPE.PLATFORM,
    scopedCompanyId = null,
    createIfMissing = true,
}) {
    pruneMemoryExpired();
    const scopeKey = mcScopeKey(scopedCompanyId);
    const uid = String(operatorUid || "").trim();
    if (!uid) throw Object.assign(new Error("operatorUid is required"), { status: 401 });

    if (sessionId) {
        let session = readSessionFromMemory(sessionId);
        if (!session) {
            session = await readSessionFromFirestore(sessionId);
            if (session) writeSessionToMemory(session);
        }
        if (session && assertMcSessionAccess(session, { operatorUid: uid, scopeKey })) {
            session.updatedAt = Date.now();
            return session;
        }
    }

    if (!createIfMissing) return null;

    const id = sessionId || createSessionId();
    const session = {
        id,
        operatorUid: uid,
        scopeKey,
        scopeMode: scopeMode === MC_SCOPE.TENANT ? MC_SCOPE.TENANT : MC_SCOPE.PLATFORM,
        scopedCompanyId: scopedCompanyId ? String(scopedCompanyId).trim() : null,
        surface: "mission_control",
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

export async function loadMcSarahSession({ sessionId, operatorUid, scopeKey }) {
    if (!sessionId) return null;
    let session = readSessionFromMemory(sessionId);
    if (!session) {
        session = await readSessionFromFirestore(sessionId);
        if (session) writeSessionToMemory(session);
    }
    if (!assertMcSessionAccess(session, { operatorUid, scopeKey })) return null;
    return session;
}

export async function getLatestMcSarahSessionForOperator(operatorUid, { scopedCompanyId = null } = {}) {
    const uid = String(operatorUid || "").trim();
    if (!uid) return null;
    const scopeKey = mcScopeKey(scopedCompanyId);

    if (useAdminBackend()) {
        const db = getAdminFirestore();
        try {
            const snap = await db
                .collection(platformSarahSessionsCollectionPath())
                .where("operatorUid", "==", uid)
                .where("scopeKey", "==", scopeKey)
                .where("surface", "==", "mission_control")
                .where("status", "==", "active")
                .orderBy("lastMessageAt", "desc")
                .limit(1)
                .get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                const session = normalizeSession(doc.id, doc.data());
                writeSessionToMemory(session);
                return session;
            }
        } catch (err) {
            console.warn("[mcSessionStore] latest session query failed:", err.message);
        }
    }

    pruneMemoryExpired();
    let latest = null;
    for (const session of memorySessions.values()) {
        if (session.operatorUid !== uid || session.scopeKey !== scopeKey || session.surface !== "mission_control") {
            continue;
        }
        if (session.status !== "active") continue;
        if (!latest || (session.lastMessageAt || 0) > (latest.lastMessageAt || 0)) {
            latest = session;
        }
    }
    return latest;
}

export async function createNewMcSarahSession({ operatorUid, scopedCompanyId = null }) {
    const scopeKey = mcScopeKey(scopedCompanyId);
    const scopeMode = scopedCompanyId ? MC_SCOPE.TENANT : MC_SCOPE.PLATFORM;
    return getOrCreateMcSarahSession({
        sessionId: null,
        operatorUid,
        scopeMode,
        scopedCompanyId,
        createIfMissing: true,
    });
}

export async function appendMcSarahMessage(session, role, content, { actions = null, meta = null } = {}) {
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

export async function recordMcSarahAction(session, action) {
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

export function getMcSarahSessionHistory(session) {
    return session?.messages || [];
}

export async function setMcSarahSessionContext(session, patch) {
    if (!session) return;
    session.context = { ...session.context, ...patch, updatedAt: new Date().toISOString() };
    session.updatedAt = Date.now();
    writeSessionToMemory(session);
    await writeSessionToFirestore(session);
}

export function getMcSarahSessionContext(session) {
    return session?.context || {};
}

export function serializeMcSarahSessionForClient(session) {
    if (!session) return null;
    return {
        sessionId: session.id,
        scopeKey: session.scopeKey,
        scopeMode: session.scopeMode,
        scopedCompanyId: session.scopedCompanyId,
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
