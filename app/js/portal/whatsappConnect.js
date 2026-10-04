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
import { runMetaEmbeddedSignupConnect } from '../shared/metaEmbeddedSignupClient.js';

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
      const data = await runMetaEmbeddedSignupConnect({
        config,
        companyId,
        completeSignup: completeWhatsAppEmbeddedSignup,
        onStatus: (msg) => {
          if (statusEl) statusEl.textContent = msg;
        },
      });
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
