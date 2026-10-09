/**
 * Unified sign-in from the marketing site — routes to Mission Control or Company Portal.
 */
import {
  loginUser,
  observeAuthState,
  resolveAuthProfile,
  logoutUser,
} from './auth.js';
import { createLoginBusy } from './shared/loginBusy.js';
import { resolvePostLoginDestination } from './shared/postLoginRedirect.js';
import {
  buildHandoffRedirectUrl,
  fetchAuthHandoffToken,
  targetNeedsAuthHandoff,
} from './shared/authHandoff.js';
import { landingHomeUrl } from './shared/siteUrls.js';

async function redirectAfterLogin(user, profile) {
  const resolved = profile || (await resolveAuthProfile(user, { allowDemo: false }));
  const dest = resolvePostLoginDestination(resolved);
  if (dest.error) {
    await logoutUser();
    return { error: dest.error };
  }

  let target = dest.url;
  if (targetNeedsAuthHandoff(target)) {
    const idToken = await user.getIdToken();
    const customToken = await fetchAuthHandoffToken(idToken);
    if (!customToken) {
      return { error: 'Could not open your workspace. Try again or sign in at the app directly.' };
    }
    target = buildHandoffRedirectUrl(target, customToken);
    await logoutUser();
  }

  window.location.assign(target);
  return { ok: true };
}

async function tryAutoRedirect(user) {
  const profile = await resolveAuthProfile(user, { allowDemo: false });
  const dest = resolvePostLoginDestination(profile);
  if (dest.error) return;
  await redirectAfterLogin(user, profile);
}

function bindForm() {
  const form = document.getElementById('loginForm');
  const busy = createLoginBusy(form, document.getElementById('loginStatus'));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;

    const email = document.getElementById('loginEmail')?.value?.trim() || '';
    const password = document.getElementById('loginPassword')?.value || '';
    busy.start('Signing in...');

    try {
      const result = await loginUser(email, password);
      if (result.error) {
        busy.stop(result.error);
        return;
      }

      busy.step('Opening your workspace...');
      const outcome = await redirectAfterLogin(result.user, result.profile);
      if (outcome.error) {
        busy.stop(outcome.error);
      }
    } catch (err) {
      const message = err?.message || 'Sign in failed. Please try again.';
      busy.stop(message);
    }
  });
}

if (location.protocol !== 'file:') {
  bindForm();
  observeAuthState((user) => {
    if (user) tryAutoRedirect(user).catch(() => {});
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const lead = document.querySelector('.auth-lead');
    if (lead) {
      lead.textContent = 'Run npm run dev and open this page over http://localhost — Firebase cannot load from file://.';
    }
  });
}

document.getElementById('backToHome')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = landingHomeUrl();
});
