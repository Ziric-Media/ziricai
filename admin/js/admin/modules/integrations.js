import { escapeHtml, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchPlatformIntegrations } from '../services/platformConsole.js';
import { navigateTo } from '../router.js';

let whatsappFilter = 'connected';

export async function renderIntegrations(container) {
  container.innerHTML = loadingState('Loading platform integrations…');
  const { data, error } = await fetchPlatformIntegrations();
  if (!data) {
    container.innerHTML = pageHeader('Integrations', 'Platform operations view.') + emptyState(error || 'Failed to load integrations.');
    return;
  }

  const platforms = data.platforms || [];
  const wa = data.whatsappTenants || {};

  container.innerHTML = `
    ${pageHeader('Integrations', 'Connected tenants, errors, and platform adapter health.', '<span class="ops-tag">Read-only</span>')}
    <div class="table-container">
      <table class="org-table">
        <thead><tr><th>Platform</th><th>Connected</th><th>Pending</th><th>Errors</th><th>Status</th></tr></thead>
        <tbody>
          ${platforms
            .map(
              (p) => `<tr>
              <td><strong>${escapeHtml(p.label)}</strong>${p.note ? `<div class="panel-hint">${escapeHtml(p.note)}</div>` : ''}</td>
              <td>${p.connectedTenants ?? '—'}</td>
              <td>${p.pendingTenants ?? '—'}</td>
              <td>${p.errorTenants ?? '—'}</td>
              <td>${escapeHtml(p.status || '—')}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="panel-card" style="margin-top:1rem">
      <div class="panel-header panel-header--split">
        <h3><i class="fa-brands fa-whatsapp"></i> WhatsApp tenants</h3>
        <div class="mc-tabs segmented-control panel-header-tabs">
          ${['connected', 'pending', 'error', 'not_connected'].map(
            (key) =>
              `<button type="button" class="segment ${whatsappFilter === key ? 'active' : ''}" data-wa-filter="${key}">${escapeHtml(key.replace('_', ' '))} (${(wa[key] || []).length})</button>`
          ).join('')}
        </div>
      </div>
      <div class="mc-tenant-chip-list" id="waTenantList">
        ${renderWaList(wa[whatsappFilter] || [])}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-wa-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      whatsappFilter = btn.dataset.waFilter || 'connected';
      renderIntegrations(container);
    });
  });

  container.querySelectorAll('[data-scope-company]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.scopeCompany;
      const select = document.getElementById('companySelector');
      if (select && id) {
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      navigateTo('companies');
    });
  });
}

function renderWaList(items) {
  if (!items.length) return emptyState('No tenants in this bucket.');
  return items
    .map(
      (t) =>
        `<button type="button" class="mc-tenant-chip" data-scope-company="${escapeHtml(t.companyId)}">${escapeHtml(t.name)} <span class="panel-hint">${escapeHtml(t.companyId)}</span></button>`
    )
    .join('');
}
