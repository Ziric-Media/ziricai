import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader } from '../../admin/ui.js';
import { renderQuickActions } from '../core/widgets/quickActions.js';
import { navigateTo } from '../router.js';
import { fetchIntegrationChannels } from '../api.js';

const CHANNEL_ICONS = {
  whatsapp: { icon: 'fa-brands fa-whatsapp', color: 'green' },
  facebook: { icon: 'fa-brands fa-facebook', color: 'blue' },
  instagram: { icon: 'fa-brands fa-instagram', color: 'purple' },
  telegram: { icon: 'fa-brands fa-telegram', color: 'blue' },
  webchat: { icon: 'fa-comments', color: 'purple' },
  email: { icon: 'fa-envelope', color: 'yellow' },
  sms: { icon: 'fa-mobile-screen', color: 'grey' },
  google_calendar: { icon: 'fa-calendar', color: 'blue' },
  microsoft_365: { icon: 'fa-microsoft', color: 'blue' },
  stripe: { icon: 'fa-credit-card', color: 'purple' },
  paystack: { icon: 'fa-money-bill', color: 'green' },
  firebase: { icon: 'fa-fire', color: 'yellow' },
};

function renderChannelCard(ch) {
  const meta = CHANNEL_ICONS[ch.channel] || { icon: 'fa-plug', color: 'grey' };
  const connected = ch.configured;
  return `
    <div class="bos-integration-card ${connected ? 'connected' : ''}">
      <div class="bos-integration-icon ${meta.color}"><i class="fa-solid ${meta.icon}"></i></div>
      <div class="bos-integration-body">
        <h4>${escapeHtml(ch.label || ch.channel)}</h4>
        <p>${escapeHtml(ch.description || '')}</p>
        <span class="bos-integration-status ${connected ? 'on' : 'off'}">${connected ? 'Connected' : 'Not connected'}</span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-channel="${ch.channel}">
        ${connected ? 'Manage' : 'Connect'}
      </button>
    </div>`;
}

export async function renderIntegrations(container) {
  const companyId = state.companyId || state.company?.id;
  if (!companyId) {
    container.innerHTML = pageHeader('Integrations', 'Connect channels and third-party tools.') +
      '<p class="muted">Sign in to manage integrations for your company.</p>';
    return;
  }
  let channels = [];
  let loadError = null;

  const { data, error } = await fetchIntegrationChannels(companyId);
  if (error) {
    loadError = error;
  } else {
    channels = (data?.channels || []).filter((ch) => ch.type === 'messaging' || ch.type === 'connector');
  }

  container.innerHTML = `
    ${pageHeader('Integrations', 'Connect channels and third-party tools to your Business OS.')}
    ${loadError ? `<div class="bos-alert warn">${escapeHtml(loadError)}</div>` : ''}
    ${renderQuickActions([
      { label: 'Connect WhatsApp', icon: 'fa-brands fa-whatsapp', action: 'connect-whatsapp', color: 'green' },
      { label: 'Ask Sarah to Connect', icon: 'fa-sparkles', action: 'sarah-connect', color: 'purple' },
    ])}
    <div class="bos-integrations-grid">
      ${channels.length ? channels.map(renderChannelCard).join('') : '<p class="muted">Loading integration channels…</p>'}
    </div>
  `;

  container.querySelector('[data-action="connect-whatsapp"]')?.addEventListener('click', async () => {
    const { openPortalSarah } = await import('../sarah/sarah-ui.js');
    openPortalSarah();
  });

  container.querySelector('[data-action="sarah-connect"]')?.addEventListener('click', async () => {
    const { openPortalSarah } = await import('../sarah/sarah-ui.js');
    openPortalSarah();
  });

  container.querySelectorAll('[data-channel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.channel;
      if (ch === 'google_calendar' || ch === 'microsoft_365') {
        alert(`Connect ${ch.replace('_', ' ')} in Settings → Integrations. OAuth flow coming soon — use Sarah to configure.`);
        return;
      }
      navigateTo('settings');
    });
  });
}
