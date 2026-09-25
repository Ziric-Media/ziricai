import { state, setState } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  errorState,
  planBadge,
  statusBadge,
  tenantClassBadge,
  showToast,
} from '../ui.js';
import {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  suspendCompany,
  activateCompany,
} from '../services/companies.js';
import {
  provisionCompanyWorkspace,
  provisionOperatorTenant,
  fetchPlatformWhatsAppIntegration,
  registerPlatformWhatsAppIntegration,
  configurePlatformWhatsAppIntegration,
  activatePlatformWhatsAppIntegration,
  deactivatePlatformWhatsAppIntegration,
  fetchWhatsAppPoolNumbers,
  assignWhatsAppPoolNumber,
  releaseWhatsAppPoolNumber,
} from '../api.js';
import { navigateTo } from '../router.js';
import { withTimeout } from '../utils.js';
import { DEMO_COMPANIES, DEMO_AGENTS, DEMO_KNOWLEDGE, PLAN_AMOUNTS } from '../demo-data.js';
import { isDemoDataAllowed, resolveListItems } from '../services/dataMode.js';
import { formatPrice } from '../../shared/billingPlans.js';
import {
  whatsappIntegrationTableLabel,
  whatsappIntegrationTableIconClass,
  credentialsSourceLabel,
  humanizeMissingRequirement,
  integrationCardState,
  isActiveIntegrationStatus,
} from '../services/whatsappIntegrationDisplay.js';
import {
  classifyTenant,
  summarizeByClassification,
  tenantClassFilterOptions,
  TENANT_CLASS,
} from '../../shared/tenantClassification.js';

let filters = { search: '', plan: '', status: '', tenantClass: '' };
let waModalCompanyId = null;
let waSelectedPoolNumberId = null;
let deleteTargetId = null;
let listLoadState = 'ok';
let listSource = 'api';
let listError = null;

export async function renderCompanies(container) {
  container.innerHTML = loadingState('Loading tenants...');
  const result = await withTimeout(listCompanies());

  listLoadState = result.loadState || (result.isDemo ? 'demo' : result.items?.length ? 'ok' : 'empty');
  listSource = result.source || (result.isDemo ? 'demo' : 'api');
  listError = result.error || null;

  if (listLoadState === 'error') {
    container.innerHTML = `
      ${pageHeader(
        'Tenants',
        'Tenant records — not production customer count.',
        '<span class="crm-source-badge">Live API</span>'
      )}
      ${errorState('Unable to load tenants. Please check your connection and try again.')}
      <div style="text-align:center;margin-top:-24px;padding-bottom:32px;">
        <button class="btn btn-primary" type="button" id="retryCompanies">
          <i class="fa-solid fa-rotate-right"></i> Retry
        </button>
      </div>
    `;
    container.querySelector('#retryCompanies')?.addEventListener('click', () => renderCompanies(container));
    return;
  }

  const items = isDemoDataAllowed()
    ? resolveListItems(result, DEMO_COMPANIES)
    : (result.items || []);
  setState({ companies: items });

  const sourceBadge = listSource === 'demo'
    ? '<span class="crm-source-badge demo">Demo fallback</span>'
    : '<span class="crm-source-badge">Live API</span>';

  container.innerHTML = buildListMarkup(items, result.isDemo, sourceBadge, listLoadState);
  bindListEvents(container);
}

function buildTenantSummaryStrip(companies) {
  const summary = summarizeByClassification(companies);
  const cells = [
    { label: 'Production', value: summary[TENANT_CLASS.PRODUCTION_CUSTOMER], key: 'production' },
    { label: 'Pilot', value: summary[TENANT_CLASS.PILOT], key: 'pilot' },
    { label: 'Acceptance', value: summary[TENANT_CLASS.ACCEPTANCE], key: 'acceptance' },
    { label: 'Demo', value: summary[TENANT_CLASS.DEMO_SHOWCASE], key: 'demo' },
    { label: 'Test', value: summary[TENANT_CLASS.TEST], key: 'test' },
    { label: 'Unknown', value: summary[TENANT_CLASS.UNKNOWN], key: 'unknown' },
  ];
  return `
    <div class="tenant-summary-grid" aria-label="Tenant classification summary">
      <div class="tenant-summary-total">
        <span class="tenant-summary-total-value">${companies.length}</span>
        <span class="tenant-summary-total-label">Tenant records</span>
      </div>
      ${cells
        .map(
          (c) => `
        <div class="tenant-summary-cell ${c.key}">
          <span class="tenant-summary-value">${c.value}</span>
          <span class="tenant-summary-label">${c.label}</span>
        </div>`
        )
        .join('')}
    </div>`;
}

function buildClassFilterMarkup() {
  const options = tenantClassFilterOptions();
  return `
    <div class="tenant-class-filter segmented-control" role="group" aria-label="Filter by tenant class">
      ${options
        .map(
          (opt) => `
        <button type="button" class="segment tenant-class-filter-btn ${filters.tenantClass === opt.value ? 'active' : ''}"
          data-tenant-class="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>`
        )
        .join('')}
    </div>`;
}

function buildListMarkup(companies, isDemo, sourceBadge = '', loadState = 'ok') {
  const filtered = applyFilters(companies);
  const emptyMessage = loadState === 'empty'
    ? 'No tenants yet. Add your first tenant workspace to get started.'
    : 'No tenants match your filters.';
  const hasFilters = Boolean(filters.search || filters.plan || filters.status || filters.tenantClass);
  return `
    ${pageHeader(
      'Tenants',
      'Tenant records — not production customer count.',
      `<button class="btn btn-primary btn-sm" type="button" id="openCompanyForm">
        <i class="fa-solid fa-plus"></i> Add Company
      </button>${sourceBadge ? ` ${sourceBadge}` : ''}`
    )}
    ${isDemo ? `<div class="demo-banner"><i class="fa-solid fa-flask"></i> Showing demo data — Firestore unavailable or empty. Changes persist locally.</div>` : ''}

    ${buildTenantSummaryStrip(companies)}
    ${buildClassFilterMarkup()}

    <div class="companies-toolbar table-toolbar">
      <div class="search-wrapper">
        <span class="search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="text" placeholder="Search by name, industry, or owner..." id="companySearch" value="${escapeHtml(filters.search)}" />
      </div>
      <div class="filter-group">
        <select id="companyPlanFilter" aria-label="Filter by plan">
          <option value="">All Plans</option>
          <option value="starter" ${filters.plan === 'starter' ? 'selected' : ''}>Starter</option>
          <option value="professional" ${filters.plan === 'professional' ? 'selected' : ''}>Professional</option>
          <option value="business" ${filters.plan === 'business' ? 'selected' : ''}>Business</option>
          <option value="enterprise" ${filters.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
        </select>
        <select id="companyStatusFilter" aria-label="Filter by status">
          <option value="">All Statuses</option>
          <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="trial" ${filters.status === 'trial' ? 'selected' : ''}>Trial</option>
          <option value="suspended" ${filters.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        </select>
      </div>
    </div>

    <div id="companiesContent">
      ${filtered.length
        ? renderTable(filtered)
        : emptyState(emptyMessage, hasFilters
          ? '<button class="btn btn-primary btn-sm" type="button" id="clearCompanyFilters">Clear filters</button>'
          : '<button class="btn btn-primary btn-sm" type="button" id="openCompanyFormEmpty"><i class="fa-solid fa-plus"></i> Add Company</button>')}
    </div>

    ${buildFormSlideOver()}
    ${buildDeleteModal()}
    ${buildWhatsAppModals()}
  `;
}

function applyFilters(companies) {
  const term = filters.search.toLowerCase();
  return companies.filter((c) => {
    const matchesSearch = !term || [
      c.name, c.industry, c.owner, c.ownerEmail, c.email, c.id,
    ].some((v) => String(v || '').toLowerCase().includes(term));
    const matchesPlan = !filters.plan || c.plan === filters.plan;
    const matchesStatus = !filters.status || c.status === filters.status;
    const { classification } = classifyTenant(c);
    const matchesClass = !filters.tenantClass || classification === filters.tenantClass;
    return matchesSearch && matchesPlan && matchesStatus && matchesClass;
  });
}

function companyInitials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function logoCell(company) {
  if (company.logoUrl) {
    return `<img src="${escapeHtml(company.logoUrl)}" alt="" class="company-logo-img table-logo" />`;
  }
  return `<span class="logo-fallback table-logo-fallback">${escapeHtml(companyInitials(company.name))}</span>`;
}

/** Lifecycle-aware WhatsApp column from company.whatsappIntegration (B-MC-5c-2c). */
function whatsappCell(company) {
  const label = whatsappIntegrationTableLabel(company);
  const iconClass = whatsappIntegrationTableIconClass(company);
  const phone = company?.whatsappIntegration?.phoneNumberId;
  const phoneHint = phone ? `<span class="wa-phone-hint">${escapeHtml(phone)}</span>` : '';
  return `<span class="wa-cell ${iconClass}"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(label)}${phoneHint}</span>`;
}

function actionMenu(company) {
  const isSuspended = company.status === 'suspended';
  return `
    <div class="action-menu" data-stop-propagation="true">
      <button class="btn btn-icon action-menu-trigger" type="button" data-id="${escapeHtml(company.id)}" aria-label="Actions for ${escapeHtml(company.name)}" aria-haspopup="true">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <div class="action-menu-dropdown" role="menu">
        <button class="action-menu-item edit-company" type="button" data-id="${escapeHtml(company.id)}" role="menuitem">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        ${isSuspended
          ? `<button class="action-menu-item activate-company" type="button" data-id="${escapeHtml(company.id)}" role="menuitem">
              <i class="fa-solid fa-circle-check"></i> Activate
            </button>`
          : `<button class="action-menu-item suspend-company" type="button" data-id="${escapeHtml(company.id)}" role="menuitem">
              <i class="fa-solid fa-ban"></i> Suspend
            </button>`}
        <button class="action-menu-item danger delete-company" type="button" data-id="${escapeHtml(company.id)}" role="menuitem">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `;
}

function renderTable(companies) {
  return `
    <div class="table-container companies-table-wrap">
      <table class="org-table companies-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Industry</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Owner</th>
            <th>WhatsApp</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody id="companyTableBody">
          ${companies.map(renderRow).join('')}
        </tbody>
      </table>
      <div class="table-footer">
        <div class="info">${companies.length} tenant record${companies.length === 1 ? '' : 's'} shown</div>
      </div>
    </div>
  `;
}

function renderRow(company) {
  const links = company.provisioningLinks || {};
  const portalUrl = links.portalUrl || `/company-portal.html?company=${encodeURIComponent(company.id)}`;
  const classInfo = classifyTenant(company);
  const classTitle = `${classInfo.classificationSource} · ${classInfo.classificationConfidence} — ${classInfo.evidence.slice(0, 2).join('; ')}`;
  return `
    <tr data-id="${escapeHtml(company.id)}" class="company-row">
      <td>
        <div class="org-name">
          <div class="avatar company-table-avatar">${logoCell(company)}</div>
          <div>
            <div class="company-name-text">${tenantClassBadge(classInfo.classification, classTitle)} ${escapeHtml(company.name)}</div>
            <div class="company-cross-links">
              <a href="${escapeHtml(portalUrl)}" target="_blank" rel="noopener" class="cross-link" title="Open Company Portal"><i class="fa-solid fa-arrow-up-right-from-square"></i> Portal</a>
              <button type="button" class="cross-link-btn nav-agents" data-company-id="${escapeHtml(company.id)}" title="View AI Employees"><i class="fa-solid fa-robot"></i> Agents</button>
              <button type="button" class="cross-link-btn nav-knowledge" data-company-id="${escapeHtml(company.id)}" data-kb-id="${escapeHtml(company.knowledgeBaseId || links.knowledgeBaseId || '')}" title="View Knowledge"><i class="fa-solid fa-book"></i> Knowledge</button>
              <button type="button" class="cross-link-btn nav-customers" data-company-id="${escapeHtml(company.id)}" title="View CRM"><i class="fa-solid fa-users"></i> CRM</button>
            </div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(company.industry || '—')}</td>
      <td>${planBadge(company.plan)}</td>
      <td>${statusBadge(company.status)}</td>
      <td>${escapeHtml(company.owner || '—')}</td>
      <td>${whatsappCell(company)}</td>
      <td class="col-actions">${actionMenu(company)}</td>
    </tr>
  `;
}

function buildFormSlideOver() {
  return `
    <div class="slide-over slide-over-form" id="companyFormPanel">
      <div class="slide-header">
        <div class="title-group">
          <h2 id="companyFormTitle">Add Company</h2>
          <div class="sub">Configure tenant business, subscription, AI, and WhatsApp settings.</div>
        </div>
        <button class="close-btn" type="button" id="closeCompanyForm" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="slide-body company-form-body">
        <input type="hidden" id="companyEditId" />

        <div class="form-section">
          <h4><i class="fa-solid fa-building"></i> Business Information</h4>
          <div class="form-group"><label for="companyName">Company Name *</label><input type="text" id="companyName" placeholder="e.g. Central Motors" /></div>
          <div class="form-row">
            <div class="form-group"><label for="companyIndustry">Industry</label><input type="text" id="companyIndustry" placeholder="e.g. Automotive" /></div>
            <div class="form-group"><label for="companyWebsite">Website</label><input type="url" id="companyWebsite" placeholder="https://" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="companyEmail">Business Email</label><input type="email" id="companyEmail" placeholder="info@company.co.za" /></div>
            <div class="form-group"><label for="companyPhone">Business Phone</label><input type="tel" id="companyPhone" placeholder="+27 11 555 0100" /></div>
          </div>
          <div class="form-group"><label for="companyLogoUrl">Logo URL</label><input type="url" id="companyLogoUrl" placeholder="https://..." /></div>
        </div>

        <div class="form-section">
          <h4><i class="fa-solid fa-user-tie"></i> Owner Information</h4>
          <p class="form-hint" style="margin-top:0;">Required for new companies — creates a real Firebase Auth login (no synthetic UID) and binds the owner to this tenant.</p>
          <div class="form-group"><label for="companyOwner">Owner Name *</label><input type="text" id="companyOwner" placeholder="e.g. John Smith" /></div>
          <div class="form-row">
            <div class="form-group"><label for="companyOwnerEmail">Owner Email *</label><input type="email" id="companyOwnerEmail" placeholder="owner@company.co.za" required /></div>
            <div class="form-group"><label for="companyOwnerPhone">Owner Phone</label><input type="tel" id="companyOwnerPhone" placeholder="+27 82 555 0101" /></div>
          </div>
          <div class="form-group"><label for="companyTenantClass">Tenant classification</label>
            <select id="companyTenantClass">
              <option value="PRODUCTION CUSTOMER" selected>Production customer</option>
              <option value="PILOT">Pilot</option>
              <option value="ACCEPTANCE">Acceptance</option>
              <option value="DEMO/SHOWCASE">Demo / Showcase</option>
              <option value="TEST">Test</option>
            </select>
          </div>
        </div>

        <div class="form-section">
          <h4><i class="fa-solid fa-credit-card"></i> Subscription</h4>
          <div class="form-row">
            <div class="form-group"><label for="companyPlan">Plan</label>
              <select id="companyPlan">
                <option value="starter">Starter — ${formatPrice(PLAN_AMOUNTS.starter)}/mo</option>
                <option value="professional">Professional — ${formatPrice(PLAN_AMOUNTS.professional)}/mo</option>
                <option value="business" selected>Business — ${formatPrice(PLAN_AMOUNTS.business)}/mo</option>
                <option value="enterprise">Enterprise — Custom</option>
              </select>
            </div>
            <div class="form-group"><label for="companyStatus">Status</label>
              <select id="companyStatus">
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="companyPlanAmount">Plan Amount (ZAR)</label><input type="number" id="companyPlanAmount" min="0" step="1" /></div>
            <div class="form-group"><label for="companyBillingStatus">Billing Status</label>
              <select id="companyBillingStatus">
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h4><i class="fa-solid fa-robot"></i> AI Configuration</h4>
          <div class="form-row">
            <div class="form-group"><label for="companyAgent">AI Agent</label>
              <select id="companyAgent">
                <option value="">— None —</option>
                ${DEMO_AGENTS.map((a) => `<option value="${escapeHtml(a.id)}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label for="companyAiModel">Model</label>
              <select id="companyAiModel">
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="companyAiTemperature">Temperature</label><input type="number" id="companyAiTemperature" min="0" max="2" step="0.1" value="0.7" /></div>
            <div class="form-group">
              <label for="companyOpenAiKey">OpenAI API Key <span class="label-hint">Stored securely</span></label>
              <div class="input-with-action">
                <input type="password" id="companyOpenAiKey" placeholder="sk-..." autocomplete="off" />
                <button type="button" class="btn btn-secondary btn-sm" id="toggleApiKeyVisibility"><i class="fa-solid fa-eye"></i></button>
              </div>
            </div>
          </div>
        </div>

        <div class="form-section" id="whatsappIntegrationSection">
          <h4><i class="fa-brands fa-whatsapp"></i> WhatsApp Integration</h4>
          <div id="whatsappIntegrationCard" class="whatsapp-integration-card">
            <p class="text-muted integration-card-hint">Save the company first to manage WhatsApp integration.</p>
          </div>
        </div>

        <div class="form-section">
          <h4><i class="fa-solid fa-book"></i> Knowledge Base Settings</h4>
          <div class="form-group"><label for="companyKnowledgeBase">Knowledge Base</label>
            <select id="companyKnowledgeBase">
              <option value="">— None —</option>
              ${DEMO_KNOWLEDGE.map((kb) => `<option value="${escapeHtml(kb.id)}" data-name="${escapeHtml(kb.title)}">${escapeHtml(kb.title)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="companyKnowledgeMaxDocs">Max Documents</label><input type="number" id="companyKnowledgeMaxDocs" min="1" max="10000" value="500" /></div>
            <div class="form-group form-check" style="align-self:end;padding-bottom:10px;">
              <label class="checkbox-label">
                <input type="checkbox" id="companyKnowledgeAutoSync" checked />
                <span>Auto-sync knowledge base</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <button class="btn btn-secondary" type="button" id="cancelCompanyForm">Cancel</button>
        <button class="btn btn-primary" type="button" id="saveCompanyBtn"><i class="fa-solid fa-check"></i> Save Company</button>
      </div>
    </div>
  `;
}

function buildWhatsAppModals() {
  return `
    <div class="wizard-overlay" id="waRegisterModal">
      <div class="wizard-modal" style="max-width:520px;">
        <div class="wizard-header">
          <div><h2>Register WhatsApp integration</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" data-wa-close="waRegisterModal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wizard-body">
          <p class="form-hint">Optional metadata — you can configure details after registration.</p>
          <div class="form-group">
            <label for="waRegisterCredentialsSource">Credentials source</label>
            <select id="waRegisterCredentialsSource">
              <option value="env" selected>Environment (server-managed)</option>
              <option value="tenant">Tenant-managed</option>
            </select>
            <p class="form-hint" id="waRegisterCredentialsHint">WhatsApp credentials are managed on the server environment. This form does not store tokens.</p>
          </div>
          <div class="form-group"><label for="waRegisterPhoneNumberId">Phone number ID</label><input type="text" id="waRegisterPhoneNumberId" placeholder="Meta phone_number_id (digits)" /></div>
          <div class="form-group"><label for="waRegisterDisplayPhone">Display phone number</label><input type="tel" id="waRegisterDisplayPhone" placeholder="+27 71 000 1234" /></div>
          <div class="form-group"><label for="waRegisterBusinessAccountId">Business account ID</label><input type="text" id="waRegisterBusinessAccountId" placeholder="Optional WABA ID" /></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" data-wa-close="waRegisterModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="waRegisterSubmit"><i class="fa-solid fa-plus"></i> Register</button>
        </div>
      </div>
    </div>
    <div class="wizard-overlay" id="waConfigureModal">
      <div class="wizard-modal" style="max-width:520px;">
        <div class="wizard-header">
          <div><h2>Configure integration</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" data-wa-close="waConfigureModal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wizard-body">
          <div class="form-group">
            <label for="waConfigureCredentialsSource">Credentials source</label>
            <select id="waConfigureCredentialsSource">
              <option value="env">Environment (server-managed)</option>
              <option value="tenant">Tenant-managed</option>
            </select>
            <p class="form-hint" id="waConfigureCredentialsHint">WhatsApp credentials are managed on the server environment. This form does not store tokens.</p>
          </div>
          <div class="form-group"><label for="waConfigurePhoneNumberId">Phone number ID</label><input type="text" id="waConfigurePhoneNumberId" placeholder="Meta phone_number_id (digits)" /></div>
          <div class="form-group"><label for="waConfigureDisplayPhone">Display phone number</label><input type="tel" id="waConfigureDisplayPhone" placeholder="+27 71 000 1234" /></div>
          <div class="form-group"><label for="waConfigureBusinessAccountId">Business account ID</label><input type="text" id="waConfigureBusinessAccountId" placeholder="Optional WABA ID" /></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" data-wa-close="waConfigureModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="waConfigureSubmit"><i class="fa-solid fa-sliders"></i> Save configuration</button>
        </div>
      </div>
    </div>
    <div class="wizard-overlay" id="waActivateModal">
      <div class="wizard-modal" style="max-width:520px;">
        <div class="wizard-header">
          <div><h2>Activate WhatsApp integration?</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" data-wa-close="waActivateModal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wizard-body">
          <p style="color:var(--text-secondary);line-height:1.6;">
            This marks the integration as <strong>active</strong> in Mission Control and enables active integration routing for this phone number ID.
            It does <strong>not</strong> configure Meta or store access tokens.
          </p>
          <div class="form-group form-check" id="waActivateAckRow" style="display:none;">
            <label class="checkbox-label">
              <input type="checkbox" id="waActivateAck" />
              <span>I acknowledge the configured phone number ID may differ from the server environment phone number ID.</span>
            </label>
          </div>
          <div id="waActivateResult" class="wa-activate-result" hidden></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" data-wa-close="waActivateModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="waActivateSubmit"><i class="fa-solid fa-play"></i> Activate integration</button>
        </div>
      </div>
    </div>
    <div class="wizard-overlay" id="waDeactivateModal">
      <div class="wizard-modal" style="max-width:520px;">
        <div class="wizard-header">
          <div><h2>Deactivate WhatsApp integration?</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" data-wa-close="waDeactivateModal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wizard-body">
          <p style="color:var(--text-secondary);line-height:1.6;">
            This will stop the integration from being treated as <strong>active</strong>.
            Your configuration will be retained and can be activated again later.
          </p>
          <div class="form-group">
            <label for="waDeactivateReason">Reason (optional)</label>
            <input type="text" id="waDeactivateReason" placeholder="Optional note for audit log" />
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" data-wa-close="waDeactivateModal">Cancel</button>
          <button class="btn btn-warning" type="button" id="waDeactivateSubmit"><i class="fa-solid fa-pause"></i> Deactivate integration</button>
        </div>
      </div>
    </div>
    <div class="wizard-overlay" id="waAssignPoolModal">
      <div class="wizard-modal" style="max-width:560px;">
        <div class="wizard-header">
          <div><h2>Assign ZiricAI test number</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" data-wa-close="waAssignPoolModal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wizard-body">
          <p class="form-hint" style="margin-top:0;">
            Selects a Meta phone identity from the Ziric WhatsApp number pool and links it to this tenant.
            ZiricAI does not create phone numbers in Meta — it registers a supplied test number onto the company.
          </p>
          <div id="waPoolNumberList" class="wa-pool-number-list">
            <p class="text-muted">Loading available numbers…</p>
          </div>
          <div class="form-group form-check" style="margin-top:12px;">
            <label class="checkbox-label">
              <input type="checkbox" id="waAssignActivate" checked />
              <span>Activate after assign (Sarah receives WhatsApp for this tenant)</span>
            </label>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" data-wa-close="waAssignPoolModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="waAssignPoolSubmit" disabled><i class="fa-solid fa-link"></i> Assign &amp; connect</button>
        </div>
      </div>
    </div>
  `;
}

function renderWhatsAppIntegrationCardContent(payload) {
  const { loadState, integration, runtimeReady, missing, error } = payload;

  if (loadState === 'loading') {
    return `<div class="integration-card-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading integration…</div>`;
  }
  if (loadState === 'error') {
    return `
      ${errorState(error || 'Unable to load integration')}
      <div style="text-align:center;margin-top:12px;">
        <button class="btn btn-secondary btn-sm" type="button" id="waIntegrationRetry"><i class="fa-solid fa-rotate-right"></i> Retry</button>
      </div>`;
  }
  if (loadState === 'not_registered') {
    return `
      <div class="integration-card-status wa-none">
        <span class="integration-status-label">Not registered</span>
      </div>
      <p class="form-hint">No WhatsApp integration document exists for this company.</p>
      <button class="btn btn-primary btn-sm" type="button" id="waOpenRegister"><i class="fa-solid fa-plus"></i> Register WhatsApp integration</button>`;
  }

  const state = integrationCardState(integration, runtimeReady, missing);
  const status = integration?.status || '—';
  const hasPhone = Boolean(integration?.phoneNumberId);
  const readyForSetup = state === 'pending' && !hasPhone;
  const statusLabel = readyForSetup
    ? 'Ready for Setup'
    : String(status).replace(/_/g, ' ');
  const runtimeBlock = isActiveIntegrationStatus(status)
    ? (runtimeReady
      ? '<div class="integration-runtime ready"><i class="fa-solid fa-circle-check"></i> Runtime ready</div>'
      : `<div class="integration-runtime warn"><i class="fa-solid fa-triangle-exclamation"></i> Runtime not fully ready</div>
         ${missing?.length ? `<ul class="integration-missing">${missing.map((k) => `<li>${escapeHtml(humanizeMissingRequirement(k))}</li>`).join('')}</ul>` : ''}`)
    : '';

  let actions = '';
  if (readyForSetup || ((state === 'pending' || state === 'disconnected') && !hasPhone)) {
    actions = `
      <div class="integration-card-actions">
        <button class="btn btn-primary btn-sm" type="button" id="waOpenAssignPool"><i class="fa-brands fa-whatsapp"></i> Use ZiricAI Test Number</button>
        <button class="btn btn-secondary btn-sm" type="button" id="waOpenConfigure"><i class="fa-solid fa-sliders"></i> Configure manually</button>
      </div>
      <p class="form-hint">Assign an AVAILABLE number from the Ziric WhatsApp pool. Numbers are never auto-assigned on company create.</p>`;
  } else if (state === 'pending' || state === 'disconnected') {
    actions = `
      <div class="integration-card-actions">
        <button class="btn btn-primary btn-sm" type="button" id="waOpenActivate" ${hasPhone ? '' : 'disabled title="Phone number ID required"'}><i class="fa-solid fa-play"></i> Activate integration</button>
        <button class="btn btn-secondary btn-sm" type="button" id="waOpenConfigure"><i class="fa-solid fa-sliders"></i> Configure integration</button>
        <button class="btn btn-secondary btn-sm" type="button" id="waOpenAssignPool"><i class="fa-brands fa-whatsapp"></i> Switch pool number</button>
      </div>`;
  } else if (state === 'active_ready' || state === 'active_not_ready') {
    actions = `
      <div class="integration-card-actions">
        <button class="btn btn-warning btn-sm" type="button" id="waOpenDeactivate"><i class="fa-solid fa-pause"></i> Deactivate integration</button>
        <button class="btn btn-secondary btn-sm" type="button" id="waOpenConfigure"><i class="fa-solid fa-sliders"></i> Configure integration</button>
        <button class="btn btn-secondary btn-sm" type="button" id="waReleasePool" title="Release pool number back to AVAILABLE"><i class="fa-solid fa-unlock"></i> Release test number</button>
      </div>`;
  } else {
    actions = `<button class="btn btn-secondary btn-sm" type="button" id="waOpenConfigure"><i class="fa-solid fa-sliders"></i> Configure integration</button>`;
  }

  return `
    <div class="integration-card-status ${escapeHtml(readyForSetup ? 'wa-ready' : state)}">
      <span class="integration-status-label">${escapeHtml(statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1))}</span>
    </div>
    ${runtimeBlock}
    <dl class="integration-details">
      <div><dt>Phone number ID</dt><dd>${escapeHtml(integration?.phoneNumberId || '—')}</dd></div>
      <div><dt>Display phone</dt><dd>${escapeHtml(integration?.displayPhoneNumber || '—')}</dd></div>
      <div><dt>Credentials</dt><dd>${escapeHtml(credentialsSourceLabel(integration?.credentialsSource))}</dd></div>
      <div><dt>Business account ID</dt><dd>${escapeHtml(integration?.businessAccountId || '—')}</dd></div>
    </dl>
    ${actions}`;
}

async function loadWhatsAppIntegrationCard(container, companyId) {
  const card = container.querySelector('#whatsappIntegrationCard');
  if (!card) return;

  if (!companyId) {
    card.innerHTML = '<p class="text-muted integration-card-hint">Save the company first to manage WhatsApp integration.</p>';
    return;
  }

  card.innerHTML = renderWhatsAppIntegrationCardContent({ loadState: 'loading' });
  bindWhatsAppCardActions(container, companyId);

  const res = await fetchPlatformWhatsAppIntegration(companyId);
  if (res.status === 404) {
    card.innerHTML = renderWhatsAppIntegrationCardContent({ loadState: 'not_registered' });
    bindWhatsAppCardActions(container, companyId);
    return;
  }
  if (res.error) {
    card.innerHTML = renderWhatsAppIntegrationCardContent({
      loadState: 'error',
      error: res.error,
    });
    bindWhatsAppCardActions(container, companyId);
    return;
  }

  const data = res.data || {};
  card.innerHTML = renderWhatsAppIntegrationCardContent({
    loadState: 'loaded',
    integration: data.integration,
    runtimeReady: data.runtimeReady,
    missing: data.missing || [],
  });
  bindWhatsAppCardActions(container, companyId, data.integration);
}

function openWaModal(container, modalId) {
  const backdrop = document.getElementById('overlay');
  container.querySelector(`#${modalId}`)?.classList.add('open');
  backdrop?.classList.add('open');
}

function closeWaModal(container, modalId) {
  const backdrop = document.getElementById('overlay');
  container.querySelector(`#${modalId}`)?.classList.remove('open');
  const anyOpen = container.querySelector('.wizard-overlay.open');
  if (!anyOpen && !container.querySelector('#companyFormPanel.open')) {
    backdrop?.classList.remove('open');
  }
}

function bindWhatsAppCardActions(container, companyId, integration = null) {
  waModalCompanyId = companyId;

  container.querySelector('#waIntegrationRetry')?.addEventListener('click', () => {
    loadWhatsAppIntegrationCard(container, companyId);
  });
  container.querySelector('#waOpenRegister')?.addEventListener('click', () => {
    const hint = container.querySelector('#waRegisterCredentialsHint');
    const sel = container.querySelector('#waRegisterCredentialsSource');
    const updateHint = () => {
      if (!hint || !sel) return;
      hint.textContent = sel.value === 'tenant'
        ? 'Per-tenant credentials are not available in this pilot. Runtime will remain not ready until tenant credential support is implemented.'
        : 'WhatsApp credentials are managed on the server environment. This form does not store tokens.';
    };
    sel?.addEventListener('change', updateHint);
    updateHint();
    openWaModal(container, 'waRegisterModal');
  });
  container.querySelector('#waOpenConfigure')?.addEventListener('click', () => {
    const sel = container.querySelector('#waConfigureCredentialsSource');
    const hint = container.querySelector('#waConfigureCredentialsHint');
    if (integration) {
      container.querySelector('#waConfigurePhoneNumberId').value = integration.phoneNumberId?.startsWith('***')
        ? '' : (integration.phoneNumberId || '');
      container.querySelector('#waConfigureDisplayPhone').value = integration.displayPhoneNumber || '';
      container.querySelector('#waConfigureBusinessAccountId').value = integration.businessAccountId || '';
      if (sel) sel.value = integration.credentialsSource || 'env';
    }
    const updateHint = () => {
      if (!hint || !sel) return;
      hint.textContent = sel.value === 'tenant'
        ? 'Per-tenant credentials are not available in this pilot. Runtime will remain not ready until tenant credential support is implemented.'
        : 'WhatsApp credentials are managed on the server environment. This form does not store tokens.';
    };
    sel?.addEventListener('change', updateHint);
    updateHint();
    openWaModal(container, 'waConfigureModal');
  });
  container.querySelector('#waOpenActivate')?.addEventListener('click', () => {
    const ackRow = container.querySelector('#waActivateAckRow');
    const result = container.querySelector('#waActivateResult');
    if (ackRow) ackRow.style.display = 'none';
    if (result) {
      result.hidden = true;
      result.innerHTML = '';
    }
    container.querySelector('#waActivateAck').checked = false;
    openWaModal(container, 'waActivateModal');
  });
  container.querySelector('#waOpenDeactivate')?.addEventListener('click', () => {
    container.querySelector('#waDeactivateReason').value = '';
    openWaModal(container, 'waDeactivateModal');
  });
  container.querySelector('#waOpenAssignPool')?.addEventListener('click', async () => {
    waSelectedPoolNumberId = null;
    const list = container.querySelector('#waPoolNumberList');
    const submit = container.querySelector('#waAssignPoolSubmit');
    if (submit) submit.disabled = true;
    if (list) list.innerHTML = '<p class="text-muted">Loading available numbers…</p>';
    openWaModal(container, 'waAssignPoolModal');
    const res = await fetchWhatsAppPoolNumbers({ status: 'available' });
    if (res.error) {
      if (list) list.innerHTML = errorState(res.error);
      return;
    }
    const items = res.data?.items || [];
    if (!items.length) {
      if (list) {
        list.innerHTML = `
          <p class="form-hint">No AVAILABLE numbers in the pool.</p>
          <p class="form-hint">Add Meta phone number IDs via the platform WhatsApp pool API, or ensure <code>PHONE_NUMBER_ID</code> is set on the server (auto-seeds as AVAILABLE).</p>`;
      }
      return;
    }
    if (list) {
      list.innerHTML = items.map((n) => `
        <label class="wa-pool-option" style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border-color, #e5e7eb);cursor:pointer;">
          <input type="radio" name="waPoolNumber" value="${escapeHtml(n.id)}" style="margin-top:4px;" />
          <span>
            <strong>${escapeHtml(n.label || n.displayPhoneNumber || n.id)}</strong><br/>
            <span class="text-muted">${escapeHtml(n.displayPhoneNumber || '—')} · ID ${escapeHtml(n.phoneNumberId || '—')} · ${escapeHtml(n.kind || 'test')}</span>
          </span>
        </label>`).join('');
      list.querySelectorAll('input[name="waPoolNumber"]').forEach((input) => {
        input.addEventListener('change', () => {
          waSelectedPoolNumberId = input.value;
          if (submit) submit.disabled = !waSelectedPoolNumberId;
        });
      });
    }
  });
  container.querySelector('#waReleasePool')?.addEventListener('click', async () => {
    const poolRes = await fetchWhatsAppPoolNumbers({ status: 'in_use' });
    const items = poolRes.data?.items || [];
    const leased = items.find((n) => n.assignedCompanyId === companyId);
    if (!leased) {
      showToast('No pool number assigned to this company', 'warning');
      return;
    }
    const res = await releaseWhatsAppPoolNumber(leased.id);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast('Test number released back to AVAILABLE', 'success');
    await loadWhatsAppIntegrationCard(container, companyId);
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });
}

function bindWhatsAppModalEvents(container) {
  container.querySelectorAll('[data-wa-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeWaModal(container, btn.dataset.waClose));
  });

  container.querySelector('#waRegisterSubmit')?.addEventListener('click', async () => {
    if (!waModalCompanyId) return;
    const body = {
      credentialsSource: container.querySelector('#waRegisterCredentialsSource')?.value || 'env',
    };
    const phone = container.querySelector('#waRegisterPhoneNumberId')?.value?.trim();
    const display = container.querySelector('#waRegisterDisplayPhone')?.value?.trim();
    const business = container.querySelector('#waRegisterBusinessAccountId')?.value?.trim();
    if (phone) body.phoneNumberId = phone;
    if (display) body.displayPhoneNumber = display;
    if (business) body.businessAccountId = business;

    const res = await registerPlatformWhatsAppIntegration(waModalCompanyId, body);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast('WhatsApp integration registered', 'success');
    closeWaModal(container, 'waRegisterModal');
    await loadWhatsAppIntegrationCard(container, waModalCompanyId);
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });

  container.querySelector('#waConfigureSubmit')?.addEventListener('click', async () => {
    if (!waModalCompanyId) return;
    const body = {
      credentialsSource: container.querySelector('#waConfigureCredentialsSource')?.value || 'env',
    };
    const phone = container.querySelector('#waConfigurePhoneNumberId')?.value?.trim();
    const display = container.querySelector('#waConfigureDisplayPhone')?.value?.trim();
    const business = container.querySelector('#waConfigureBusinessAccountId')?.value?.trim();
    if (phone) body.phoneNumberId = phone;
    if (display) body.displayPhoneNumber = display;
    if (business) body.businessAccountId = business;

    const res = await configurePlatformWhatsAppIntegration(waModalCompanyId, body);
    if (res.error) {
      const msg = res.status === 409
        ? 'Phone number ID is already active for another tenant'
        : res.error;
      showToast(msg, 'error');
      return;
    }
    showToast('Integration configuration saved', 'success');
    closeWaModal(container, 'waConfigureModal');
    await loadWhatsAppIntegrationCard(container, waModalCompanyId);
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });

  container.querySelector('#waActivateSubmit')?.addEventListener('click', async () => {
    if (!waModalCompanyId) return;
    const ack = container.querySelector('#waActivateAck')?.checked === true;
    const res = await activatePlatformWhatsAppIntegration(waModalCompanyId, {
      acknowledgeEnvCredentials: ack,
    });
    if (res.error) {
      if (/acknowledgeEnvCredentials/i.test(res.error)) {
        const ackRow = container.querySelector('#waActivateAckRow');
        if (ackRow) ackRow.style.display = 'block';
      }
      showToast(res.error, 'error');
      return;
    }
    const data = res.data || {};
    const result = container.querySelector('#waActivateResult');
    if (result) {
      const missing = data.missing || [];
      result.hidden = false;
      result.innerHTML = `
        <div class="integration-activate-summary ${data.runtimeReady ? 'ready' : 'warn'}">
          <p><strong>Status:</strong> ${escapeHtml(data.integration?.status || 'active')}</p>
          <p><strong>Runtime:</strong> ${data.runtimeReady ? 'Ready' : 'Not fully ready'}</p>
          ${missing.length ? `<ul>${missing.map((k) => `<li>${escapeHtml(humanizeMissingRequirement(k))}</li>`).join('')}</ul>` : ''}
        </div>`;
    }
    showToast(data.runtimeReady ? 'Integration activated' : 'Integration activated — runtime not fully ready', data.runtimeReady ? 'success' : 'warning');
    closeWaModal(container, 'waActivateModal');
    await loadWhatsAppIntegrationCard(container, waModalCompanyId);
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });

  container.querySelector('#waDeactivateSubmit')?.addEventListener('click', async () => {
    if (!waModalCompanyId) return;
    const reason = container.querySelector('#waDeactivateReason')?.value?.trim();
    const res = await deactivatePlatformWhatsAppIntegration(waModalCompanyId, reason ? { reason } : {});
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast('Integration deactivated', 'success');
    closeWaModal(container, 'waDeactivateModal');
    await loadWhatsAppIntegrationCard(container, waModalCompanyId);
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });

  container.querySelector('#waAssignPoolSubmit')?.addEventListener('click', async () => {
    if (!waModalCompanyId || !waSelectedPoolNumberId) return;
    const activate = container.querySelector('#waAssignActivate')?.checked !== false;
    const res = await assignWhatsAppPoolNumber(waModalCompanyId, {
      numberId: waSelectedPoolNumberId,
      activate,
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    const data = res.data || {};
    showToast(
      `WhatsApp linked (${data.number?.displayPhoneNumber || data.number?.phoneNumberId || 'pool number'}). Sarah is connected for this tenant.`,
      'success'
    );
    closeWaModal(container, 'waAssignPoolModal');
    await loadWhatsAppIntegrationCard(container, waModalCompanyId);
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });
}

function buildDeleteModal() {
  return `
    <div class="wizard-overlay" id="deleteCompanyModal">
      <div class="wizard-modal" style="max-width:480px;">
        <div class="wizard-header">
          <div><h2>Delete Company</h2></div>
          <button class="btn btn-secondary btn-sm" type="button" id="closeDeleteModal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wizard-body">
          <p style="color:var(--text-secondary);line-height:1.6;">
            Are you sure you want to delete <strong id="deleteCompanyName">this company</strong>?
            This will remove all associated configuration. This action cannot be undone.
          </p>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" id="cancelDeleteModal">Cancel</button>
          <button class="btn btn-danger" type="button" id="confirmDeleteCompany"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </div>
    </div>
  `;
}

function bindListEvents(container) {
  const backdrop = document.getElementById('overlay');
  const formPanel = container.querySelector('#companyFormPanel');
  const deleteModal = container.querySelector('#deleteCompanyModal');

  const openForm = () => {
    formPanel?.classList.add('open');
    backdrop?.classList.add('open');
  };
  const closeForm = () => {
    formPanel?.classList.remove('open');
    backdrop?.classList.remove('open');
  };
  const openDeleteModal = () => {
    deleteModal?.classList.add('open');
    backdrop?.classList.add('open');
  };
  const closeDeleteModal = () => {
    deleteModal?.classList.remove('open');
    if (!formPanel?.classList.contains('open')) backdrop?.classList.remove('open');
  };

  container.querySelector('#openCompanyForm')?.addEventListener('click', () => openCompanyForm(container, null, openForm));
  container.querySelector('#openCompanyFormEmpty')?.addEventListener('click', () => openCompanyForm(container, null, openForm));
  container.querySelector('#closeCompanyForm')?.addEventListener('click', closeForm);
  container.querySelector('#cancelCompanyForm')?.addEventListener('click', closeForm);

  container.querySelector('#clearCompanyFilters')?.addEventListener('click', () => {
    clearAllCompanyFilters(container);
  });

  container.querySelectorAll('.tenant-class-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.tenantClass = btn.dataset.tenantClass || '';
      syncTenantClassFilterActive(container);
      refreshContent(container);
    });
  });

  container.querySelector('#companySearch')?.addEventListener('input', (e) => {
    filters.search = e.target.value;
    refreshContent(container);
  });
  container.querySelector('#companyPlanFilter')?.addEventListener('change', (e) => {
    filters.plan = e.target.value;
    refreshContent(container);
  });
  container.querySelector('#companyStatusFilter')?.addEventListener('change', (e) => {
    filters.status = e.target.value;
    refreshContent(container);
  });

  container.querySelector('#toggleApiKeyVisibility')?.addEventListener('click', () => {
    const input = container.querySelector('#companyOpenAiKey');
    const icon = container.querySelector('#toggleApiKeyVisibility i');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    icon?.classList.toggle('fa-eye');
    icon?.classList.toggle('fa-eye-slash');
  });

  container.querySelector('#companyPlan')?.addEventListener('change', (e) => {
    const amountEl = container.querySelector('#companyPlanAmount');
    if (amountEl && !amountEl.dataset.userEdited) {
      amountEl.value = PLAN_AMOUNTS[e.target.value] || '';
    }
  });
  container.querySelector('#companyPlanAmount')?.addEventListener('input', (e) => {
    e.target.dataset.userEdited = '1';
  });

  container.querySelector('#saveCompanyBtn')?.addEventListener('click', () => saveCompany(container, closeForm));

  container.querySelectorAll('.nav-agents').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setState({ selectedCompanyId: btn.dataset.companyId || null });
      navigateTo('agents');
    });
  });
  container.querySelectorAll('.nav-knowledge').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setState({ selectedCompanyId: btn.dataset.companyId || null });
      navigateTo('knowledge');
    });
  });
  container.querySelectorAll('.nav-customers').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setState({ selectedCompanyId: btn.dataset.companyId || null });
      navigateTo('customers');
    });
  });

  container.querySelector('#closeDeleteModal')?.addEventListener('click', closeDeleteModal);
  container.querySelector('#cancelDeleteModal')?.addEventListener('click', closeDeleteModal);
  container.querySelector('#confirmDeleteCompany')?.addEventListener('click', async () => {
    if (!deleteTargetId) return;
    const result = await deleteCompany(deleteTargetId);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    showToast('Company deleted', 'success');
    deleteTargetId = null;
    closeDeleteModal();
    backdrop?.classList.remove('open');
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
  });

  bindDelegatedActions(container, { openForm, openDeleteModal, closeForm });
  bindDropdownClose(container);
  bindWhatsAppModalEvents(container);
}

function bindDropdownClose(container) {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu')) {
      closeAllDropdowns(container);
    }
  });
}

function closeAllDropdowns(container) {
  container.querySelectorAll('.action-menu.open').forEach((menu) => menu.classList.remove('open'));
}

function toggleDropdown(container, id) {
  const menus = container.querySelectorAll('.action-menu');
  menus.forEach((menu) => {
    const trigger = menu.querySelector('.action-menu-trigger');
    if (trigger?.dataset.id === id) {
      const isOpen = menu.classList.contains('open');
      closeAllDropdowns(container);
      if (!isOpen) menu.classList.add('open');
    } else {
      menu.classList.remove('open');
    }
  });
}

function bindDelegatedActions(container, { openForm, openDeleteModal }) {
  if (container.dataset.companyActionsBound) return;
  container.dataset.companyActionsBound = '1';

  container.addEventListener('click', async (e) => {
    const trigger = e.target.closest('.action-menu-trigger');
    if (trigger) {
      e.stopPropagation();
      toggleDropdown(container, trigger.dataset.id);
      return;
    }

    const editBtn = e.target.closest('.edit-company');
    const deleteBtn = e.target.closest('.delete-company');
    const suspendBtn = e.target.closest('.suspend-company');
    const activateBtn = e.target.closest('.activate-company');

    if (editBtn) {
      e.stopPropagation();
      closeAllDropdowns(container);
      const company = state.companies.find((c) => c.id === editBtn.dataset.id);
      if (company) openCompanyForm(container, company, openForm);
      return;
    }

    if (deleteBtn) {
      e.stopPropagation();
      closeAllDropdowns(container);
      const company = state.companies.find((c) => c.id === deleteBtn.dataset.id);
      deleteTargetId = deleteBtn.dataset.id;
      const nameEl = container.querySelector('#deleteCompanyName');
      if (nameEl) nameEl.textContent = company?.name || 'this company';
      openDeleteModal();
      return;
    }

    if (suspendBtn) {
      e.stopPropagation();
      closeAllDropdowns(container);
      if (!confirm('Suspend this company? Users will lose access.')) return;
      const result = await suspendCompany(suspendBtn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('Company suspended', 'warning');
      document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
      renderCompanies(container);
      return;
    }

    if (activateBtn) {
      e.stopPropagation();
      closeAllDropdowns(container);
      const result = await activateCompany(activateBtn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('Company activated', 'success');
      document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
      renderCompanies(container);
    }
  });
}

function syncTenantClassFilterActive(container) {
  container.querySelectorAll('.tenant-class-filter-btn').forEach((btn) => {
    const value = btn.dataset.tenantClass || '';
    btn.classList.toggle('active', value === filters.tenantClass);
  });
}

function clearAllCompanyFilters(container) {
  filters = { search: '', plan: '', status: '', tenantClass: '' };
  const search = container.querySelector('#companySearch');
  const planFilter = container.querySelector('#companyPlanFilter');
  const statusFilter = container.querySelector('#companyStatusFilter');
  if (search) search.value = '';
  if (planFilter) planFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  syncTenantClassFilterActive(container);
  refreshContent(container);
}

function refreshContent(container) {
  const filtered = applyFilters(state.companies);
  const content = container.querySelector('#companiesContent');
  if (!content) return;
  const hasFilters = Boolean(filters.search || filters.plan || filters.status || filters.tenantClass);
  content.innerHTML = filtered.length
    ? renderTable(filtered)
    : emptyState('No tenants match your filters.', hasFilters
      ? '<button class="btn btn-primary btn-sm" type="button" id="clearCompanyFilters">Clear filters</button>'
      : '');

  container.querySelector('#clearCompanyFilters')?.addEventListener('click', () => {
    clearAllCompanyFilters(container);
  });
}

function openCompanyForm(container, company, openForm) {
  const isEdit = Boolean(company);
  container.querySelector('#companyFormTitle').textContent = isEdit ? 'Edit Company' : 'Add Company';
  container.querySelector('#companyEditId').value = company?.id || '';
  container.querySelector('#companyName').value = company?.name || '';
  container.querySelector('#companyIndustry').value = company?.industry || '';
  container.querySelector('#companyWebsite').value = company?.website || '';
  container.querySelector('#companyEmail').value = company?.email || '';
  container.querySelector('#companyPhone').value = company?.phone || '';
  container.querySelector('#companyLogoUrl').value = company?.logoUrl || '';
  container.querySelector('#companyOwner').value = company?.owner || '';
  container.querySelector('#companyOwnerEmail').value = company?.ownerEmail || '';
  container.querySelector('#companyOwnerPhone').value = company?.ownerPhone || '';
  container.querySelector('#companyTenantClass').value =
    company?.settings?.tenantClass ||
    (company?.settings?.productionCustomer ? 'PRODUCTION CUSTOMER' : 'PRODUCTION CUSTOMER');
  container.querySelector('#companyPlan').value = company?.plan || 'business';
  container.querySelector('#companyStatus').value = company?.status || 'active';
  const planAmount = container.querySelector('#companyPlanAmount');
  planAmount.value = company?.billing?.planAmount ?? PLAN_AMOUNTS[company?.plan || 'business'] ?? '';
  planAmount.dataset.userEdited = company ? '1' : '';
  container.querySelector('#companyBillingStatus').value = company?.billing?.status || 'pending';
  container.querySelector('#companyAgent').value = company?.agentId || '';
  container.querySelector('#companyAiModel').value = company?.aiModel || 'gpt-4o-mini';
  container.querySelector('#companyAiTemperature').value = company?.aiTemperature ?? 0.7;
  container.querySelector('#companyOpenAiKey').value = company?.openAiApiKey || '';
  container.querySelector('#companyKnowledgeBase').value = company?.knowledgeBaseId || '';
  container.querySelector('#companyKnowledgeMaxDocs').value = company?.knowledgeMaxDocs ?? 500;
  container.querySelector('#companyKnowledgeAutoSync').checked = company?.knowledgeAutoSync !== false;
  openForm();
  loadWhatsAppIntegrationCard(container, isEdit ? company.id : null);
}

async function saveCompany(container, closeForm) {
  const id = container.querySelector('#companyEditId').value;
  const kbSelect = container.querySelector('#companyKnowledgeBase');
  const agentSelect = container.querySelector('#companyAgent');
  const kbOption = kbSelect.selectedOptions[0];
  const agentOption = agentSelect.selectedOptions[0];
  const plan = container.querySelector('#companyPlan').value;
  const ownerEmail = container.querySelector('#companyOwnerEmail').value.trim();
  const ownerName = container.querySelector('#companyOwner').value.trim();
  const tenantClass = container.querySelector('#companyTenantClass')?.value || 'PRODUCTION CUSTOMER';

  const payload = {
    name: container.querySelector('#companyName').value.trim(),
    industry: container.querySelector('#companyIndustry').value.trim(),
    website: container.querySelector('#companyWebsite').value.trim(),
    email: container.querySelector('#companyEmail').value.trim(),
    phone: container.querySelector('#companyPhone').value.trim(),
    logoUrl: container.querySelector('#companyLogoUrl').value.trim(),
    owner: ownerName,
    ownerEmail,
    ownerPhone: container.querySelector('#companyOwnerPhone').value.trim(),
    plan,
    status: container.querySelector('#companyStatus').value,
    agentId: agentSelect.value || null,
    agentName: agentOption?.dataset?.name || '',
    aiModel: container.querySelector('#companyAiModel').value,
    aiTemperature: Number(container.querySelector('#companyAiTemperature').value) || 0.7,
    openAiApiKey: container.querySelector('#companyOpenAiKey').value.trim(),
    knowledgeBaseId: kbSelect.value || null,
    knowledgeBaseName: kbOption?.dataset?.name || '',
    knowledgeMaxDocs: Number(container.querySelector('#companyKnowledgeMaxDocs').value) || 500,
    knowledgeAutoSync: container.querySelector('#companyKnowledgeAutoSync').checked,
    tenantClass,
    billing: {
      planAmount: Number(container.querySelector('#companyPlanAmount').value) || PLAN_AMOUNTS[plan],
      currency: 'ZAR',
      status: container.querySelector('#companyBillingStatus').value,
      cycle: 'monthly',
    },
  };

  if (!payload.name) {
    showToast('Company name is required', 'warning');
    return;
  }

  /* New company — full operator provision (Auth owner + Sarah + KB + CRM). */
  if (!id) {
    if (!ownerEmail) {
      showToast('Owner email is required to create a portal login', 'warning');
      return;
    }
    if (!ownerName) {
      showToast('Owner name is required', 'warning');
      return;
    }

    const provision = await provisionOperatorTenant({
      ...payload,
      agentName: 'Sarah (AI)',
      agentRole: 'sales_consultant',
      agentRoleLabel: 'Sales Consultant',
      personality: 'sales_driven',
    });

    if (provision.error) {
      showToast(provision.error, 'error');
      return;
    }

    const data = provision.data || provision;
    const tempPw = data.owner?.temporaryPassword;
    const resetLink = data.owner?.passwordResetLink;
    let ownerMsg = `Owner ${data.owner?.email || ownerEmail} bound (${data.owner?.uid || 'uid'})`;
    if (data.owner?.authCreated && tempPw) {
      ownerMsg += ` — temporary password: ${tempPw}`;
    } else if (resetLink) {
      ownerMsg += ' — password reset link generated';
    }
    showToast(
      `Company ${data.companyId} provisioned with Sarah. ${ownerMsg}. WhatsApp: Ready for Setup.`,
      'success'
    );
    if (tempPw) {
      console.info('[Mission Control] Owner temporary password (share once):', {
        companyId: data.companyId,
        email: data.owner?.email,
        temporaryPassword: tempPw,
        passwordResetLink: resetLink,
      });
    }

    closeForm();
    document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
    renderCompanies(container);
    return;
  }

  const result = await updateCompany(id, payload);
  if (result.error) {
    showToast(result.error, 'error');
    return;
  }

  showToast('Company updated', 'success');
  closeForm();
  document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
  renderCompanies(container);
}
