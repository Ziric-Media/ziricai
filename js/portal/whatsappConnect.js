/**
 * Meta WhatsApp Embedded Signup wizard for Company Portal.
 */
import { state } from './core/dataStore.js';
import { showToast } from '../admin/ui.js';
import {
  fetchWhatsAppEmbeddedSignupConfig,
  completeWhatsAppEmbeddedSignup,
  syncClientZeroWhatsApp,
} from './api.js';
import { isClientZeroCompanyId } from '../shared/clientZero.js';

let fbSdkPromise = null;

function loadFacebookSdk(appId, graphVersion) {
  if (window.FB) return Promise.resolve(window.FB);
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = function fbAsyncInit() {
      try {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: graphVersion || 'v26.0',
        });
        resolve(window.FB);
      } catch (err) {
        reject(err);
      }
    };

    if (document.getElementById('facebook-jssdk')) {
      const wait = setInterval(() => {
        if (window.FB) {
          clearInterval(wait);
          resolve(window.FB);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(wait);
        if (!window.FB) reject(new Error('Facebook SDK failed to load'));
      }, 15000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('Could not load Facebook SDK'));
    document.body.appendChild(script);
  });

  return fbSdkPromise;
}

function parseEmbeddedSignupMessage(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed?.type === 'WA_EMBEDDED_SIGNUP') return parsed;
    if (parsed?.event && parsed?.data) return parsed;
  } catch {
    /* ignore non-JSON postMessage noise */
  }
  return null;
}

function waitForEmbeddedSignupFinish(timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Meta signup timed out — try again'));
    }, timeoutMs);

    function onMessage(event) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }
      const payload = parseEmbeddedSignupMessage(event.data);
      if (!payload) return;

      const eventName = payload.event || payload.data?.event;
      if (eventName === 'CANCEL') {
        cleanup();
        reject(new Error('Meta signup cancelled'));
        return;
      }
      if (eventName === 'ERROR') {
        cleanup();
        const errMsg =
          payload.data?.error_message ||
          payload.error_message ||
          payload.data?.errorMessage ||
          'Meta signup failed';
        reject(new Error(errMsg));
        return;
      }

      const data = payload.data || payload;
      const hasAssets =
        data?.phone_number_id ||
        data?.phoneNumberId ||
        data?.waba_id ||
        data?.wabaId;

      if (eventName === 'FINISH' || (payload.type === 'WA_EMBEDDED_SIGNUP' && hasAssets)) {
        cleanup();
        resolve(data);
      }
    }

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }

    window.addEventListener('message', onMessage);
  });
}

function closeWizard(overlay) {
  overlay?.classList.remove('open');
  setTimeout(() => overlay?.remove(), 200);
}

function setWizardBody(overlay, html) {
  const body = overlay?.querySelector('.wizard-body');
  if (body) body.innerHTML = html;
}

/**
 * Open Meta Embedded Signup to connect WhatsApp Business for the current tenant.
 * @param {{ companyId?: string, onComplete?: () => void }} [options]
 */
export async function openWhatsAppConnectWizard(options = {}) {
  const companyId = options.companyId || state.companyId || state.company?.id;
  if (!companyId) {
    showToast('Sign in to connect WhatsApp', 'warning');
    return;
  }

  const configRes = await fetchWhatsAppEmbeddedSignupConfig(companyId);
  const config = configRes.data || {};
  if (configRes.error) {
    showToast(configRes.error, 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'wizard-overlay open';
  overlay.id = 'waEmbeddedSignupModal';
  overlay.innerHTML = `
    <div class="wizard-modal" style="max-width:520px;">
      <div class="wizard-header">
        <div>
          <h2><i class="fa-brands fa-whatsapp" style="color:#25D366;"></i> Connect WhatsApp Business</h2>
          <p class="muted" style="margin:4px 0 0;font-size:13px;">Sign in with Meta to register your business number.</p>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" data-wa-close><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="wizard-body"></div>
      <div class="wizard-footer">
        <button class="btn btn-secondary" type="button" data-wa-close>Cancel</button>
        <button class="btn btn-primary" type="button" id="waEmbeddedLaunchBtn" disabled>
          <i class="fa-brands fa-meta"></i> Continue with Meta
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-wa-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeWizard(overlay));
  });

  const launchBtn = overlay.querySelector('#waEmbeddedLaunchBtn');

  const clientZero = isClientZeroCompanyId(companyId);
  const webhookUrl = config.clientZero?.webhookUrl || 'https://ziricai-production.up.railway.app/webhook';

  if (!config.enabled && clientZero) {
    setWizardBody(
      overlay,
      `<p style="line-height:1.6;color:var(--text-secondary);">
        You completed WhatsApp setup in Meta (webhooks, phone number, test message).
        Link that number to <strong>Client Zero</strong> so inbound messages reach Sarah with your playbook and Knowledge Base.
      </p>
      <p style="font-size:13px;margin-top:12px;"><strong>Webhook URL</strong> (Meta → Configuration):<br>
        <code style="word-break:break-all;">${webhookUrl}</code></p>
      <p class="muted" style="font-size:13px;margin-top:8px;">
        Optional: paste your Meta <strong>Phone number ID</strong> if it differs from the platform default.
      </p>
      <input type="text" id="waClientZeroPhoneId" class="form-input" placeholder="Phone number ID (optional)" style="width:100%;margin-top:8px;" />
      <div id="waEmbeddedStatus" class="muted" style="font-size:13px;margin-top:12px;"></div>`
    );
    if (launchBtn) {
      launchBtn.disabled = false;
      launchBtn.innerHTML = '<i class="fa-solid fa-link"></i> Link Client Zero WhatsApp';
      launchBtn.addEventListener('click', async () => {
        const statusEl = overlay.querySelector('#waEmbeddedStatus');
        launchBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Linking to ZiricAI…';
        const phoneNumberId = overlay.querySelector('#waClientZeroPhoneId')?.value?.trim() || '';
        const syncRes = await syncClientZeroWhatsApp(companyId, phoneNumberId ? { phoneNumberId } : {});
        if (syncRes.error) {
          showToast(syncRes.error, 'error');
          if (statusEl) statusEl.textContent = syncRes.error;
          launchBtn.disabled = false;
          return;
        }
        const data = syncRes.data || {};
        if (data.runtimeReady) {
          showToast('Client Zero WhatsApp connected — Sarah will handle inbound messages.', 'success');
        } else {
          showToast(data.error || 'Saved — your operator may need to finish platform WhatsApp credentials.', 'warning');
        }
        closeWizard(overlay);
        options.onComplete?.();
      });
    }
    return;
  }

  if (!config.enabled) {
    setWizardBody(
      overlay,
      `<p style="line-height:1.6;color:var(--text-secondary);">
        Self-serve Meta signup is not configured on this environment yet.
        Your operator can set <code>META_APP_ID</code> and <code>WHATSAPP_EMBEDDED_CONFIG_ID</code> on the API,
        or link your number from Mission Control.
      </p>
      <p style="margin-top:12px;">
        <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">Open Meta Business Suite</a>
      </p>`
    );
    if (launchBtn) launchBtn.remove();
    return;
  }

  setWizardBody(
    overlay,
    `<ol style="margin:0 0 16px 20px;line-height:1.7;color:var(--text-secondary);font-size:14px;">
      <li>Sign in with your Meta Business account</li>
      <li>Create or select a WhatsApp Business account</li>
      <li>Add and verify your business phone number</li>
      <li>Grant ZiricAI permission to message on your behalf</li>
    </ol>
    <p class="muted" style="font-size:13px;">Use a number not active on WhatsApp mobile or another API provider.</p>
    <div id="waEmbeddedStatus" class="muted" style="font-size:13px;margin-top:12px;"></div>`
  );

  if (launchBtn) launchBtn.disabled = false;

  let connectInFlight = false;

  launchBtn?.addEventListener('click', async () => {
    if (connectInFlight) return;
    const statusEl = overlay.querySelector('#waEmbeddedStatus');
    connectInFlight = true;
    launchBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Loading Meta…';

    try {
      await loadFacebookSdk(config.appId, config.graphVersion);
      if (statusEl) statusEl.textContent = 'Complete the steps in the Meta window…';

      let authCode = null;
      const finishPromise = waitForEmbeddedSignupFinish();

      window.FB.login(
        (response) => {
          if (response?.authResponse?.code) {
            authCode = response.authResponse.code;
          } else if (response?.status === 'unknown') {
            /* Popup closed before finish — postMessage handler may still reject. */
          }
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: '',
            sessionInfoVersion: '3',
          },
        }
      );

      const signupData = await finishPromise;
      if (!authCode) {
        await new Promise((r) => setTimeout(r, 400));
      }
      if (statusEl) statusEl.textContent = 'Saving your connection…';

      const completeRes = await completeWhatsAppEmbeddedSignup(companyId, {
        ...signupData,
        code: authCode,
      });
      if (completeRes.error) {
        showToast(completeRes.error, 'error');
        if (statusEl) statusEl.textContent = completeRes.error;
        launchBtn.disabled = false;
        connectInFlight = false;
        return;
      }

      const data = completeRes.data || {};
      const conn = data.connection || {};
      const phone = conn.displayPhone || conn.displayPhoneMasked || 'your number';
      const business = conn.businessName ? ` · ${conn.businessName}` : '';

      if (data.runtimeReady) {
        showToast(`WhatsApp connected — ${phone}${business}`, 'success');
      } else {
        showToast(
          data.message ||
            'Number registered — your operator may need to finish platform activation.',
          'warning'
        );
      }

      closeWizard(overlay);
      options.onComplete?.();
    } catch (err) {
      const msg = err?.message || 'WhatsApp connect failed';
      if (msg !== 'Meta signup cancelled') showToast(msg, 'error');
      if (statusEl) statusEl.textContent = msg;
      launchBtn.disabled = false;
      connectInFlight = false;
      return;
    }
    connectInFlight = false;
  });
}
