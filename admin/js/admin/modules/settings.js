import { state } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  loadingState,
  showToast,
} from '../ui.js';
import { fetchAdminConfig, fetchHealth } from '../api.js';
import { app } from '../../firebase.js';

export async function renderSettings(container) {
  container.innerHTML = loadingState('Loading platform settings...');
  const [health, config] = await Promise.all([fetchHealth(), fetchAdminConfig()]);

  const firebaseProject = app?.options?.projectId || 'ziricai';

  container.innerHTML = `
    ${pageHeader('Settings', 'Platform integrations — secrets are never shown in full.')}

    <div class="profile-grid">
      <div class="profile-card">
        <h4>Firebase</h4>
        <div class="info-row"><span class="label">Project ID</span><span class="value">${escapeHtml(firebaseProject)}</span></div>
        <div class="info-row"><span class="label">Auth</span><span class="value">Firebase Auth (superadmin role)</span></div>
        <div class="info-row"><span class="label">Database</span><span class="value">Firestore (default)</span></div>
      </div>

      <div class="profile-card">
        <h4>WhatsApp Cloud API</h4>
        <div class="info-row"><span class="label">Status</span><span class="value">${health.data?.whatsapp ? '✅ Configured' : '⚠️ Connect data'}</span></div>
        <div class="info-row"><span class="label">Phone Number ID</span><span class="value">${escapeHtml(config.data?.whatsapp?.phoneNumberId || 'Not set')}</span></div>
        <div class="info-row"><span class="label">Webhook</span><span class="value">GET/POST /webhook</span></div>
        <div class="info-row"><span class="label">Token</span><span class="value">Stored server-side (.env)</span></div>
      </div>

      <div class="profile-card">
        <h4>OpenAI</h4>
        <div class="info-row"><span class="label">Status</span><span class="value">${health.data?.openai ? '✅ Configured' : '⚠️ Connect data'}</span></div>
        <div class="info-row"><span class="label">Model</span><span class="value">${escapeHtml(config.data?.openai?.model || 'gpt-4o-mini')}</span></div>
        <div class="info-row"><span class="label">API Key</span><span class="value">Stored server-side (.env)</span></div>
      </div>

      <div class="profile-card">
        <h4>API Keys (display only)</h4>
        <div class="info-row"><span class="label">Production</span><span class="value">zk_live_••••••••</span></div>
        <div class="info-row"><span class="label">Staging</span><span class="value">zk_test_••••••••</span></div>
        <div class="info-row"><span class="label">Note</span><span class="value">Manage real keys in server environment variables</span></div>
      </div>
    </div>

    <div class="profile-card" style="margin-top:16px;">
      <h4>Account</h4>
      <div class="info-row"><span class="label">Signed in as</span><span class="value">${escapeHtml(state.user?.email || '—')}</span></div>
      <div class="info-row"><span class="label">Role</span><span class="value">${escapeHtml(state.profile?.role || '—')}</span></div>
      <div style="margin-top:16px;">
        <button class="btn btn-secondary btn-sm" type="button" id="refreshSettingsBtn">↻ Refresh Status</button>
        <button class="btn btn-secondary btn-sm" type="button" id="logoutBtn">Sign Out</button>
      </div>
    </div>
  `;

  container.querySelector('#refreshSettingsBtn')?.addEventListener('click', () => {
    showToast('Refreshing...', 'info');
    renderSettings(container);
  });
}
