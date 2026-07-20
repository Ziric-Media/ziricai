import { state, setState } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  planBadge,
  statusBadge,
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
import { provisionCompanyWorkspace } from '../api.js';
import { navigateTo } from '../router.js';
import { withTimeout } from '../utils.js';
import { DEMO_COMPANIES, DEMO_AGENTS, DEMO_KNOWLEDGE, PLAN_AMOUNTS } from '../demo-data.js';
import { formatPrice } from '../../shared/billingPlans.js';

let filters = { search: '', plan: '', status: '' };
let deleteTargetId = null;

export async function renderCompanies(container) {
  container.innerHTML = loadingState('Loading companies...');
  const result = await withTimeout(listCompanies());
  const items = result.items?.length ? result.items : DEMO_COMPANIES;
  setState({ companies: items });

  container.innerHTML = buildListMarkup(items, result.isDemo);
  bindListEvents(container);
}

function buildListMarkup(companies, isDemo) {
  const filtered = applyFilters(companies);
  return `
    ${pageHeader(
      'Companies',
      'Manage tenant workspaces — the root of your multi-tenant AI platform.',
      `<button class="btn btn-primary btn-sm" type="button" id="openCompanyForm">
        <i class="fa-solid fa-plus"></i> Add Company
      </button>`
    )}
    ${isDemo ? `<div class="demo-banner"><i class="fa-solid fa-flask"></i> Showing demo data — Firestore unavailable or empty. Changes persist locally.</div>` : ''}

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
        : emptyState('No companies match your filters.', '<button class="btn btn-primary btn-sm" type="button" id="clearCompanyFilters">Clear filters</button>')}
    </div>

    ${buildFormSlideOver()}
    ${buildDeleteModal()}
  `;
}

function applyFilters(companies) {
  const term = filters.search.toLowerCase();
  return companies.filter((c) => {
    const matchesSearch = !term || [
      c.name, c.industry, c.owner, c.ownerEmail, c.email,
    ].some((v) => String(v || '').toLowerCase().includes(term));
    const matchesPlan = !filters.plan || c.plan === filters.plan;
    const matchesStatus = !filters.status || c.status === filters.status;
    return matchesSearch && matchesPlan && matchesStatus;
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

function whatsappCell(company) {
  if (!company.whatsappNumber) {
    return '<span class="text-muted">Not connected</span>';
  }
  const connected = company.whatsappConnected
    ? '<i class="fa-solid fa-circle-check wa-connected" title="Connected"></i>'
    : '<i class="fa-solid fa-circle-xmark wa-disconnected" title="Not connected"></i>';
  return `<span class="wa-cell">${connected} ${escapeHtml(company.whatsappNumber)}</span>`;
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
            <th>Company Name</th>
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
        <div class="info">${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}</div>
      </div>
    </div>
  `;
}

function renderRow(company) {
  const links = company.provisioningLinks || {};
  const portalUrl = links.portalUrl || `/company-portal.html?company=${encodeURIComponent(company.id)}`;
  return `
    <tr data-id="${escapeHtml(company.id)}" class="company-row">
      <td>
        <div class="org-name">
          <div class="avatar company-table-avatar">${logoCell(company)}</div>
          <div>
            <div class="company-name-text">${escapeHtml(company.name)}</div>
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
          <div class="form-group"><label for="companyOwner">Owner Name</label><input type="text" id="companyOwner" placeholder="e.g. John Smith" /></div>
          <div class="form-row">
            <div class="form-group"><label for="companyOwnerEmail">Owner Email</label><input type="email" id="companyOwnerEmail" placeholder="owner@company.co.za" /></div>
            <div class="form-group"><label for="companyOwnerPhone">Owner Phone</label><input type="tel" id="companyOwnerPhone" placeholder="+27 82 555 0101" /></div>
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

        <div class="form-section">
          <h4><i class="fa-brands fa-whatsapp"></i> WhatsApp Configuration</h4>
          <div class="form-row">
            <div class="form-group"><label for="companyWhatsapp">WhatsApp Number</label><input type="tel" id="companyWhatsapp" placeholder="+27 71 000 1234" /></div>
            <div class="form-group"><label for="companyWhatsappBusinessId">Business Account ID</label><input type="text" id="companyWhatsappBusinessId" placeholder="WABA-..." /></div>
          </div>
          <div class="form-group"><label for="companyWhatsappWebhook">Webhook URL</label><input type="url" id="companyWhatsappWebhook" placeholder="https://api.ziric.ai/webhook/..." /></div>
          <div class="form-group form-check">
            <label class="checkbox-label">
              <input type="checkbox" id="companyWhatsappConnected" />
              <span>WhatsApp connected and verified</span>
            </label>
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
  container.querySelector('#closeCompanyForm')?.addEventListener('click', closeForm);
  container.querySelector('#cancelCompanyForm')?.addEventListener('click', closeForm);

  container.querySelector('#clearCompanyFilters')?.addEventListener('click', () => {
    filters = { search: '', plan: '', status: '' };
    refreshContent(container);
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

function refreshContent(container) {
  const filtered = applyFilters(state.companies);
  const content = container.querySelector('#companiesContent');
  if (!content) return;
  content.innerHTML = filtered.length
    ? renderTable(filtered)
    : emptyState('No companies match your filters.', '<button class="btn btn-primary btn-sm" type="button" id="clearCompanyFilters">Clear filters</button>');

  container.querySelector('#clearCompanyFilters')?.addEventListener('click', () => {
    filters = { search: '', plan: '', status: '' };
    const search = container.querySelector('#companySearch');
    const planFilter = container.querySelector('#companyPlanFilter');
    const statusFilter = container.querySelector('#companyStatusFilter');
    if (search) search.value = '';
    if (planFilter) planFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    refreshContent(container);
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
  container.querySelector('#companyWhatsapp').value = company?.whatsappNumber || '';
  container.querySelector('#companyWhatsappBusinessId').value = company?.whatsappBusinessId || '';
  container.querySelector('#companyWhatsappWebhook').value = company?.whatsappWebhookUrl || '';
  container.querySelector('#companyWhatsappConnected').checked = Boolean(company?.whatsappConnected);
  container.querySelector('#companyKnowledgeBase').value = company?.knowledgeBaseId || '';
  container.querySelector('#companyKnowledgeMaxDocs').value = company?.knowledgeMaxDocs ?? 500;
  container.querySelector('#companyKnowledgeAutoSync').checked = company?.knowledgeAutoSync !== false;
  openForm();
}

async function saveCompany(container, closeForm) {
  const id = container.querySelector('#companyEditId').value;
  const kbSelect = container.querySelector('#companyKnowledgeBase');
  const agentSelect = container.querySelector('#companyAgent');
  const kbOption = kbSelect.selectedOptions[0];
  const agentOption = agentSelect.selectedOptions[0];
  const plan = container.querySelector('#companyPlan').value;

  const payload = {
    name: container.querySelector('#companyName').value.trim(),
    industry: container.querySelector('#companyIndustry').value.trim(),
    website: container.querySelector('#companyWebsite').value.trim(),
    email: container.querySelector('#companyEmail').value.trim(),
    phone: container.querySelector('#companyPhone').value.trim(),
    logoUrl: container.querySelector('#companyLogoUrl').value.trim(),
    owner: container.querySelector('#companyOwner').value.trim(),
    ownerEmail: container.querySelector('#companyOwnerEmail').value.trim(),
    ownerPhone: container.querySelector('#companyOwnerPhone').value.trim(),
    plan,
    status: container.querySelector('#companyStatus').value,
    agentId: agentSelect.value || null,
    agentName: agentOption?.dataset?.name || '',
    aiModel: container.querySelector('#companyAiModel').value,
    aiTemperature: Number(container.querySelector('#companyAiTemperature').value) || 0.7,
    openAiApiKey: container.querySelector('#companyOpenAiKey').value.trim(),
    whatsappNumber: container.querySelector('#companyWhatsapp').value.trim(),
    whatsappBusinessId: container.querySelector('#companyWhatsappBusinessId').value.trim(),
    whatsappWebhookUrl: container.querySelector('#companyWhatsappWebhook').value.trim(),
    whatsappConnected: container.querySelector('#companyWhatsappConnected').checked,
    knowledgeBaseId: kbSelect.value || null,
    knowledgeBaseName: kbOption?.dataset?.name || '',
    knowledgeMaxDocs: Number(container.querySelector('#companyKnowledgeMaxDocs').value) || 500,
    knowledgeAutoSync: container.querySelector('#companyKnowledgeAutoSync').checked,
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

  const result = id ? await updateCompany(id, payload) : await createCompany(payload);
  if (result.error) {
    showToast(result.error, 'error');
    return;
  }

  const companyId = id || result.id || result.item?.id;
  if (companyId && !id) {
    const provision = await provisionCompanyWorkspace(companyId, {
      ...payload,
      companyId,
    });
    if (!provision.error && provision.data?.links) {
      const links = provision.data.links;
      await updateCompany(companyId, {
        agentId: links.agentId,
        agentName: links.agentName || payload.agentName,
        knowledgeBaseId: links.knowledgeBaseId,
        knowledgeBaseName: `${payload.name} KB`,
        provisioningLinks: links,
      });
      showToast('Company created — portal, agent, CRM, and workflows provisioned', 'success');
    } else if (provision.error) {
      showToast(`Company saved; provisioning pending (${provision.error})`, 'warning');
    } else {
      showToast('Company created', 'success');
    }
  } else {
    showToast(id ? 'Company updated' : 'Company created', 'success');
  }

  closeForm();
  document.dispatchEvent(new CustomEvent('ziric:companies-updated'));
  renderCompanies(container);
}
