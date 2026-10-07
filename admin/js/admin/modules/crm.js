/**
 * Mission Control CRM — tenant-scoped read model (authoritative tenant CRM APIs).
 */
import { state } from '../state.js';
import { pageHeader, emptyState, escapeHtml } from '../ui.js';
import { navigateTo } from '../router.js';
import { formatScopeOptionLabel } from '../services/scopeDisplay.js';
import { renderCustomers } from './customers.js';
import { renderConversations } from './conversations.js';

let activeTab = 'customers';

export async function renderCrm(container) {
  const companyId = state.selectedCompanyId || null;
  const company = companyId ? state.companies.find((c) => c.id === companyId) : null;

  const tabs = `
    <div class="mc-tabs segmented-control" role="tablist">
      <button type="button" class="segment ${activeTab === 'customers' ? 'active' : ''}" data-crm-tab="customers">Customers</button>
      <button type="button" class="segment ${activeTab === 'conversations' ? 'active' : ''}" data-crm-tab="conversations">Conversations</button>
      <button type="button" class="segment ${activeTab === 'leads' ? 'active' : ''}" data-crm-tab="leads">Leads</button>
      <button type="button" class="segment ${activeTab === 'appointments' ? 'active' : ''}" data-crm-tab="appointments">Appointments</button>
    </div>`;

  if (!companyId) {
    container.innerHTML = `
      ${pageHeader(
        'CRM',
        'Platform-wide operator view — select a tenant to read that company’s authoritative CRM (no second CRM store).',
        ''
      )}
      ${tabs}
      ${emptyState(
        'Select a tenant in the scope dropdown to load customers, conversations, and activities from the tenant CRM.',
        '<button class="btn btn-primary" type="button" id="crmFocusScope">Choose tenant scope</button>'
      )}
    `;
    container.querySelector('#crmFocusScope')?.addEventListener('click', () => {
      document.getElementById('companySelector')?.focus();
    });
    bindCrmTabs(container);
    return;
  }

  const scopeLabel = company ? formatScopeOptionLabel(company) : companyId;
  const header = `
    ${pageHeader(
      'CRM',
      `Read-only tenant CRM for <strong>${escapeHtml(scopeLabel)}</strong>. Data is loaded from the same services as the Client Portal.`,
      `<button class="btn btn-secondary btn-sm" type="button" id="crmOpenTenants">Tenants directory</button>`
    )}
    ${tabs}
    <p class="panel-hint">AI Employee activity and vehicle fields appear on customer profiles when present in tenant records.</p>
  `;

  const body = document.createElement('div');
  body.className = 'mc-crm-body';
  container.innerHTML = header;
  container.appendChild(body);

  container.querySelector('#crmOpenTenants')?.addEventListener('click', () => navigateTo('companies'));

  bindCrmTabs(container);

  if (activeTab === 'customers') {
    await renderCustomers(body);
    return;
  }
  if (activeTab === 'conversations') {
    await renderConversations(body);
    return;
  }

  body.innerHTML = emptyState(
    activeTab === 'leads'
      ? 'Lead pipeline for this tenant is exposed via CRM customer profiles and Portal hub metrics today.'
      : 'Appointments are read from the tenant appointment services — wire a dedicated MC appointments panel in a follow-up gate.',
    '<button class="btn btn-secondary btn-sm" type="button" id="crmHubPilot">Open dashboard</button>'
  );
  body.querySelector('#crmHubPilot')?.addEventListener('click', () => navigateTo('dashboard'));
}

function bindCrmTabs(container) {
  container.querySelectorAll('[data-crm-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.crmTab || 'customers';
      renderCrm(container);
    });
  });
}
