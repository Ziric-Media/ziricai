import {
  observeAuthState,
  loginUser,
  logoutUser,
  isSuperAdminRole,
  resolveAuthProfile,
} from '../auth.js';
import { state, setState } from './core/dataStore.js';
import { showToast } from '../admin/ui.js';
import { getPermissions } from './permissions.js';
import { resolveDemoProfile, DEMO_BRANDING } from './demo-data.js';
import { shouldUseDemoFallback } from '../shared/dataMode.js';
import { adminUrl, portalUrl } from '../shared/siteUrls.js';
import {
  fetchPortalCompany,
  fetchPortalNotifications,
  fetchPortalTeam,
  fetchPortalUsage,
  prefetchHub,
  fetchWorkspaceSnapshot,
} from './core/dataService.js';
import { DEMO_COMPANY_ID } from './demo-data.js';

/** @type {((user: import('firebase/auth').User, profile: object) => void | Promise<void>) | null} */
let onAuthReady = null;

const DEFAULT_PORTAL_FAVICON = 'assets/favicon-portal.svg';

function companyInitials(name) {
  const parts = String(name || 'C').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || 'C').toUpperCase();
}

function applyFavicon(url) {
  const href = url?.trim() || DEFAULT_PORTAL_FAVICON;
  for (const rel of ['icon', 'apple-touch-icon']) {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      if (rel === 'icon') link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    link.href = href;
  }
}

function applyBranding(branding) {
  if (branding?.primaryColor) {
    document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
    document.documentElement.style.setProperty('--primary', branding.primaryColor);
  }
  applyFavicon(branding?.faviconUrl);
}

async function loadTenantContext(profile) {
  const companyId = profile.companyId;
  const isDemoTenant = profile.isDemo && companyId === DEMO_COMPANY_ID;

  const [companyRes, teamRes, notifRes, usageRes, workspaceRes] = await Promise.all([
    fetchPortalCompany(companyId),
    fetchPortalTeam(companyId),
    fetchPortalNotifications(companyId),
    fetchPortalUsage(companyId),
    isDemoTenant ? Promise.resolve({ data: null }) : fetchWorkspaceSnapshot(companyId),
  ]);

  const workspace = workspaceRes.data || null;
  const company =
    workspace?.company ||
    companyRes.data?.company ||
    { id: companyId, name: workspace?.company?.name || 'Your Company' };

  const storedBranding = localStorage.getItem(`ziric-portal-branding-${companyId}`);
  const branding = storedBranding
    ? JSON.parse(storedBranding)
    : workspace?.branding || companyRes.data?.branding || company.branding || (shouldUseDemoFallback({ companyId, isDemo: isDemoTenant }) ? DEMO_BRANDING : { primaryColor: '#1e40af', faviconUrl: 'assets/favicon-portal.svg' });

  const subscription = companyRes.data?.subscription || companyRes.data?.usage || null;
  const team = teamRes.data?.items?.length ? teamRes.data.items : workspace?.team || [];
  const notifications = notifRes.data?.items || [];
  const usage = usageRes.data?.usage || subscription;

  const permissions = getPermissions(profile.role);

  setState({
    profile,
    companyId,
    company: { ...company, branding },
    branding,
    workspace,
    permissions,
    team,
    notifications,
    unreadNotifications: notifications.filter((n) => !n.read).length,
    usage,
  });

  applyBranding(branding);
  updateShellUI(profile, company, branding);
  updateNotificationBadge();

  prefetchHub(companyId).catch((err) => console.warn('[portal] hub prefetch:', err.message));
}

async function completeLoginSession(user, profile) {
  if (profile && isSuperAdminRole(profile.role)) {
    showSuperAdminRedirect();
    return;
  }

  await loadTenantContext(profile);
  hideAuthScreens();
  await onAuthReady?.(user, profile);
}

function showSuperAdminRedirect() {
  document.getElementById('loginScreen')?.classList.remove('open');
  document.getElementById('appShell')?.classList.add('hidden');
  const denied = document.getElementById('accessDeniedScreen');
  if (denied) {
    denied.classList.add('open');
    const msg = document.getElementById('accessDeniedMessage');
    if (msg) {
      msg.innerHTML =
        `This account has Super Admin access. Please use the <a href="${adminUrl()}">Super Admin Console</a> instead.`;
    }
  }
}

function showLoginScreen() {
  document.getElementById('loginScreen')?.classList.add('open');
  document.getElementById('accessDeniedScreen')?.classList.remove('open');
  document.getElementById('appShell')?.classList.add('hidden');
}

function hideAuthScreens() {
  document.getElementById('loginScreen')?.classList.remove('open');
  document.getElementById('accessDeniedScreen')?.classList.remove('open');
  document.getElementById('appShell')?.classList.remove('hidden');
}

function updateShellUI(profile, company, branding) {
  const name = profile?.fullName || profile?.name || profile?.email || 'User';
  const initial = name.charAt(0).toUpperCase();

  document.querySelectorAll('#userMenu .avatar, #sidebarAvatar').forEach((el) => {
    el.textContent = initial;
  });
  document.querySelectorAll('#userMenu .name, #sidebarUserName').forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll('#userMenu .role, #sidebarUserRole').forEach((el) => {
    el.textContent = profile?.role || 'member';
  });
  const emailEl = document.getElementById('sidebarUserEmail');
  if (emailEl) emailEl.textContent = profile?.email || '';

  const sidebarBrand = document.getElementById('sidebarBrandName');
  if (sidebarBrand) sidebarBrand.textContent = company?.name || 'Company Portal';

  const sidebarLogo = document.getElementById('sidebarLogo');
  if (sidebarLogo) {
    if (branding?.logoUrl) {
      sidebarLogo.classList.add('has-image');
      sidebarLogo.innerHTML = `<img src="${branding.logoUrl}" alt="${company?.name || ''}" />`;
    } else {
      sidebarLogo.classList.remove('has-image');
      sidebarLogo.textContent = companyInitials(company?.name);
    }
  }
}

export function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  const n = state.unreadNotifications ?? 0;
  badge.textContent = n > 0 ? String(n) : '';
  badge.classList.toggle('hidden', n <= 0);
}

async function resolvePortalProfile(user) {
  return resolveAuthProfile(user, { demoFallback: resolveDemoProfile });
}

export function initAuthGuard({ onReady, onDenied }) {
  onAuthReady = onReady ?? null;

  observeAuthState(async (user) => {
    if (!user) {
      setState({ user: null, profile: null, companyId: null, company: null, permissions: {} });
      showLoginScreen();
      onDenied?.();
      return;
    }

    setState({ user });

    const profile = await resolvePortalProfile(user);

    if (!profile) {
      document.getElementById('accessDeniedMessage').textContent =
        'No profile found for this account. Complete onboarding or contact your administrator.';
      document.getElementById('loginScreen')?.classList.remove('open');
      document.getElementById('accessDeniedScreen')?.classList.add('open');
      return;
    }

    if (profile.role === 'superadmin' || isSuperAdminRole(profile.role)) {
      showSuperAdminRedirect();
      return;
    }

    if (!profile.companyId) {
      document.getElementById('accessDeniedMessage').textContent =
        'No company assigned to this account. Contact your administrator.';
      document.getElementById('loginScreen')?.classList.remove('open');
      document.getElementById('accessDeniedScreen')?.classList.add('open');
      return;
    }

    await completeLoginSession(user, profile);
  });
}

export function bindLoginForm() {
  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const status = document.getElementById('loginStatus');
    if (status) status.textContent = 'Signing in...';

    const result = await loginUser(email, password);
    if (result.error) {
      if (status) status.textContent = result.error;
      showToast(result.error, 'error');
      return;
    }

    const profile = result.profile || (await resolvePortalProfile(result.user));
    if (!profile?.companyId) {
      const msg = profile
        ? 'No company assigned to this account.'
        : 'Profile not found. Use onboarding to create your workspace.';
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }

    if (status) status.textContent = 'Opening portal...';
    try {
      await completeLoginSession(result.user, profile);
      if (status) status.textContent = '';
    } catch (err) {
      console.error('Portal init failed:', err);
      const message = err?.message || 'Failed to open portal.';
      if (status) status.textContent = message;
      showToast(message, 'error');
    }
  });
}

export function bindLogout() {
  document.addEventListener('click', async (e) => {
    if (e.target?.id === 'logoutBtn' || e.target?.closest?.('#headerLogoutBtn')) {
      await logoutUser();
      showToast('Signed out', 'info');
    }
  });
}

export { applyBranding };
