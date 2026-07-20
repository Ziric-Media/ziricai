import { state } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  formatDate,
  showToast,
} from '../ui.js';
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  publishWorkflow,
} from '../services/workflows.js';
import { listCompanies } from '../services/companies.js';
import { withTimeout } from '../utils.js';
import { DEMO_COMPANIES } from '../demo-data.js';
import { openBuilder } from './automation-builder.js';
import { openTemplatesGallery } from './automation-templates.js';

let refreshList = null;

export async function renderAutomation(container) {
  container.innerHTML = loadingState('Loading workflows...');
  await loadHome(container);
}

async function loadHome(container) {
  const companyId = state.selectedCompanyId || null;
  const [wfResult, coResult] = await Promise.all([
    withTimeout(listWorkflows(companyId)),
    withTimeout(listCompanies()),
  ]);

  const workflows = wfResult.items || [];
  const companies = coResult.items?.length ? coResult.items : DEMO_COMPANIES;

  container.innerHTML = buildHomeMarkup(workflows, wfResult.isDemo);
  bindHomeEvents(container, companies);

  refreshList = () => loadHome(container);
}

function buildHomeMarkup(workflows, isDemo) {
  return `
    ${pageHeader(
      'Workflow Automation Studio',
      'No-code AI workflows — Power Automate meets Zapier, AI-native.',
      `<button class="btn btn-secondary btn-sm" type="button" id="browseTemplatesBtn">
        <i class="fa-solid fa-layer-group"></i> Browse Templates
      </button>
      <button class="btn btn-primary btn-sm" type="button" id="createWorkflowBtn">
        <i class="fa-solid fa-plus"></i> Create Workflow
      </button>`
    )}
    ${isDemo ? '<div class="demo-banner"><i class="fa-solid fa-flask"></i> Showing demo workflows — API or localStorage fallback active.</div>' : ''}

    <div class="automation-stats">
      <div class="stat-card"><span class="stat-value">${workflows.length}</span><span class="stat-label">Total Workflows</span></div>
      <div class="stat-card"><span class="stat-value">${workflows.filter((w) => w.status === 'published').length}</span><span class="stat-label">Published</span></div>
      <div class="stat-card"><span class="stat-value">${workflows.filter((w) => w.status === 'draft').length}</span><span class="stat-label">Drafts</span></div>
    </div>

    <div id="automationContent">
      ${workflows.length ? renderWorkflowTable(workflows) : emptyState('No workflows yet. Create one or install a template.', '<button class="btn btn-primary btn-sm" type="button" id="createWorkflowEmpty">Create Workflow</button>')}
    </div>

    <div id="automationBuilderMount"></div>
    <div id="automationTemplatesMount"></div>
    <div id="createWorkflowModal" class="modal-overlay">
      <div class="modal-card">
        <h3>Create Workflow</h3>
        <div class="form-group"><label>Name</label><input type="text" id="newWorkflowName" placeholder="e.g. Finance Enquiry" /></div>
        <div class="form-group"><label>Company</label><select id="newWorkflowCompany"></select></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="cancelCreateWorkflow">Cancel</button>
          <button class="btn btn-primary btn-sm" type="button" id="confirmCreateWorkflow">Create</button>
        </div>
      </div>
    </div>`;
}

function workflowStatusBadge(status) {
  const cls = status === 'published' ? 'active' : 'pending';
  const label = status === 'published' ? 'Published' : 'Draft';
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function renderWorkflowTable(workflows) {
  return `
    <div class="profile-card automation-table-card">
      <table class="data-table automation-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Status</th>
            <th>Triggers</th>
            <th>Last Modified</th>
            <th>Version</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${workflows.map((w) => `
            <tr data-id="${escapeHtml(w.id)}">
              <td><strong class="wf-name-link" data-id="${escapeHtml(w.id)}">${escapeHtml(w.name)}</strong></td>
              <td>${escapeHtml(w.companyName || '—')}</td>
              <td>${workflowStatusBadge(w.status)}</td>
              <td>${(w.triggers || []).map((t) => `<span class="trigger-chip">${escapeHtml(t)}</span>`).join(' ') || '—'}</td>
              <td>${formatDate(w.updatedAt)}</td>
              <td>v${w.currentVersion || 0}</td>
              <td>${actionMenu(w)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function actionMenu(w) {
  return `
    <div class="action-menu" data-stop-propagation="true">
      <button class="btn btn-icon action-menu-trigger" type="button" data-id="${escapeHtml(w.id)}" aria-label="Actions">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <div class="action-menu-dropdown" role="menu">
        <button class="action-menu-item edit-wf" type="button" data-id="${escapeHtml(w.id)}" role="menuitem"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="action-menu-item duplicate-wf" type="button" data-id="${escapeHtml(w.id)}" role="menuitem"><i class="fa-solid fa-copy"></i> Duplicate</button>
        <button class="action-menu-item publish-wf" type="button" data-id="${escapeHtml(w.id)}" role="menuitem"><i class="fa-solid fa-rocket"></i> Publish</button>
        <button class="action-menu-item danger delete-wf" type="button" data-id="${escapeHtml(w.id)}" role="menuitem"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>`;
}

function bindHomeEvents(container, companies) {
  const modal = container.querySelector('#createWorkflowModal');
  const companySelect = container.querySelector('#newWorkflowCompany');
  if (companySelect) {
    companySelect.innerHTML = companies.map((c) =>
      `<option value="${escapeHtml(c.id)}" ${c.id === state.selectedCompanyId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');
  }

  const openCreateModal = () => {
    modal?.classList.add('open');
    container.querySelector('#newWorkflowName')?.focus();
  };

  container.querySelector('#createWorkflowBtn')?.addEventListener('click', openCreateModal);
  container.querySelector('#createWorkflowEmpty')?.addEventListener('click', openCreateModal);
  container.querySelector('#cancelCreateWorkflow')?.addEventListener('click', () => modal?.classList.remove('open'));

  container.querySelector('#confirmCreateWorkflow')?.addEventListener('click', async () => {
    const name = container.querySelector('#newWorkflowName')?.value?.trim();
    const companyId = container.querySelector('#newWorkflowCompany')?.value;
    const company = companies.find((c) => c.id === companyId);
    if (!name) { showToast('Enter a workflow name', 'warning'); return; }
    const result = await createWorkflow({ name, companyId, companyName: company?.name });
    if (result.error) { showToast(result.error, 'error'); return; }
    modal?.classList.remove('open');
    showToast('Workflow created', 'success');
    openBuilder(container.querySelector('#automationBuilderMount'), result.item, refreshList);
  });

  container.querySelector('#browseTemplatesBtn')?.addEventListener('click', () => {
    openTemplatesGallery(container.querySelector('#automationTemplatesMount'), {
      onClose: () => {},
      onInstall: (item) => {
        refreshList?.();
        if (item) openBuilder(container.querySelector('#automationBuilderMount'), item, refreshList);
      },
    });
  });

  container.querySelectorAll('.wf-name-link, .edit-wf').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      const result = await getWorkflow(id);
      if (result.error) { showToast(result.error, 'error'); return; }
      openBuilder(container.querySelector('#automationBuilderMount'), result.item, refreshList);
    });
  });

  container.querySelectorAll('.duplicate-wf').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const result = await duplicateWorkflow(btn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('Workflow duplicated', 'success');
      refreshList?.();
    });
  });

  container.querySelectorAll('.publish-wf').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const result = await publishWorkflow(btn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast(`Published as v${result.version}`, 'success');
      refreshList?.();
    });
  });

  container.querySelectorAll('.delete-wf').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this workflow? This cannot be undone.')) return;
      const result = await deleteWorkflow(btn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('Workflow deleted', 'success');
      refreshList?.();
    });
  });

  bindActionMenus(container);
}

function bindActionMenus(container) {
  container.querySelectorAll('.action-menu-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = trigger.closest('.action-menu');
      const wasOpen = menu?.classList.contains('open');
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      if (!wasOpen) menu?.classList.add('open');
    });
  });
  document.addEventListener('click', () => {
    container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
  }, { once: true });
}
