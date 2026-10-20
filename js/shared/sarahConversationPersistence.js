/** Client-side Sarah session id + transcript backup (survives navigation and hard refresh). */

const MAX_TRANSCRIPT_MESSAGES = 100;

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function migrateSessionId(sessionKey) {
  const fromSession = safeGet(sessionStorage, sessionKey);
  if (fromSession && !safeGet(localStorage, sessionKey)) {
    safeSet(localStorage, sessionKey, fromSession);
  }
  return safeGet(localStorage, sessionKey) || fromSession;
}

export function readSarahSessionId(sessionKey) {
  return migrateSessionId(sessionKey);
}

export function writeSarahSessionId(sessionKey, sessionId) {
  if (!sessionId) return;
  safeSet(localStorage, sessionKey, sessionId);
  safeSet(sessionStorage, sessionKey, sessionId);
}

export function readSarahTranscript(transcriptKey) {
  const raw = safeGet(localStorage, transcriptKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSarahTranscript(transcriptKey, messages) {
  if (!Array.isArray(messages)) return;
  const trimmed = messages.slice(-MAX_TRANSCRIPT_MESSAGES).map((m) => ({
    role: m.role === 'user' ? 'user' : 'ai',
    content: String(m.content || ''),
    actions: m.actions || undefined,
  }));
  safeSet(localStorage, transcriptKey, JSON.stringify(trimmed));
}
