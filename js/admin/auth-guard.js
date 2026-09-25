import { observeAuthState, loginUser, logoutUser, isSuperAdminRole, resolveAuthProfile } from '../auth.js';
import { setState } from './state.js';
import { showToast } from './ui.js';
import { createLoginBusy } from '../shared/loginBusy.js';

/** @type {((user: import('firebase/auth').User, profile: object | null) => void | Promise<void>) | null} */
let onAuthReady = null;

function showAccessDenied(message) {
  document.getElementById('loginScreen')?.classList.remove('open');
  document.getElementById('accessDeniedScreen')?.classList.add('open');
  const msgEl = document.getElementById('accessDeniedMessage');
  if (msgEl) msgEl.textContent = message;
}

async function completeLoginSession(user, profile) {
  setState({ user, profile });
  hideAuthScreens();
  updateUserMenu(profile, user.email);
  await onAuthReady?.(user, profile);
}

export function initAuthGuard({ onReady, onDenied }) {
  onAuthReady = onReady ?? null;

  observeAuthState(async (user) => {
    if (!user) {
      setState({ user: null, profile: null });
      showLoginScreen();
      onDenied?.();
      return;
    }

    const profile = await resolveAuthProfile(user, { allowDemo: false });

    if (!profile) {
      showAccessDenied(
        'No Super Admin Firestore profile found for your account. Open superadmin-register.html with the same email/password to link your profile, then sign in again.'
      );
      return;
    }

    if (!isSuperAdminRole(profile.role)) {
      showAccessDenied(
        'This account is not a Super Admin. Please use the Company Portal instead.'
      );
      return;
    }

    if (profile.status && String(profile.status).toLowerCase() !== 'active') {
      showAccessDenied('This account is not active. Contact platform support.');
      return;
    }

    await completeLoginSession(user, profile);
  });
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

function updateUserMenu(profile, email) {
  const name = profile?.fullName || profile?.name || email || 'Super Admin';
  const avatar = document.querySelector('#userMenu .avatar');
  const nameEl = document.querySelector('#userMenu .name');
  const roleEl = document.querySelector('#userMenu .role');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = profile?.role || 'superadmin';

  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const sidebarName = document.getElementById('sidebarUserName');
  const sidebarEmail = document.getElementById('sidebarUserEmail');
  if (sidebarAvatar) sidebarAvatar.textContent = name.charAt(0).toUpperCase();
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarEmail) sidebarEmail.textContent = email || 'admin@ziricai.com';
}

export function bindLoginForm() {
  const form = document.getElementById('loginForm');
  const busy = createLoginBusy(form, document.getElementById('loginStatus'));
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    busy.start('Signing in...');

    try {
      const result = await loginUser(email, password);
      if (result.error) {
        busy.stop(result.error);
        showToast(result.error, 'error');
        return;
      }

      busy.step('Verifying access...');
      const { user } = result;
      const profile = result.profile || (await resolveAuthProfile(user, { allowDemo: false }));

      if (!profile || !isSuperAdminRole(profile.role)) {
        const msg = 'Super Admin access required for this console.';
        busy.stop(msg);
        showToast(msg, 'error');
        showAccessDenied(msg);
        return;
      }

      busy.step('Opening dashboard...');
      await completeLoginSession(user, profile);
      busy.stop();
    } catch (err) {
      console.error('Console login failed:', err);
      const message = err?.message || 'Sign in failed. Please try again.';
      busy.stop(message);
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
