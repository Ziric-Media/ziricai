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

function isLongRunningApiPath(path) {
  const p = String(path || '').split('?')[0];
  if (p === '/api/personal-sarah/chat') return true;
  if (/^\/api\/user-conversations\/[^/]+\/messages$/.test(p)) return true;
  if (/^\/api\/personal-sarah\/sessions\/[^/]+\/work\/submit$/.test(p)) return true;
  return false;
}

function resolveApiBase(path = '') {
  const c = cfg();
  const explicit = c.apiBase;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    return String(explicit).replace(/\/$/, '');
  }
  // Short calls (health, profile, lists) stay on sarah.ziricai.com/api — reliable on mobile networks.
  // Long Sarah turns bypass the Netlify proxy (~26s cap) and call Railway directly (CORS allowed).
  if (isLongRunningApiPath(path)) {
    const direct = c.sites?.api || 'https://ziricai-production.up.railway.app';
    return String(direct).replace(/\/$/, '');
  }
  return '';
}

/** Keep browser uploads on sarah.ziricai.com /api proxy (avoids cross-origin PUT failures in TWA). */
function sameOriginApiUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw, typeof location !== 'undefined' ? location.origin : undefined);
    if (u.pathname.startsWith('/api/')) {
      const origin = typeof location !== 'undefined' ? location.origin : '';
      return origin ? `${origin}${u.pathname}${u.search}` : `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  if (raw.startsWith('/api/') && typeof location !== 'undefined') {
    return `${location.origin}${raw}`;
  }
  return raw;
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
    await Promise.race([
      auth.authStateReady(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_READY_TIMEOUT')), 8000)),
    ]).catch(() => null);
    const user = auth.currentUser;
    if (user) {
      const token = await Promise.race([
        user.getIdToken(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_TOKEN_TIMEOUT')), 8000)),
      ]).catch(() => null);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  }
  return { ...options, headers };
}

function normalizeApiErrorBody(data, status) {
  const errBody = data?.error;
  const message =
    typeof errBody === 'string'
      ? errBody
      : errBody?.message || data?.message || `Request failed (${status})`;
  const code =
    (typeof errBody === 'object' && errBody?.code) || data?.code || (status === 401 ? 'UNAUTHORIZED' : undefined);
  return { message, code };
}

export function formatSarahApiError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error?.message) return String(error.message);
  return 'Request failed';
}

async function apiRequest(path, options = {}) {
  const { silent = false, timeoutMs = 28000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const finalOptions = await withAuthHeaders({ ...fetchOptions, signal: controller.signal });
    const res = await fetch(`${resolveApiBase(path)}${path}`, finalOptions);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const { message, code } = normalizeApiErrorBody(data, res.status);
      return {
        error: message,
        code,
        status: res.status,
        data,
      };
    }
    return { data, status: res.status };
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Request timed out. Check your connection and try again.'
        : err.message || 'Network error';
    if (!silent) console.warn('[SarahLive]', message);
    return { error: message, code: err?.name === 'AbortError' ? 'TIMEOUT' : undefined };
  } finally {
    clearTimeout(timer);
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
  const nextDetail = detail || '';
  if (connectionState === next && (lastHealthError || '') === nextDetail) return;
  connectionState = next;
  lastHealthError = nextDetail;
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
  const wasConnected = connectionState === 'connected';
  if (!wasConnected) setConnectionState('connecting');
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
    if (connectionState !== 'auth_required') setConnectionState('auth_required');
    return { ok: true, state: connectionState, authenticated: false };
  }
  if (!wasConnected || connectionState !== 'connected') setConnectionState('connected');
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

export async function uploadProfilePhoto(file) {
  if (!file) return { error: 'Choose an image file.' };
  const form = new FormData();
  form.append('file', file);
  const headers = {};
  await auth.authStateReady();
  const user = auth?.currentUser;
  if (user) {
    const token = await user.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${resolveApiBase()}/api/auth/profile-photo`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const { message, code } = normalizeApiErrorBody(data, res.status);
      return { error: message, code, status: res.status };
    }
    const photoURL = data?.profile?.photoURL || data?.profile?.photoUrl;
    if (photoURL) {
      consumerProfile = { ...(consumerProfile || {}), photoURL: String(photoURL) };
    }
    await refreshConsumerProfile();
    notifyAuth();
    return { data };
  } catch (err) {
    return { error: err.message || 'Upload failed' };
  }
}

export async function patchConsumerProfile(patch = {}) {
  const res = await apiRequest('/api/users/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.error) {
    consumerProfile = res.data?.profile || consumerProfile;
    notifyAuth();
  }
  return res;
}

export async function refreshConsumerProfile() {
  const prof = await fetchConsumerProfile();
  if (!prof.error) {
    consumerProfile = prof.data?.profile || prof.profile || consumerProfile;
    notifyAuth();
  }
  return consumerProfile;
}

async function ensureConsumerProfile(extra = {}) {
  let prof = await fetchConsumerProfile();
  if (prof.error) {
    const missingProfile =
      prof.code === 'CONSUMER_PROFILE_REQUIRED' ||
      prof.data?.error?.code === 'CONSUMER_PROFILE_REQUIRED' ||
      (prof.status === 403 && /profile required|bootstrap/i.test(String(prof.error || '')));
    if (prof.status === 401 || prof.code === 'UNAUTHORIZED') {
      setConnectionState('auth_required', prof.error);
      throw new Error(prof.error);
    }
    if (missingProfile || prof.status === 404) {
      const boot = await bootstrapConsumerProfile(extra);
      if (boot.error) throw new Error(boot.error);
      const bootProfile = boot.data?.profile || boot.data?.data?.profile;
      if (bootProfile) consumerProfile = bootProfile;
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

export function isAuthReady() {
  return authReady;
}

/** True when Firebase session exists (includes brief boot window before profile load). */
export function hasLiveSession() {
  return Boolean(signedInUser || auth?.currentUser);
}

export async function ensureFreshAuthToken() {
  if (!auth) return { error: 'Sign-in is not ready yet', code: 'AUTH_UNAVAILABLE' };
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return { error: 'Sign in to continue', code: 'AUTH_REQUIRED' };
  try {
    await user.getIdToken(true);
    signedInUser = user;
    return { ok: true };
  } catch (err) {
    return { error: err.message || 'Could not refresh sign-in', code: 'AUTH_TOKEN_FAILED' };
  }
}

/** Mobile TWA often needs a moment after paint before Firebase user is attachable. */
export async function waitForLiveSession(maxMs = 12000) {
  if (!auth) {
    return { error: 'App is still starting. Wait a few seconds and try again.', code: 'AUTH_UNAVAILABLE' };
  }
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (auth) {
      await Promise.race([
        auth.authStateReady(),
        new Promise((r) => setTimeout(r, 1200)),
      ]);
    }
    const user = signedInUser || auth?.currentUser;
    if (user) {
      signedInUser = user;
      try {
        await Promise.race([
          user.getIdToken(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('token')), 3000)),
        ]);
        return { ok: true, user };
      } catch {
        /* retry */
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return {
    error: 'Sign-in is still loading. Wait a moment or open Status again.',
    code: 'AUTH_PENDING',
  };
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
  const body = { title: options.title || undefined };
  if (options.mode) body.mode = options.mode;
  const res = await apiRequest('/api/personal-sarah/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const session = res.data?.session;
  if (session?.id) persistSessionId(session.id);
  return { session };
}

export async function fetchPersonalQuota() {
  const res = await apiRequest('/api/personal-sarah/quota', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { quota: res.data || {} };
}

export async function fetchPersonalUsageExport() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const res = await apiRequest('/api/personal-sarah/usage/export?format=json', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { export: res.data || {} };
}

export async function fetchPersonalWorkDeliverables(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/deliverables`, {
    silent: true,
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { deliverables: res.data?.deliverables || [], files: res.data?.files || [] };
}

export async function fetchPersonalWorkApprovals(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/approvals`, { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { approvals: res.data?.approvals || [] };
}

export async function resolvePersonalWorkApproval(sessionId, approvalId, body = {}) {
  const sid = String(sessionId || '').trim();
  const aid = String(approvalId || '').trim();
  if (!sid || !aid) return { error: 'Session id and approval id required' };
  const res = await apiRequest(
    `/api/personal-sarah/sessions/${encodeURIComponent(sid)}/work/approvals/${encodeURIComponent(aid)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (res.error) return { error: res.error, code: res.code, status: res.status, data: res.data };
  return {
    session: res.data?.session,
    approval: res.data?.approval,
    resumed: Boolean(res.data?.resumed),
  };
}

export async function fetchPersonalWorkDeliverable(sessionId, deliverableId) {
  const sid = String(sessionId || '').trim();
  const did = String(deliverableId || '').trim();
  if (!sid || !did) return { error: 'Session id and deliverable id required' };
  const res = await apiRequest(
    `/api/personal-sarah/sessions/${encodeURIComponent(sid)}/work/deliverables/${encodeURIComponent(did)}`,
    { silent: true }
  );
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { deliverable: res.data?.deliverable };
}

export async function fetchPersonalWorkReport(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/report`, { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { report: res.data?.report, workCompletedAt: res.data?.workCompletedAt, sessionId: id };
}

export async function patchPersonalWorkSettings(sessionId, settings) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { session: res.data?.session, settings: res.data?.settings };
}

export async function fetchPersonalWorkHome() {
  const res = await apiRequest('/api/personal-sarah/work/home', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { dashboard: res.data?.dashboard || {} };
}

export async function fetchPersonalWorkEstimate(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/estimate`, { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { workBudget: res.data?.workBudget };
}

export async function submitPersonalWorkSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status, data: res.data };
  return {
    session: res.data?.session,
    quota: res.data?.quota,
    workBudget: res.data?.workBudget,
    workRun: res.data?.workRun,
    workPaused: res.data?.workPaused,
  };
}

export async function cancelPersonalWorkSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return { error: 'Session id required' };
  const res = await apiRequest(`/api/personal-sarah/sessions/${encodeURIComponent(id)}/work/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    silent: true,
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status, data: res.data };
  return {
    session: res.data?.session,
    quota: res.data?.quota,
    released: res.data?.released,
    alreadyCancelled: res.data?.alreadyCancelled,
  };
}

export async function createPersonalReminder(body = {}) {
  const res = await apiRequest('/api/personal-sarah/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { reminder: res.data?.reminder };
}

export async function pollDuePersonalReminders() {
  const res = await apiRequest('/api/personal-sarah/reminders/due', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { delivered: res.data?.delivered ?? 0, items: res.data?.items || [] };
}

export async function fetchPersonalReminders({ limit = 50 } = {}) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const res = await apiRequest(`/api/personal-sarah/reminders?limit=${cap}`, { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { reminders: res.data?.reminders || [] };
}

export async function pollSarahNewsDelivery() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const res = await apiRequest('/api/personal-sarah/news/deliver/poll', { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const body = res.data || {};
  return {
    briefings: body.briefings || [],
    breaking: body.breaking || [],
    dueSlots: body.dueSlots || [],
  };
}

export async function checkPersonalReminderGeofence({ lat, lng } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { error: 'lat and lng required', code: 'GEO_INVALID' };
  }
  const res = await apiRequest('/api/personal-sarah/reminders/geo-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
    silent: true,
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return { delivered: res.data?.delivered ?? 0, items: res.data?.items || [], geo: res.data?.geo ?? 0 };
}

function readSarahHomePrefs() {
  try {
    const raw = sessionStorage.getItem('sarah.home.prefs');
    return raw ? JSON.parse(raw) : { dismissed: [], pinned: [], staticHome: false };
  } catch {
    return { dismissed: [], pinned: [], staticHome: false };
  }
}

export function saveSarahHomePrefsLocal(prefs) {
  try {
    sessionStorage.setItem('sarah.home.prefs', JSON.stringify(prefs || {}));
  } catch {
    /* ignore */
  }
}

export async function upsertPersonalKnowledgeSection(sectionKey, body) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const key = String(sectionKey || '').trim();
  if (!key) return { error: 'Section required', code: 'SECTION_REQUIRED' };
  const res = await apiRequest(`/api/personal-knowledge/sections/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (res.error) return { error: res.error, code: res.code };
  return { section: res.data?.section };
}

export async function fetchPersonalKnowledgeSections() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const res = await apiRequest('/api/personal-knowledge/sections', { silent: true });
  if (res.error) return { error: res.error, code: res.code };
  return { sections: res.data?.sections || [] };
}

export async function fetchSarahNewsProfile() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const res = await apiRequest('/api/personal-sarah/news/profile', { silent: true });
  if (res.error) return { error: res.error, code: res.code };
  const body = res.data || {};
  return { profile: body.profile ?? body.data?.profile ?? null };
}

export async function saveSarahNewsProfile(profile) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const res = await apiRequest('/api/personal-sarah/news/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile || {}),
  });
  if (res.error) return { error: res.error, code: res.code };
  const body = res.data || {};
  return { profile: body.profile ?? body.data?.profile ?? profile };
}

export async function fetchSarahNewsEdition(slot = '', { refresh = false } = {}) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const qs = new URLSearchParams();
  if (slot) qs.set('slot', slot);
  if (refresh) qs.set('refresh', '1');
  const q = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiRequest(`/api/personal-sarah/news/editions/latest${q}`, {
    silent: true,
    timeoutMs: 90000,
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const body = res.data || {};
  return { edition: body.edition ?? body.data?.edition, profile: body.profile };
}

export async function fetchSarahNewsStory(storyId, slot = '') {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const id = encodeURIComponent(String(storyId || '').trim());
  if (!id) return { error: 'storyId required', code: 'INVALID_REQUEST' };
  const q = slot ? `?slot=${encodeURIComponent(slot)}` : '';
  const res = await apiRequest(`/api/personal-sarah/news/stories/${id}${q}`, {
    silent: true,
    timeoutMs: 25000,
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const body = res.data || {};
  return { story: body.story ?? body.data?.story, edition: body.edition };
}

export async function fetchSarahHomeCards(mode = 'chat') {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const prefs = readSarahHomePrefs();
  const qs = new URLSearchParams({
    mode: mode === 'work' ? 'work' : 'chat',
    static: prefs.staticHome ? '1' : '0',
  });
  if (prefs.dismissed?.length) qs.set('dismissed', prefs.dismissed.join(','));
  if (prefs.pinned?.length) qs.set('pinned', prefs.pinned.join(','));
  const res = await apiRequest(`/api/personal-sarah/home/cards?${qs}`, { silent: true });
  if (res.error) return { error: res.error, code: res.code };
  return {
    greeting: res.data?.greeting,
    cards: res.data?.cards || [],
    moreCards: res.data?.moreCards || [],
    mode: res.data?.mode,
    signals: res.data?.signals,
  };
}

export async function fetchRevenuePublicConfig() {
  const res = await apiRequest('/api/revenue/config/public', { silent: true });
  if (res.error) return { error: res.error };
  return { config: res.data || {} };
}

export async function fetchMySubscription() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const res = await apiRequest('/api/revenue/subscription/me', { silent: true });
  if (res.error) return { error: res.error, code: res.code };
  return { subscription: res.data?.subscription, entitlement: res.data?.entitlement };
}

export async function checkoutConsumerPlan(skuId, opts = {}) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const id = String(skuId || '').trim();
  if (!id) return { error: 'Plan required', code: 'SKU_REQUIRED' };
  const returnUrl =
    String(opts.returnUrl || '').trim() ||
    (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  const res = await apiRequest('/api/revenue/subscription/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skuId: id, returnUrl: returnUrl || undefined }),
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const data = res.data || {};
  return {
    provider: data.provider,
    completed: Boolean(data.completed),
    reference: data.reference,
    authorizationUrl: data.authorizationUrl,
    subscription: data.subscription,
    entitlement: data.entitlement,
    checkoutKind: data.checkoutKind,
    creditsAdded: data.creditsAdded,
    topUpBalanceCredits: data.topUpBalanceCredits,
  };
}

export async function verifyConsumerCheckout(reference) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const ref = String(reference || '').trim();
  if (!ref) return { error: 'Reference required', code: 'REFERENCE_REQUIRED' };
  const qs = new URLSearchParams({ reference: ref });
  const res = await apiRequest(`/api/revenue/subscription/checkout/verify?${qs}`, { silent: true });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  return {
    ok: true,
    subscription: res.data?.subscription,
    entitlement: res.data?.entitlement,
    duplicate: res.data?.duplicate,
    checkoutKind: res.data?.checkoutKind,
    creditsAdded: res.data?.creditsAdded,
    topUpBalanceCredits: res.data?.topUpBalanceCredits,
  };
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
  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  if (!text && !attachments.length) return { error: 'Message is empty' };
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
      attachments,
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
    const code = res.code || res.data?.code;
    const quota =
      code === 'CHAT_QUOTA_EXCEEDED'
        ? { usage: res.data?.usage, limit: res.data?.limit, dayKey: res.data?.dayKey }
        : res.data?.quota;
    return {
      error: res.error,
      code,
      status: res.status,
      quota,
      creditsShadow: res.data?.creditsShadow,
      resumeHint: res.data?.resumeHint,
    };
  }
  const payload = res.data || {};
  if (payload.sessionId) persistSessionId(payload.sessionId);
  await checkApiHealth();
  return {
    reply: payload.reply || '…',
    sessionId: payload.sessionId || sessionId,
    mode: payload.mode,
    quota: payload.quota,
    creditsLast: payload.creditsLast,
    creditsShadow: payload.creditsShadow,
    recommendationsUi: payload.recommendationsUi || null,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    workCompleted: Boolean(payload.workCompleted),
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

export async function signUp({ email, password, firstName, lastName, city, country }) {
  if (!auth) return { error: 'Live mode not available' };
  try {
    const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
    signedInUser = cred.user;
    const first = String(firstName || '').trim();
    const last = String(lastName || '').trim();
    const fullName = [first, last].filter(Boolean).join(' ');
    await ensureConsumerProfile({
      email: String(email).trim(),
      firstName: first || undefined,
      lastName: last || undefined,
      preferredName: first || undefined,
      fullName: fullName || undefined,
      city: String(city || '').trim() || undefined,
      country: String(country || '').trim() || undefined,
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
/** Live Status feed — tenant posts from Company Portal. */
export async function fetchStatusFeed({ limit = 40 } = {}) {
  const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
  return apiRequest(`/api/network/v1/status-feed${qs}`);
}

export async function reactToStatusFeedPost(postId) {
  return apiRequest(`/api/network/v1/status-posts/${encodeURIComponent(postId)}/react`, { method: 'POST' });
}

export async function createStatusFeedComment(postId, payload = {}) {
  const body = String(payload.body || '').trim();
  if (!body) return { error: 'Comment is empty' };
  const ready = await ensureConsumerReady();
  if (ready.error) return ready;
  const res = await apiRequest(`/api/network/v1/status-posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body,
      parentCommentId: payload.parentCommentId || null,
    }),
  });
  if (!res.error) {
    const comment = res.data?.data?.comment ?? res.data?.comment;
    return { data: { comment }, status: res.status };
  }
  return res;
}

export async function ensureConsumerReady() {
  const session = await waitForLiveSession(8000);
  if (!session.ok) return { error: session.error, code: session.code || 'AUTH_REQUIRED' };
  const tok = await ensureFreshAuthToken();
  if (tok.error) return tok;
  try {
    const email = signedInUser.email || '';
    const guessName = email.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim() || 'Member';
    await ensureConsumerProfile({
      email,
      firstName: consumerProfile?.firstName || guessName.split(/\s+/)[0] || 'Member',
      lastName: consumerProfile?.lastName || guessName.split(/\s+/).slice(1).join(' ') || 'Member',
      preferredName: consumerProfile?.preferredName || guessName.split(/\s+/)[0] || 'Member',
      popiaConsentVersion: POPIA_CONSENT_VERSION,
    });
    return { ok: true, profile: consumerProfile };
  } catch (err) {
    return {
      error: err.message || 'Could not set up your Sarah profile',
      code: 'CONSUMER_PROFILE_REQUIRED',
    };
  }
}

export async function createConsumerStatusPost(payload = {}) {
  const ready = await ensureConsumerReady();
  if (ready.error) return ready;
  let res = await apiRequest('/api/network/v1/consumer-status-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (
    res.error &&
    (res.code === 'CONSUMER_PROFILE_REQUIRED' || res.status === 403) &&
    /profile required|bootstrap/i.test(String(res.error || ''))
  ) {
    const email = signedInUser?.email || '';
    const guessName = email.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim() || 'Member';
    const boot = await bootstrapConsumerProfile({
      email,
      firstName: consumerProfile?.firstName || guessName.split(/\s+/)[0] || 'Member',
      lastName: consumerProfile?.lastName || guessName.split(/\s+/).slice(1).join(' ') || 'Member',
      preferredName: consumerProfile?.preferredName || guessName.split(/\s+/)[0] || 'Member',
      popiaConsentVersion: POPIA_CONSENT_VERSION,
    });
    if (boot.error) {
      return { error: boot.error || ready.error, code: boot.code || 'CONSUMER_PROFILE_REQUIRED' };
    }
    await refreshConsumerProfile();
    res = await apiRequest('/api/network/v1/consumer-status-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  }
  if (!res.error) {
    const post = res.data?.data?.post ?? res.data?.post;
    return { data: { post }, status: res.status };
  }
  return res;
}

export async function uploadProfileCover(file) {
  if (!file) return { error: 'Choose an image file.' };
  const form = new FormData();
  form.append('file', file);
  const headers = {};
  await auth.authStateReady();
  const user = auth?.currentUser;
  if (user) {
    const token = await user.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${resolveApiBase()}/api/auth/profile-cover`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || `Upload failed (${res.status})`, code: data.code, status: res.status };
    }
    if (data.profile?.coverURL) {
      consumerProfile = { ...(consumerProfile || {}), coverURL: data.profile.coverURL };
    }
    await refreshConsumerProfile();
    notifyAuth();
    return { data };
  } catch (err) {
    return { error: err.message || 'Upload failed' };
  }
}

export async function recordDiscoverProfileView(snId) {
  return apiRequest(`/api/network/v1/entities/${encodeURIComponent(snId)}/metrics/profile-view`, { method: 'POST' });
}

export async function recordDiscoverLead(snId) {
  return apiRequest(`/api/network/v1/entities/${encodeURIComponent(snId)}/metrics/lead`, { method: 'POST' });
}

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

export async function fetchDiscoverCompany(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return { error: 'Missing business id' };
  return apiRequest(`/api/discover/companies/${encodeURIComponent(id)}`);
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

/** Phase 2.1 — register FCM / web push token (consent required server-side). */
export async function registerPushDevice({ token, consent = true, platform = 'web' } = {}) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const tok = String(token || '').trim();
  if (!tok) return { error: 'Push token required', code: 'PUSH_TOKEN_INVALID' };
  return normaliseNetworkResult(
    await apiRequest('/api/network/v1/my-push-devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, consent, platform }),
    })
  );
}

/** SNA-01E — global notification prefs (push + quiet hours). */
export async function fetchMyNotificationPreferences() {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const out = normaliseNetworkResult(await apiRequest('/api/network/v1/my-notification-preferences', { silent: true }));
  return out.error ? out : { prefs: out.data?.prefs || {} };
}

export async function updateMyNotificationPreferences(prefs) {
  const blocked = await requireSignedInConsumer();
  if (blocked) return blocked;
  const patch = prefs && typeof prefs === 'object' ? prefs : {};
  const out = normaliseNetworkResult(
    await apiRequest('/api/network/v1/my-notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: patch }),
      silent: true,
    })
  );
  return out.error ? out : { prefs: out.data?.prefs || patch };
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
  const id = resolveLiveCompanySarahId(companyId);
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

export function resolveLiveCompanySarahId(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return id;
  if (id === 'central-motors' || id === 'central_motors') return 'central-motors-rtb';
  return id;
}

export async function sendCompanyMessage(companyId, payload) {
  const body = typeof payload === 'string' ? { message: payload } : payload || {};
  const text = String(body.message || '').trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!text && !attachments.length) return { error: 'Message is empty' };
  const id = resolveLiveCompanySarahId(companyId);
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
    body: JSON.stringify({ message: text, attachments }),
    timeoutMs: 120000,
  });
}

export async function createChatMediaUpload(meta) {
  return apiRequest('/api/chat/media/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta || {}),
  });
}

export async function uploadChatMedia(file, { timeoutMs = 120000 } = {}) {
  if (!file) return { error: 'No file' };
  const session = await waitForLiveSession(8000);
  if (!session.ok) return session;
  const tok = await ensureFreshAuthToken();
  if (tok.error) return tok;
  const init = await createChatMediaUpload({
    mimeType: file.type || 'application/octet-stream',
    byteLength: file.size,
    fileName: file.name,
  });
  if (init.error) return init;
  const upload = init.data?.upload ?? init.data?.data?.upload;
  if (!upload?.uploadUrl) return { error: 'Upload could not start' };
  const uploadUrl = sameOriginApiUrl(upload.uploadUrl);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
  const putOpts = await withAuthHeaders({
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
    signal: controller?.signal,
  });
  const putRes = await fetch(uploadUrl, putOpts);
  const putData = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    const { message, code } = normalizeApiErrorBody(putData, putRes.status);
    return { error: message, code, status: putRes.status };
  }
  return { attachment: putData.attachment || putData.data?.attachment };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { error: 'Upload timed out — check connection and try a smaller photo.', code: 'UPLOAD_TIMEOUT' };
    }
  throw err;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
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
    isAuthReady,
    hasLiveSession,
    waitForLiveSession,
    ensureFreshAuthToken,
    getConsumerProfile,
    getAuthUid: () => signedInUser?.uid || auth?.currentUser?.uid || consumerProfile?.uid || null,
    getSessionId,
    fetchActiveSession,
    fetchPersonalSessions,
    createPersonalSession,
    fetchPersonalQuota,
    fetchPersonalUsageExport,
    submitPersonalWorkSession,
    cancelPersonalWorkSession,
    fetchPersonalWorkHome,
    patchPersonalWorkSettings,
    fetchPersonalWorkReport,
    fetchPersonalWorkDeliverables,
    fetchPersonalWorkDeliverable,
    fetchPersonalWorkApprovals,
    resolvePersonalWorkApproval,
    fetchPersonalWorkEstimate,
    createPersonalReminder,
    fetchPersonalReminders,
    pollDuePersonalReminders,
    pollSarahNewsDelivery,
    checkPersonalReminderGeofence,
    fetchSarahHomeCards,
    fetchSarahNewsProfile,
    saveSarahNewsProfile,
    fetchSarahNewsEdition,
    fetchSarahNewsStory,
    upsertPersonalKnowledgeSection,
    fetchPersonalKnowledgeSections,
    saveSarahHomePrefsLocal,
    readSarahHomePrefs,
    fetchRevenuePublicConfig,
    fetchMySubscription,
    checkoutConsumerPlan,
    verifyConsumerCheckout,
    fetchPersonalSession,
    sendPersonalMessage,
    checkApiHealth,
    getConnectionState,
    onConnectionChange,
    signIn,
    signUp,
    patchConsumerProfile,
    uploadProfilePhoto,
    uploadProfileCover,
    refreshConsumerProfile,
    ensureConsumerReady,
    formatSarahApiError,
    createConsumerStatusPost,
    createStatusFeedComment,
    uploadChatMedia,
    signOut: signOutUser,
    onAuthChange,
    resolveApiBase,
    fetchChatConversations,
    fetchDiscoverCompanies,
    fetchDiscoverCompany,
    fetchStatusFeed,
    reactToStatusFeedPost,
    recordDiscoverProfileView,
    recordDiscoverLead,
    fetchConnections,
    fetchMyOrganisations,
    fetchMyUpdates,
    fetchMyNotifications,
    fetchMyNotificationPreferences,
    updateMyNotificationPreferences,
    markNotificationsRead,
    registerPushDevice,
    updateOrganisationPreferences,
    setEntityRelationship,
    subscribeToEntity,
    unsubscribeFromEntity,
    fetchCompanyMessages,
    resolveLiveCompanySarahId,
    sendCompanyMessage,
    fetchPersonMessages,
    sendPersonMessage,
    fetchGroupMessages,
    sendGroupMessage,
    fetchNetworkMessages,
    searchChatThreads,
    patchChatPreferences,
    requestHumanHandover,
    createChatMediaUpload,
    uploadChatMedia,
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
        const email = user.email || '';
        const fromName = String(user.displayName || '').trim();
        const guess = fromName || email.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim() || 'Member';
        const parts = guess.split(/\s+/).filter(Boolean);
        await ensureConsumerProfile({
          email,
          firstName: parts[0] || 'Member',
          lastName: parts.slice(1).join(' ') || 'Member',
          preferredName: parts[0] || 'Member',
          popiaConsentVersion: POPIA_CONSENT_VERSION,
        });
        await refreshConsumerProfile();
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
