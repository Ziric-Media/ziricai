import { observeAuthState, loginUser, registerUser, logoutUser } from '../auth.js';
import { bootstrapConsumerProfile, fetchConsumerProfile, POPIA_CONSENT_VERSION } from './api.js';
import { setState, state } from './core/state.js';
import { navigateTo, initRouter } from './router.js';

function showAuth() {
  document.getElementById('authScreen')?.classList.remove('hidden');
  document.getElementById('appShell')?.classList.add('hidden');
}

function showApp() {
  document.getElementById('authScreen')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
  const name =
    state.consumerProfile?.preferredName ||
    state.consumerProfile?.firstName ||
    'friend';
  const el = document.getElementById('shellGreeting');
  if (el) el.textContent = `Hello, ${name}`;
}

async function ensureConsumerProfile(user, extra = {}) {
  const boot = await bootstrapConsumerProfile({
    email: user.email,
    ...extra,
    popiaConsentVersion: POPIA_CONSENT_VERSION,
  });
  if (boot.error) throw new Error(boot.error);
  const prof = await fetchConsumerProfile();
  if (prof.error) throw new Error(prof.error);
  setState({
    consumerProfile: prof.data?.profile || prof.profile,
    preferences: prof.data?.preferences || prof.preferences,
  });
}

export function bindAuthForms() {
  document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-auth-tab]').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const signin = tab.dataset.authTab === 'signin';
      document.getElementById('signInForm')?.classList.toggle('hidden', !signin);
      document.getElementById('signUpForm')?.classList.toggle('hidden', signin);
    });
  });

  document.getElementById('signInForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('authStatus');
    status.textContent = 'Signing in…';
    const fd = new FormData(e.target);
    const res = await loginUser(fd.get('email'), fd.get('password'));
    if (res.error) {
      status.textContent = res.error;
      return;
    }
    try {
      await ensureConsumerProfile(res.user);
      status.textContent = '';
    } catch (err) {
      status.textContent = err.message || 'Could not load Sarah profile';
    }
  });

  document.getElementById('signUpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('authStatus');
    status.textContent = 'Creating account…';
    const fd = new FormData(e.target);
    if (!fd.get('popia')) {
      status.textContent = 'Please accept the privacy terms.';
      return;
    }
    const reg = await registerUser(fd.get('email'), fd.get('password'));
    if (reg.error) {
      status.textContent = reg.error;
      return;
    }
    try {
      await ensureConsumerProfile(reg.user, {
        firstName: fd.get('firstName'),
        preferredName: fd.get('firstName'),
      });
      status.textContent = '';
    } catch (err) {
      status.textContent = err.message || 'Account created but profile setup failed';
    }
  });

  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    setState({ consumerProfile: null, preferences: null, firebaseUser: null });
    showAuth();
  });
}

let routerReady = false;

export function initAuthGuard() {
  bindAuthForms();
  observeAuthState(async (user) => {
    setState({ firebaseUser: user });
    if (!user) {
      showAuth();
      return;
    }
    try {
      const prof = await fetchConsumerProfile();
      if (prof.error && prof.code === 'CONSUMER_PROFILE_REQUIRED') {
        await ensureConsumerProfile(user);
      } else if (prof.error) {
        await ensureConsumerProfile(user);
      } else {
        setState({
          consumerProfile: prof.data?.profile || prof.profile,
          preferences: prof.data?.preferences || prof.preferences,
        });
      }
      showApp();
      if (!routerReady) {
        initRouter();
        routerReady = true;
      }
      navigateTo(location.hash.replace(/^#/, '') || 'chats');
    } catch {
      showAuth();
      const status = document.getElementById('authStatus');
      if (status) status.textContent = 'Sign in again or complete registration.';
    }
  });
}
