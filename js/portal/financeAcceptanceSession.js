/**
 * Shared loopback session for Finance acceptance API (localhost only).
 */
import { state, setState } from './core/dataStore.js';
import { setFinanceAcceptanceBearer } from '../shared/apiRequest.js';
import { getPermissions } from './permissions.js';

export const ACCEPTANCE_HOSTS = new Set(['localhost', '127.0.0.1']);

export function assertAcceptanceHost() {
  const host = location.hostname;
  if (!ACCEPTANCE_HOSTS.has(host)) {
    throw new Error('Finance acceptance portal is localhost-only.');
  }
}

export function hideAuthScreens() {
  document.getElementById('loginScreen')?.classList.remove('open');
  document.getElementById('accessDeniedScreen')?.classList.remove('open');
  document.getElementById('appShell')?.classList.remove('hidden');
}

async function fetchAcceptanceSession(role) {
  const res = await fetch(`/api/finance-acceptance/session?role=${encodeURIComponent(role)}`, {
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Acceptance session failed (${res.status})`);
  }
  return body;
}

async function maybeSeedDemo(token, seed) {
  if (seed !== '1') return;
  const res = await fetch('/api/finance-acceptance/seed-demo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Demo seed failed (${res.status})`);
  }
}

export async function assertAcceptanceApiActive() {
  const health = await fetch('/api/finance-acceptance/health').then((r) => (r.ok ? r.json() : null));
  if (!health?.ok) {
    throw new Error(
      'Finance acceptance API is not active. Start: npm run dev:finance-acceptance'
    );
  }
}

/**
 * @param {{ role?: string, seed?: string }} opts
 */
export async function establishAcceptancePortalState(opts = {}) {
  assertAcceptanceHost();
  await assertAcceptanceApiActive();

  const role = opts.role === 'viewer' ? 'viewer' : 'owner';
  const session = await fetchAcceptanceSession(role);
  setFinanceAcceptanceBearer(session.token);
  if (role === 'owner' && opts.seed === '1') {
    await maybeSeedDemo(session.token, '1');
  }

  const profile = session.profile;
  const permissions = getPermissions(profile.role);
  setState({
    user: { uid: profile.uid, email: profile.email },
    profile,
    companyId: session.companyId,
    company: { id: session.companyId, name: 'Finance Acceptance (local)' },
    permissions,
    notifications: [],
    unreadNotifications: 0,
    team: [],
  });

  return session;
}
