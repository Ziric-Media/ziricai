/**
 * Connects UX prototype My Sarah to U1/U2 consumer APIs (Firebase auth + Personal Sarah chat).
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

const POPIA_CONSENT_VERSION = 'sarah-u1-2026-11-04';
const SESSION_STORAGE_KEY = 'sarah.app.personalSarah.sessionId';
const LEGACY_SESSION_STORAGE_KEY = 'sarah.prototype.personalSarah.sessionId';

/** @typedef {'connecting'|'connected'|'offline'|'auth_required'|'error'} SarahConnectionState */

function cfg() {
  return window.__ZIRICAI_CONFIG__ || {};
}

function firebaseConfig() {
  const fb = cfg().firebase;
  if (!fb || !fb.apiKey || String(fb.apiKey).includes('your_firebase')) return null;
  return fb;
}

export function isLiveEnabled() {
  if (cfg().prototypeLive === false) return false;
  if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
  return Boolean(firebaseConfig());
}

function resolveApiBase() {
  const c = cfg();
  if (c.apiBase !== undefined && c.apiBase !== null) return c.apiBase;
  if (c.sites?.api) return c.sites.api;
  return 'https://ziricai-production.up.railway.app';
}

let auth = null;
let signedInUser = null;
let consumerProfile = null;
let authReady = false;
/** @type {SarahConnectionState} */
let connectionState = 'connecting';
let lastHealthError = '';

async function withAuthHeaders(options = {}) {
  const headers = { ...(options.headers || {}) };
  if (auth) {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  }
  return { ...options, headers };
}

async function apiRequest(path, options = {}) {
  const { silent = false, ...fetchOptions } = options;
  try {
    const finalOptions = await withAuthHeaders(fetchOptions);
    const res = await fetch(`${resolveApiBase()}${path}`, finalOptions);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        error: data.error || `Request failed (${res.status})`,
        code: data.code,
        status: res.status,
        data,
      };
    }
    return { data, status: res.status };
  } catch (err) {
    const message = err.message || 'Network error';
    if (!silent) console.warn('[SarahLive]', message);
    return { error: message };
  }
}

function readSessionId() {
  try {
    let id = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (id) {
        localStorage.setItem(SESSION_STORAGE_KEY, id);
        localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      }
    }
    return id;
  } catch {
    return null;
  }
}

function persistSessionId(id) {
  try {
    if (id) localStorage.setItem(SESSION_STORAGE_KEY, id);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const connectionListeners = new Set();

function setConnectionState(next, detail = '') {
  connectionState = next;
  lastHealthError = detail || '';
  connectionListeners.forEach((fn) => {
    try {
      fn(connectionState, detail);
    } catch (e) {
      console.warn('[SarahLive] connection listener', e);
    }
  });
}

export function getConnectionState() {
  return connectionState;
}

export function onConnectionChange(fn) {
  connectionListeners.add(fn);
  fn(connectionState, lastHealthError);
  return () => connectionListeners.delete(fn);
}

export async function checkApiHealth() {
  if (!isLiveEnabled()) {
    setConnectionState('offline', 'Live mode unavailable');
    return { ok: false, state: connectionState };
  }
  setConnectionState('connecting');
  const res = await apiRequest('/api/health', { silent: true });
  if (res.error) {
    setConnectionState('offline', res.error);
    return { ok: false, state: connectionState, error: res.error };
  }
  const status = res.data?.status;
  if (status && status !== 'ok' && status !== 'starting') {
    setConnectionState('error', `API status: ${status}`);
    return { ok: false, state: connectionState, error: lastHealthError };
  }
  if (auth) {
    try {
      await auth.authStateReady();
      if (auth.currentUser) signedInUser = auth.currentUser;
    } catch {
      /* ignore */
    }
  }
  if (!signedInUser) {
    setConnectionState('auth_required');
    return { ok: true, state: connectionState, authenticated: false };
  }
  setConnectionState('connected');
  return { ok: true, state: connectionState, authenticated: true };
}

async function bootstrapConsumerProfile(extra = {}) {
  return apiRequest('/api/users/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: signedInUser?.email,
      popiaConsentVersion: POPIA_CONSENT_VERSION,
      ...extra,
    }),
  });
}

async function fetchConsumerProfile() {
  return apiRequest('/api/users/profile', { silent: true });
}

async function ensureConsumerProfile(extra = {}) {
  let prof = await fetchConsumerProfile();
  if (prof.error) {
    const missingProfile =
      prof.code === 'CONSUMER_PROFILE_REQUIRED' ||
      (prof.status === 403 && /profile required|bootstrap/i.test(String(prof.error || '')));
    if (prof.status === 401 || prof.code === 'UNAUTHORIZED') {
      setConnectionState('auth_required', prof.error);
      throw new Error(prof.error);
    }
    if (missingProfile || prof.status === 404) {
      const boot = await bootstrapConsumerProfile(extra);
      if (boot.error) throw new Error(boot.error);
      prof = await fetchConsumerProfile();
    } else if (prof.error) {
      throw new Error(prof.error);
    }
  }
  if (prof.error) throw new Error(prof.error);
  consumerProfile = prof.data?.profile || prof.profile || consumerProfile;
  return consumerProfile;
}

export function isSignedIn() {
  return Boolean(signedInUser);
}

export function getConsumerProfile() {
  return consumerProfile;
}

export function getSessionId() {
  return readSessionId();
}

export async function fetchActiveSession() {
  const res = await apiRequest('/api/personal-sarah/sessions/active', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const session = res.data?.session;
  if (!session) return { session: null };
  if (session.id) persistSessionId(session.id);
  return {
    sessionId: session.id,
    title: session.title,
    messages: (session.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };
}

export async function fetchPersonalSessions() {
  const res = await apiRequest('/api/personal-sarah/sessions', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { sessions: res.data?.sessions || [] };
}

export async function createPersonalSession(options = {}) {
  const res = await apiRequest('/api/personal-sarah/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: options.title || undefined }),
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const session = res.data?.session;
  if (session?.id) persistSessionId(session.id);
  return { session };
}

export async function fetchPersonalSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}`, { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const session = res.data?.session;
  if (session?.id) persistSessionId(session.id);
  return { session };
}

export async function sendPersonalMessage(message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return { error: 'Message is empty' };
  if (!signedInUser) return { error: 'Sign in to chat with Personal Sarah', code: 'AUTH_REQUIRED' };
  if (!consumerProfile) {
    try {
      await ensureConsumerProfile();
    } catch (err) {
      return { error: err.message || 'Could not set up your Sarah profile', code: 'CONSUMER_PROFILE_REQUIRED' };
    }
  }

  const sessionId = options.sessionId ?? readSessionId();
  const res = await apiRequest('/api/personal-sarah/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      sessionId,
      preferences: options.work ? { mode: 'work' } : null,
    }),
  });
  if (res.error) {
    if (res.status === 401 || res.code === 'UNAUTHORIZED') {
      setConnectionState('auth_required', res.error);
    } else if (res.status >= 500) {
      setConnectionState('error', res.error);
    }
    const quota =
      res.data?.code === 'CHAT_QUOTA_EXCEEDED' || res.code === 'CHAT_QUOTA_EXCEEDED'
        ? { usage: res.data?.usage, limit: res.data?.limit, dayKey: res.data?.dayKey }
        : res.data?.quota;
    return { error: res.error, code: res.code || res.data?.code, status: res.status, quota };
  }
  const payload = res.data || {};
  if (payload.sessionId) persistSessionId(payload.sessionId);
  await checkApiHealth();
  return {
    reply: payload.reply || '…',
    sessionId: payload.sessionId || sessionId,
    mode: payload.mode,
    quota: payload.quota,
  };
}

function authErrorMessage(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/user-not-found': 'No account with that email.',
    'auth/email-already-in-use': 'Email already registered — sign in instead.',
    'auth/weak-password': 'Password should be at least 6 characters.',
  };
  return map[code] || err?.message || 'Authentication failed';
}

export async function signIn(email, password) {
  if (!auth) return { error: 'Live mode not available' };
  try {
    const cred = await signInWithEmailAndPassword(auth, String(email).trim(), password);
    signedInUser = cred.user;
    await ensureConsumerProfile();
    await checkApiHealth();
    return { user: cred.user, profile: consumerProfile };
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
}

export async function signUp({ email, password, firstName }) {
  if (!auth) return { error: 'Live mode not available' };
  try {
    const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
    signedInUser = cred.user;
    await ensureConsumerProfile({
      firstName: firstName || undefined,
      preferredName: firstName || undefined,
    });
    await checkApiHealth();
    return { user: cred.user, profile: consumerProfile };
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
}

export async function signOutUser() {
  if (auth) await signOut(auth);
  signedInUser = null;
  consumerProfile = null;
  setConnectionState('auth_required');
}

export async function fetchChatConversations(filter = 'all') {
  const qs = filter && filter !== 'all' ? `?filter=${encodeURIComponent(filter)}` : '';
  return apiRequest(`/api/chat/conversations${qs}`);
}

/**
 * SNET-01b — live Discover directory (published Sarah Network businesses).
 * Public read: works signed out (the server only returns listed, non-suspended entries).
 */
export async function fetchDiscoverCompanies({ q = '', category = '', limit = 50, city = '', region = '', near = '', radiusKm = '' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category && category !== 'all') params.set('category', category);
  // Phase 2.0 geo filters (server: /api/discover/companies)
  if (city) params.set('city', city);
  if (region) params.set('region', region);
  if (near) params.set('near', near);
  if (near && radiusKm) params.set('radiusKm', String(radiusKm));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return apiRequest(`/api/discover/companies${qs ? `?${qs}` : ''}`);
}

/* ---------- SNET-11 — relationships (follow / subscribe) keyed by SN-ID ---------- */

const SUBSCRIBE_SCOPE = 'sarah_network_subscription';

/** v1 envelope errors are `{ code, message }`; normalise to string + code for the UI. */
function normaliseNetworkResult(res) {
  if (!res.error) return { data: res.data?.data ?? res.data };
  const e = res.error;
  const isObj = typeof e === 'object' && e !== null;
  return {
    error: isObj ? e.message || e.code || 'Request failed' : e,
    code: (isObj && e.code) || res.code,
    status: res.status,
  };
}

async function requireSignedInConsumer() {
  if (!signedInUser) return { error: 'Sign in to continue', code: 'AUTH_REQUIRED' };
  try {
    await ensureConsumerProfile();
  } catch (err) {
    return { error: err.message || 'Could not set up your Sarah profile', code: 'CONSUMER_PROFILE_REQUIRED' };
  }
  return null;
}

/** All of the signed-in user's relationships → `{ connections: [{ snId, state, consent }] }`. */
export async function fetchConnections() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(await apiRequest('/api/network/v1/connections', { silent: true }));
  return out.error ? out : { connections: out.data?.connections || [] };
}

/**
 * Apply a consumer relationship action (follow | unfollow | unsubscribe | block | …) → `{ connection }`.
 * `subscribe` needs a consent grant — use `subscribeToEntity`.
 */
export async function setEntityRelationship(snId, action, options = {}) {
  const id = String(snId || '').trim();
  if (!id) return { error: 'This business has no Sarah Network ID yet', code: 'SNID_REQUIRED' };
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(
    await apiRequest('/api/network/v1/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: id, action, grantId: options.grantId || undefined }),
    })
  );
  return out.error ? out : { connection: out.data?.connection };
}

/** Subscribe = standing, entity-scoped consent grant + `subscribe` action (nothing is disclosed by default). */
export async function subscribeToEntity(snId, { disclosedFields = [] } = {}) {
  const id = String(snId || '').trim();
  if (!id) return { error: 'This business has no Sarah Network ID yet', code: 'SNID_REQUIRED' };
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const grantRes = normaliseNetworkResult(
    await apiRequest('/api/sarah-network/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snId: id, scope: SUBSCRIBE_SCOPE, disclosedFields }),
    })
  );
  if (grantRes.error) return grantRes;
  const grantId = grantRes.data?.grant?.grantId;
  if (!grantId) return { error: 'Could not record your consent', code: 'GRANT_CREATE_FAILED' };
  const sub = await setEntityRelationship(id, 'subscribe', { grantId });
  if (sub.error) {
    // Do not leave an unused standing grant behind.
    await apiRequest(`/api/sarah-network/grants/${encodeURIComponent(grantId)}/revoke`, { method: 'POST', silent: true });
  }
  return sub;
}

/** Gate 2 — My Organisations: relationships joined to public org cards → `{ organisations, counts }`. */
export async function fetchMyOrganisations() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(await apiRequest('/api/network/v1/my-organisations', { silent: true }));
  return out.error ? out : { organisations: out.data?.organisations || [], counts: out.data?.counts || {} };
}

/** Gate 6 — updates from organisations the user subscribed to (pull feed) → `{ updates }`. */
export async function fetchMyUpdates(limit = 20) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(await apiRequest(`/api/network/v1/my-updates?limit=${encodeURIComponent(limit)}`, { silent: true }));
  return out.error ? out : { updates: out.data?.updates || [] };
}

/** Phase 2.0 — persisted in-app notifications (poll) → `{ notifications, unread }`. */
export async function fetchMyNotifications(limit = 30) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(await apiRequest(`/api/network/v1/my-notifications?limit=${encodeURIComponent(limit)}`, { silent: true }));
  return out.error ? out : { notifications: out.data?.notifications || [], unread: Number(out.data?.unread) || 0 };
}

/** Phase 2.0 — mark notifications read: `{ ids: string[] }` or `{ all: true }` → `{ updated, unread }`. */
export async function markNotificationsRead({ ids = [], all = false } = {}) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(
    await apiRequest('/api/network/v1/my-notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all ? { all: true } : { ids }),
      silent: true,
    })
  );
  return out.error ? out : { updated: Number(out.data?.updated) || 0, unread: Number(out.data?.unread) || 0 };
}

/** Gate 2 — channel preferences for one organisation (`{ notifications, announcements, reminders }` booleans). */
export async function updateOrganisationPreferences(snId, prefs) {
  const id = String(snId || '').trim();
  if (!id) return { error: 'This business has no Sarah Network ID yet', code: 'SNID_REQUIRED' };
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(
    await apiRequest(`/api/network/v1/my-organisations/${encodeURIComponent(id)}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs }),
    })
  );
  return out.error ? out : { prefs: out.data?.prefs };
}

/** Unsubscribe (back to following) and revoke the standing consent grant. */
export async function unsubscribeFromEntity(snId, grantId = null) {
  const out = await setEntityRelationship(snId, 'unsubscribe');
  if (!out.error && grantId) {
    await apiRequest(`/api/sarah-network/grants/${encodeURIComponent(grantId)}/revoke`, { method: 'POST', silent: true });
  }
  return out;
}

export async function fetchCompanyMessages(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return { error: 'Company id required' };
  if (!signedInUser) return { error: 'Sign in to chat with Company Sarah', code: 'AUTH_REQUIRED' };
  try {
    await ensureConsumerProfile();
  } catch (err) {
    return { error: err.message || 'Could not set up your Sarah profile', code: 'CONSUMER_PROFILE_REQUIRED' };
  }
  return apiRequest(`/api/user-conversations/${encodeURIComponent(id)}/messages`);
}

export async function fetchPersonMessages(conversationId) {
  return apiRequest(`/api/person-conversations/${encodeURIComponent(conversationId)}/messages`);
}

export async function sendPersonMessage(conversationId, message) {
  return apiRequest(`/api/person-conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export async function fetchGroupMessages(groupId) {
  return apiRequest(`/api/group-conversations/${encodeURIComponent(groupId)}/messages`);
}

export async function sendGroupMessage(groupId, message) {
  return apiRequest(`/api/group-conversations/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export async function fetchNetworkMessages(conversationId, since = null) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return apiRequest(`/api/network-conversations/${encodeURIComponent(conversationId)}/messages${qs}`);
}

export async function searchChatThreads(query) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiRequest(`/api/chat/search${qs}`);
}

export async function patchChatPreferences(conversationId, patch) {
  return apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
}

export async function requestHumanHandover(companyId) {
  return apiRequest(`/api/user-conversations/${encodeURIComponent(companyId)}/request-human`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function sendCompanyMessage(companyId, message) {
  const text = String(message || '').trim();
  if (!text) return { error: 'Message is empty' };
  const id = String(companyId || '').trim();
  if (!id) return { error: 'Company id required' };
  if (!signedInUser) return { error: 'Sign in to chat with Company Sarah', code: 'AUTH_REQUIRED' };
  try {
    await ensureConsumerProfile();
  } catch (err) {
    return { error: err.message || 'Could not set up your Sarah profile', code: 'CONSUMER_PROFILE_REQUIRED' };
  }
  return apiRequest(`/api/user-conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text }),
  });
}

const authListeners = new Set();

export function onAuthChange(fn) {
  authListeners.add(fn);
  if (authReady) fn(signedInUser, consumerProfile);
  return () => authListeners.delete(fn);
}

function notifyAuth() {
  authListeners.forEach((fn) => {
    try {
      fn(signedInUser, consumerProfile);
    } catch (e) {
      console.warn('[SarahLive] auth listener', e);
    }
  });
}

function mountPublicApi() {
  window.SarahLive = {
    ready: true,
    isLiveEnabled,
    isSignedIn,
    getConsumerProfile,
    getSessionId,
    fetchActiveSession,
    fetchPersonalSessions,
    createPersonalSession,
    fetchPersonalSession,
    sendPersonalMessage,
    checkApiHealth,
    getConnectionState,
    onConnectionChange,
    signIn,
    signUp,
    signOut: signOutUser,
    onAuthChange,
    resolveApiBase,
    fetchChatConversations,
    fetchDiscoverCompanies,
    fetchConnections,
    fetchMyOrganisations,
    fetchMyUpdates,
    fetchMyNotifications,
    markNotificationsRead,
    updateOrganisationPreferences,
    setEntityRelationship,
    subscribeToEntity,
    unsubscribeFromEntity,
    fetchCompanyMessages,
    sendCompanyMessage,
    fetchPersonMessages,
    sendPersonMessage,
    fetchGroupMessages,
    sendGroupMessage,
    fetchNetworkMessages,
    searchChatThreads,
    patchChatPreferences,
    requestHumanHandover,
  };
}

function signalSarahLiveBoot(kind) {
  if (window.__sarahLiveBootSignaled) return;
  window.__sarahLiveBootSignaled = true;
  window.dispatchEvent(new CustomEvent(kind));
}

const liveBootWatchdog = window.setTimeout(() => {
  if (!window.__sarahLiveBootSignaled) signalSarahLiveBoot('sarah-live-skipped');
}, 4000);

async function start() {
  if (!isLiveEnabled()) {
    window.clearTimeout(liveBootWatchdog);
    signalSarahLiveBoot('sarah-live-skipped');
    return;
  }

  const app = initializeApp(firebaseConfig());
  auth = getAuth(app);
  mountPublicApi();
  window.clearTimeout(liveBootWatchdog);
  signalSarahLiveBoot('sarah-live-ready');
  await checkApiHealth();

  onAuthStateChanged(auth, async (user) => {
    signedInUser = user;
    consumerProfile = null;
    if (user) {
      try {
        await ensureConsumerProfile();
      } catch (err) {
        console.warn('[SarahLive] profile', err.message);
      }
    } else {
      setConnectionState('auth_required');
    }
    authReady = true;
    notifyAuth();
    await checkApiHealth();
  });

  await auth.authStateReady();
  signedInUser = auth.currentUser;
  authReady = true;
  notifyAuth();
  await checkApiHealth();
}

start().catch((err) => {
  console.warn('[SarahLive] failed to start', err);
  window.clearTimeout(liveBootWatchdog);
  signalSarahLiveBoot('sarah-live-skipped');
});
