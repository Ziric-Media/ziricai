import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, errorState } from '../../admin/ui.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { renderQuickActions } from '../core/widgets/quickActions.js';
import { navigateTo } from '../router.js';
import { fetchIntegrationChannels, fetchIntegrationLogs } from '../api.js';
import { formatPortalWhatsAppDisplay } from '../integrationDisplay.js';
import {
  showUpgradeDialog,
  integrationUpgradeMessage,
} from '../upgradeDialog.js';

const RETRY_BTN = '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>';
const FREE_CHANNELS = new Set(['whatsapp']);

const CHANNEL_ICONS = {
  whatsapp: { icon: 'fa-brands fa-whatsapp', color: 'green' },
  facebook: { icon: 'fa-brands fa-facebook', color: 'blue' },
  instagram: { icon: 'fa-brands fa-instagram', color: 'purple' },
  telegram: { icon: 'fa-brands fa-telegram', color: 'blue' },
  webchat: { icon: 'fa-solid fa-comments', color: 'purple' },
  email: { icon: 'fa-solid fa-envelope', color: 'yellow' },
  sms: { icon: 'fa-solid fa-mobile-screen', color: 'grey' },
  google_calendar: { icon: 'fa-solid fa-calendar', color: 'blue' },
  microsoft_365: { icon: 'fa-brands fa-microsoft', color: 'blue' },
  stripe: { icon: 'fa-solid fa-credit-card', color: 'purple' },
  paystack: { icon: 'fa-solid fa-money-bill', color: 'green' },
  firebase: { icon: 'fa-solid fa-fire', color: 'yellow' },
};

function isIncludedChannel(channel) {
  return FREE_CHANNELS.has(String(channel || '').toLowerCase());
}

function statusLabel(ch) {
  if (ch.configured) {
    if (ch.integrationStatus) return String(ch.integrationStatus).replace(/_/g, ' ');
    return 'Connected';
  }
  return 'Not connected';
}

function openIntegrationUpgrade(integrationName) {
  showUpgradeDialog({
    title: 'Upgrade to unlock integrations',
    featureLabel: integrationName,
    message: integrationUpgradeMessage(integrationName),
    confirmLabel: 'View billing plans',
  });
}

function renderChannelCard(ch) {
  const meta = CHANNEL_ICONS[ch.channel] || { icon: 'fa-solid fa-plug', color: 'grey' };
  const connected = ch.configured;
  const included = isIncludedChannel(ch.channel);
  const detail =
    ch.channel === 'whatsapp' && connected
      ? ch.displayPhoneNumber || ch.description || 'Active on this workspace'
      : ch.description || '';
  const iconClass = meta.icon.startsWith('fa-') && meta.icon.includes(' ')
    ? meta.icon
    : `fa-solid ${meta.icon}`;
  const priceBadge = included
    ? '<span class="bos-integration-price included">Included</span>'
    : '<span class="bos-integration-price paid">Paid</span>';

  let actionLabel = 'Connect';
  let actionClass = 'btn-primary';
  if (connected) {
    actionLabel = 'Manage';
    actionClass = 'btn-secondary';
  } else if (!included) {
    actionLabel = 'Upgrade';
    actionClass = 'btn-primary';
  }

  return `
    <article class="bos-integration-card ${connected ? 'is-connected' : 'is-idle'} ${included ? 'is-included' : 'is-paid'}">
      <div class="bos-integration-icon ${meta.color}"><i class="${iconClass}"></i></div>
      <div class="bos-integration-body">
        <h4>${escapeHtml(ch.label || ch.channel)} ${priceBadge}</h4>
        <p>${escapeHtml(detail)}</p>
        <span class="bos-integration-status ${connected ? 'on' : 'off'}">
          <span class="bos-integration-dot"></span>
          ${escapeHtml(statusLabel(ch))}
        </span>
      </div>
      <button type="button" class="btn ${actionClass} btn-sm bos-integration-action" data-channel="${escapeHtml(ch.channel)}" data-label="${escapeHtml(ch.label || ch.channel)}" data-included="${included ? '1' : '0'}" data-connected="${connected ? '1' : '0'}">
        ${actionLabel}
      </button>
    </article>`;
}

function renderConnectedSummary(integrations = []) {
  const wa = formatPortalWhatsAppDisplay(integrations);
  if (!integrations.length) return '';

  return `
    <div class="card portal-integrations-summary" style="margin-bottom:20px;">
      <div class="card-header">
        <h3><i class="fa-brands fa-whatsapp"></i> Live connection</h3>
      </div>
      <div class="card-body" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;">
        <div>
          <div class="label" style="font-size:12px;color:var(--text-muted);">WhatsApp number</div>
          <div class="value" style="font-size:1.1rem;font-weight:600;">${escapeHtml(wa.phone)}</div>
        </div>
        <div>
          <div class="label" style="font-size:12px;color:var(--text-muted);">Status</div>
          <div class="value">${escapeHtml(wa.icon)} ${escapeHtml(wa.statusText)}</div>
        </div>
      </div>
    </div>`;
}

function renderLogRow(log) {
  const level = log.level || 'info';
  const levelClass = level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'grey';
  return `
    <div class="portal-integration-log-row">
      <span class="ops-tag ${levelClass}">${escapeHtml(level)}</span>
      <span class="muted">${escapeHtml(log.timestamp || '').replace('T', ' ').slice(0, 19)}</span>
      <span>${escapeHtml(log.message || '')}</span>
    </div>`;
}

async function openSarahForConnect() {
  const { openPortalSarah } = await import('../sarah/sarah-ui.js');
  openPortalSarah();
}

export async function renderIntegrations(container) {
  const companyId = state.companyId || state.company?.id;
  if (!companyId) {
    container.innerHTML =
      pageHeader('Integrations', 'Connect channels and third-party tools.') +
      '<p class="muted">Sign in to manage integrations for your company.</p>';
    return;
  }

  container.innerHTML = loadingState('Loading integrations...');

  const [channelsRes, logsRes] = await Promise.all([
    fetchIntegrationChannels(companyId),
    fetchIntegrationLogs(companyId, { limit: 12, channel: 'whatsapp' }),
  ]);

  if (channelsRes.error) {
    container.innerHTML = `
      ${pageHeader('Integrations', 'Connect channels and third-party tools to your Business OS.')}
      ${errorState(channelsRes.error)}
      <div style="text-align:center;margin-top:12px;">${RETRY_BTN}</div>`;
    return;
  }

  const integrations = channelsRes.data?.integrations || [];
  const channels = (channelsRes.data?.channels || []).filter(
    (ch) => ch.type === 'messaging' || ch.type === 'connector'
  );
  const logs = logsRes.data?.items || [];
  const hasLiveWhatsApp = integrations.some((i) =>
    ['active', 'connected'].includes(String(i.status || '').toLowerCase())
  );

  container.innerHTML = `
    ${pageHeader('Integrations', 'Connect channels and third-party tools to your Business OS.')}
    ${
      hasLiveWhatsApp
        ? `<p class="portal-integrations-note">Inbound messages route to Sarah and appear in Inbox. Channel changes are managed by your ZiricAI operator.</p>
    ${renderConnectedSummary(integrations)}`
        : ''
    }
    ${renderQuickActions([
      { label: 'Connect WhatsApp', icon: 'fa-brands fa-whatsapp', action: 'connect-whatsapp', color: 'green' },
      { label: 'Ask Sarah to Connect', icon: 'fa-sparkles', action: 'sarah-connect', color: 'purple' },
    ])}
    <div class="bos-integrations-grid">
      ${
        channels.length
          ? channels.map(renderChannelCard).join('')
          : renderEmptyState({
              message: 'No integration channels configured yet.',
              actionHtml:
                '<button class="btn btn-primary btn-sm" type="button" data-action="connect-whatsapp">Connect WhatsApp</button>',
            })
      }
    </div>
    <div class="card portal-integrations-logs" style="margin-top:24px;">
      <div class="card-header">
        <h3><i class="fa-solid fa-list"></i> Recent WhatsApp activity</h3>
        <span class="ops-tag">${logs.length} event${logs.length === 1 ? '' : 's'}</span>
      </div>
      <div class="card-body">
        ${
          logs.length
            ? logs.map(renderLogRow).join('')
            : '<div class="empty-panel" style="padding:16px;">No recent integration logs for this workspace yet.</div>'
        }
      </div>
    </div>
  `;

  container.querySelectorAll('[data-action="connect-whatsapp"]').forEach((btn) => {
    btn.addEventListener('click', () => openSarahForConnect());
  });
  container.querySelectorAll('[data-action="sarah-connect"]').forEach((btn) => {
    btn.addEventListener('click', () => openSarahForConnect());
  });

  container.querySelectorAll('[data-channel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.channel;
      const label = btn.dataset.label || ch;
      const included = btn.dataset.included === '1' || isIncludedChannel(ch);

      if (!included) {
        if (btn.dataset.connected === '1') {
          navigateTo('settings');
          return;
        }
        openIntegrationUpgrade(label);
        return;
      }

      if (ch === 'whatsapp') {
        if (hasLiveWhatsApp) {
          navigateTo('conversations');
          return;
        }
        openSarahForConnect();
        return;
      }

      navigateTo('settings');
    });
  });
}
