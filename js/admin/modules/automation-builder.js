/** Step catalog & visual workflow builder. */

import {
  escapeHtml,
  formatDate,
  showToast,
} from '../ui.js';
import { updateWorkflow, publishWorkflow, rollbackWorkflow } from '../services/workflows.js';
import { renderIntegrationsPanel } from './automation-integrations.js';

export const STEP_CATEGORIES = [
  {
    id: 'triggers',
    label: 'Triggers',
    icon: 'fa-solid fa-bolt',
    steps: [
      { stepType: 'whatsapp_message', label: 'WhatsApp Message', icon: 'fa-brands fa-whatsapp', type: 'trigger', description: 'When a customer sends a WhatsApp message' },
      { stepType: 'new_customer', label: 'New Customer', icon: 'fa-solid fa-user-plus', type: 'trigger', description: 'When a new customer is created' },
      { stepType: 'payment_received', label: 'Payment Received', icon: 'fa-solid fa-credit-card', type: 'trigger', description: 'When a payment is confirmed' },
      { stepType: 'email_received', label: 'Email Received', icon: 'fa-solid fa-envelope', type: 'trigger', description: 'When an email arrives' },
      { stepType: 'form_submitted', label: 'Form Submitted', icon: 'fa-solid fa-file-lines', type: 'trigger', description: 'When a web form is submitted' },
      { stepType: 'scheduled', label: 'Scheduled', icon: 'fa-solid fa-calendar-days', type: 'trigger', description: 'Run on a schedule (cron)' },
    ],
  },
  {
    id: 'conditions',
    label: 'Conditions',
    icon: 'fa-solid fa-code-branch',
    steps: [
      { stepType: 'contains_keyword', label: 'Contains Keyword', icon: 'fa-solid fa-filter', type: 'condition', description: 'Message contains specific keywords', defaultConfig: { keyword: '', matchMode: 'any' } },
      { stepType: 'lead_score', label: 'Lead Score', icon: 'fa-solid fa-gauge-high', type: 'condition', description: 'Compare customer lead score', defaultConfig: { operator: 'gte', value: 50 } },
      { stepType: 'sentiment', label: 'Sentiment', icon: 'fa-solid fa-face-smile', type: 'condition', description: 'Check message sentiment', defaultConfig: { threshold: 'neutral', escalateBelow: 0.3 } },
      { stepType: 'business_hours', label: 'Business Hours', icon: 'fa-solid fa-clock', type: 'condition', description: 'Within operating hours', defaultConfig: { start: '08:00', end: '17:00', timezone: 'Africa/Johannesburg' }, hasBranch: true },
      { stepType: 'ai_confidence', label: 'AI Confidence', icon: 'fa-solid fa-brain', type: 'condition', description: 'AI output confidence threshold', defaultConfig: { minConfidence: 0.75 }, hasBranch: true },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    icon: 'fa-solid fa-play',
    steps: [
      { stepType: 'reply', label: 'Reply', icon: 'fa-solid fa-reply', type: 'action', description: 'Send WhatsApp or chat reply', defaultConfig: { template: '' } },
      { stepType: 'assign_human', label: 'Assign Human', icon: 'fa-solid fa-user-tie', type: 'action', description: 'Hand off to a team member', defaultConfig: { department: 'Sales' } },
      { stepType: 'create_task', label: 'Create Task', icon: 'fa-solid fa-list-check', type: 'action', description: 'Create a CRM task', defaultConfig: { title: '', priority: 'normal' } },
      { stepType: 'send_email', label: 'Send Email', icon: 'fa-solid fa-envelope', type: 'action', description: 'Send an email notification', defaultConfig: { template: '' } },
      { stepType: 'notify_manager', label: 'Notify Manager', icon: 'fa-solid fa-bell', type: 'action', description: 'Alert a manager', defaultConfig: { channel: 'email' } },
      { stepType: 'update_crm', label: 'Update CRM', icon: 'fa-solid fa-address-book', type: 'action', description: 'Update customer record', defaultConfig: { stage: '' } },
      { stepType: 'delay', label: 'Delay / Wait', icon: 'fa-solid fa-hourglass-half', type: 'action', description: 'Wait before next step', defaultConfig: { hours: 24 } },
    ],
  },
  {
    id: 'ai_actions',
    label: 'AI Actions',
    icon: 'fa-solid fa-wand-magic-sparkles',
    steps: [
      { stepType: 'summarize', label: 'Summarize', icon: 'fa-solid fa-file-lines', type: 'ai_action', description: 'AI summary of conversation', defaultConfig: {} },
      { stepType: 'classify', label: 'Classify', icon: 'fa-solid fa-shapes', type: 'ai_action', description: 'Classify intent or category', defaultConfig: { categories: [] } },
      { stepType: 'generate_proposal', label: 'Generate Proposal', icon: 'fa-solid fa-file-invoice', type: 'ai_action', description: 'Generate a proposal or quote', defaultConfig: { template: 'default' } },
      { stepType: 'detect_opportunity', label: 'Detect Sales Opportunity', icon: 'fa-solid fa-chart-line', type: 'ai_action', description: 'Identify upsell opportunities', defaultConfig: {} },
      { stepType: 'extract_entities', label: 'Extract Entities', icon: 'fa-solid fa-tags', type: 'ai_action', description: 'Pull structured data from message', defaultConfig: { entities: [] } },
    ],
  },
];

export function findStepDef(stepType) {
  for (const cat of STEP_CATEGORIES) {
    const step = cat.steps.find((s) => s.stepType === stepType);
    if (step) return { ...step, category: cat.id };
  }
  return null;
}

export function configSummary(node) {
  const cfg = node.config || {};
  switch (node.stepType) {
    case 'contains_keyword':
      return cfg.keyword ? `"${cfg.keyword}"` : 'No keyword set';
    case 'lead_score':
      return `Score ${cfg.operator || 'gte'} ${cfg.value ?? 50}`;
    case 'business_hours':
      return `${cfg.start || '08:00'} – ${cfg.end || '17:00'}`;
    case 'ai_confidence':
      return `Min ${Math.round((cfg.minConfidence ?? 0.75) * 100)}%`;
    case 'generate_proposal':
      return cfg.template || 'Default template';
    case 'create_task':
      return cfg.title || 'Untitled task';
    case 'assign_human':
      return cfg.department || 'Unassigned';
    case 'delay':
      return `Wait ${cfg.hours || 24}h`;
    case 'reply':
    case 'send_email':
      return cfg.template || 'Custom message';
    case 'scheduled':
      return cfg.cron || cfg.label || 'Custom schedule';
    case 'classify':
      return (cfg.categories || []).length ? cfg.categories.join(', ') : 'Auto categories';
    case 'extract_entities':
      return (cfg.entities || []).join(', ') || 'Auto extract';
    default:
      return node.description || '';
  }
}

export function createNodeFromStep(step) {
  return {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: step.type,
    stepType: step.stepType,
    label: step.label,
    icon: step.icon,
    config: { ...(step.defaultConfig || {}) },
    ...(step.hasBranch ? { branch: { yes: [], no: [] } } : {}),
  };
}

export function buildConfigForm(node) {
  const cfg = node.config || {};
  switch (node.stepType) {
    case 'contains_keyword':
      return `
        <div class="form-group"><label>Keywords (comma-separated)</label>
          <input type="text" id="cfgKeyword" value="${escapeAttr(cfg.keyword)}" placeholder="finance, loan, credit" /></div>
        <div class="form-group"><label>Match mode</label>
          <select id="cfgMatchMode"><option value="any" ${cfg.matchMode !== 'all' ? 'selected' : ''}>Any keyword</option>
          <option value="all" ${cfg.matchMode === 'all' ? 'selected' : ''}>All keywords</option></select></div>`;
    case 'lead_score':
      return `
        <div class="form-group"><label>Operator</label>
          <select id="cfgOperator"><option value="gte" ${cfg.operator === 'gte' ? 'selected' : ''}>≥ Greater or equal</option>
          <option value="lte" ${cfg.operator === 'lte' ? 'selected' : ''}>≤ Less or equal</option></select></div>
        <div class="form-group"><label>Threshold</label>
          <input type="number" id="cfgValue" value="${cfg.value ?? 50}" min="0" max="100" /></div>`;
    case 'sentiment':
      return `
        <div class="form-group"><label>Escalate below score</label>
          <input type="number" id="cfgEscalateBelow" value="${cfg.escalateBelow ?? 0.3}" min="0" max="1" step="0.1" /></div>`;
    case 'business_hours':
      return `
        <div class="form-group"><label>Start time</label><input type="time" id="cfgStart" value="${cfg.start || '08:00'}" /></div>
        <div class="form-group"><label>End time</label><input type="time" id="cfgEnd" value="${cfg.end || '17:00'}" /></div>
        <div class="form-group"><label>Timezone</label><input type="text" id="cfgTimezone" value="${escapeAttr(cfg.timezone || 'Africa/Johannesburg')}" /></div>`;
    case 'ai_confidence':
      return `
        <div class="form-group"><label>Minimum confidence (0–1)</label>
          <input type="number" id="cfgMinConfidence" value="${cfg.minConfidence ?? 0.75}" min="0" max="1" step="0.05" /></div>`;
    case 'reply':
    case 'send_email':
      return `
        <div class="form-group"><label>Message template</label>
          <textarea id="cfgTemplate" rows="4" placeholder="Hi {{name}}, ...">${escapeAttr(cfg.template || '')}</textarea></div>`;
    case 'assign_human':
      return `
        <div class="form-group"><label>Department</label>
          <input type="text" id="cfgDepartment" value="${escapeAttr(cfg.department || 'Sales')}" /></div>
        <div class="form-group"><label><input type="checkbox" id="cfgRoundRobin" ${cfg.roundRobin ? 'checked' : ''} /> Round-robin assignment</label></div>`;
    case 'create_task':
      return `
        <div class="form-group"><label>Task title</label><input type="text" id="cfgTitle" value="${escapeAttr(cfg.title || '')}" /></div>
        <div class="form-group"><label>Priority</label>
          <select id="cfgPriority"><option value="low" ${cfg.priority === 'low' ? 'selected' : ''}>Low</option>
          <option value="normal" ${!cfg.priority || cfg.priority === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="high" ${cfg.priority === 'high' ? 'selected' : ''}>High</option></select></div>`;
    case 'update_crm':
      return `
        <div class="form-group"><label>Pipeline stage</label>
          <input type="text" id="cfgStage" value="${escapeAttr(cfg.stage || '')}" placeholder="qualified, test_drive_scheduled" /></div>`;
    case 'delay':
      return `
        <div class="form-group"><label>Wait (hours)</label>
          <input type="number" id="cfgHours" value="${cfg.hours ?? 24}" min="1" /></div>`;
    case 'generate_proposal':
      return `
        <div class="form-group"><label>Proposal template</label>
          <select id="cfgTemplate"><option value="vehicle_finance" ${cfg.template === 'vehicle_finance' ? 'selected' : ''}>Vehicle Finance</option>
          <option value="default" ${cfg.template === 'default' ? 'selected' : ''}>Default</option></select></div>
        <div class="form-group"><label><input type="checkbox" id="cfgIncludeTradeIn" ${cfg.includeTradeIn ? 'checked' : ''} /> Include trade-in options</label></div>`;
    case 'classify':
      return `
        <div class="form-group"><label>Categories (comma-separated)</label>
          <input type="text" id="cfgCategories" value="${escapeAttr((cfg.categories || []).join(', '))}" /></div>`;
    case 'extract_entities':
      return `
        <div class="form-group"><label>Entities (comma-separated)</label>
          <input type="text" id="cfgEntities" value="${escapeAttr((cfg.entities || []).join(', '))}" placeholder="vehicle, date, budget" /></div>`;
    case 'scheduled':
      return `
        <div class="form-group"><label>Schedule label</label><input type="text" id="cfgLabel" value="${escapeAttr(cfg.label || '')}" placeholder="Every Monday 9am" /></div>
        <div class="form-group"><label>Cron expression</label><input type="text" id="cfgCron" value="${escapeAttr(cfg.cron || '0 9 * * 1')}" /></div>`;
    case 'notify_manager':
      return `
        <div class="form-group"><label>Notification channel</label>
          <select id="cfgChannel"><option value="email" ${cfg.channel !== 'whatsapp' ? 'selected' : ''}>Email</option>
          <option value="whatsapp" ${cfg.channel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option></select></div>`;
    default:
      return `<p class="text-muted" style="font-size:13px;">No additional configuration for this step.</p>`;
  }
}

export function readConfigFromForm(node) {
  const cfg = { ...(node.config || {}) };
  const el = (id) => document.getElementById(id);

  switch (node.stepType) {
    case 'contains_keyword':
      cfg.keyword = el('cfgKeyword')?.value || '';
      cfg.matchMode = el('cfgMatchMode')?.value || 'any';
      break;
    case 'lead_score':
      cfg.operator = el('cfgOperator')?.value || 'gte';
      cfg.value = Number(el('cfgValue')?.value) || 50;
      break;
    case 'sentiment':
      cfg.escalateBelow = Number(el('cfgEscalateBelow')?.value) || 0.3;
      break;
    case 'business_hours':
      cfg.start = el('cfgStart')?.value || '08:00';
      cfg.end = el('cfgEnd')?.value || '17:00';
      cfg.timezone = el('cfgTimezone')?.value || 'Africa/Johannesburg';
      break;
    case 'ai_confidence':
      cfg.minConfidence = Number(el('cfgMinConfidence')?.value) || 0.75;
      break;
    case 'reply':
    case 'send_email':
      cfg.template = el('cfgTemplate')?.value || '';
      break;
    case 'assign_human':
      cfg.department = el('cfgDepartment')?.value || '';
      cfg.roundRobin = el('cfgRoundRobin')?.checked || false;
      break;
    case 'create_task':
      cfg.title = el('cfgTitle')?.value || '';
      cfg.priority = el('cfgPriority')?.value || 'normal';
      break;
    case 'update_crm':
      cfg.stage = el('cfgStage')?.value || '';
      break;
    case 'delay':
      cfg.hours = Number(el('cfgHours')?.value) || 24;
      break;
    case 'generate_proposal':
      cfg.template = el('cfgTemplate')?.value || 'default';
      cfg.includeTradeIn = el('cfgIncludeTradeIn')?.checked || false;
      break;
    case 'classify':
      cfg.categories = (el('cfgCategories')?.value || '').split(',').map((s) => s.trim()).filter(Boolean);
      break;
    case 'extract_entities':
      cfg.entities = (el('cfgEntities')?.value || '').split(',').map((s) => s.trim()).filter(Boolean);
      break;
    case 'scheduled':
      cfg.label = el('cfgLabel')?.value || '';
      cfg.cron = el('cfgCron')?.value || '';
      break;
    case 'notify_manager':
      cfg.channel = el('cfgChannel')?.value || 'email';
      break;
    default:
      break;
  }
  return cfg;
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export const TYPE_COLORS = {
  trigger: '#7c3aed',
  condition: '#2563eb',
  action: '#059669',
  ai_action: '#d97706',
};

export const TYPE_LABELS = {
  trigger: 'Trigger',
  condition: 'Condition',
  action: 'Action',
  ai_action: 'AI Action',
};

/* ── Visual Workflow Builder ── */

let builderState = {
  workflow: null,
  nodes: [],
  selectedNodeId: null,
  insertAtIndex: null,
  onSave: null,
};

export function openBuilder(mountEl, workflow, onRefresh) {
  if (!mountEl) return;
  builderState = {
    workflow: JSON.parse(JSON.stringify(workflow)),
    nodes: JSON.parse(JSON.stringify(workflow.nodes || [])),
    selectedNodeId: null,
    insertAtIndex: null,
    onSave: onRefresh,
  };
  mountEl.innerHTML = buildBuilderMarkup();
  bindBuilderEvents(mountEl);
}

function buildBuilderMarkup() {
  const wf = builderState.workflow;
  const statusCls = wf.status === 'published' ? 'active' : 'pending';
  const statusLabel = wf.status === 'published' ? 'Published' : 'Draft';

  return `
    <div class="workflow-builder open" id="workflowBuilder">
      <div class="builder-header">
        <div class="builder-header-left">
          <button class="btn btn-icon close-builder" type="button" aria-label="Close"><i class="fa-solid fa-arrow-left"></i></button>
          <div>
            <input type="text" class="builder-name-input" id="builderWorkflowName" value="${escapeHtml(wf.name)}" />
            <div class="builder-meta">
              <span class="status-badge ${statusCls}">${statusLabel}</span>
              <span class="text-muted">v${wf.currentVersion || 0}</span>
              <span class="text-muted">${escapeHtml(wf.companyName || '')}</span>
            </div>
          </div>
        </div>
        <div class="builder-header-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="builderVersionHistory"><i class="fa-solid fa-clock-rotate-left"></i> Version History</button>
          <button class="btn btn-secondary btn-sm" type="button" id="builderIntegrations"><i class="fa-solid fa-plug"></i> Integrations</button>
          <button class="btn btn-secondary btn-sm" type="button" id="builderSave"><i class="fa-solid fa-floppy-disk"></i> Save Draft</button>
          <button class="btn btn-primary btn-sm" type="button" id="builderPublish"><i class="fa-solid fa-rocket"></i> Publish</button>
        </div>
      </div>

      <div class="builder-body">
        <div class="builder-canvas-wrap">
          <div class="builder-canvas" id="builderCanvas">
            ${renderFlowCanvas()}
          </div>
        </div>
        <aside class="builder-side-panel" id="builderSidePanel">
          <div class="side-panel-empty">
            <i class="fa-solid fa-hand-pointer"></i>
            <p>Select a step to configure</p>
          </div>
        </aside>
      </div>

      <div class="step-picker-modal" id="stepPickerModal">
        <div class="step-picker-panel">
          <div class="step-picker-header">
            <h3>Add Step</h3>
            <button class="btn btn-icon close-step-picker" type="button"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="step-picker-categories">
            ${STEP_CATEGORIES.map((cat) => `
              <div class="step-category">
                <h4><i class="${cat.icon}"></i> ${escapeHtml(cat.label)}</h4>
                <div class="step-options">
                  ${cat.steps.map((s) => `
                    <button class="step-option" type="button" data-step='${escapeAttr(JSON.stringify(s))}'>
                      <i class="${s.icon}"></i>
                      <div><strong>${escapeHtml(s.label)}</strong><span>${escapeHtml(s.description)}</span></div>
                    </button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="version-panel" id="versionPanel">
        <div class="version-panel-inner">
          <div class="version-panel-header">
            <h3><i class="fa-solid fa-clock-rotate-left"></i> Version History</h3>
            <button class="btn btn-icon close-version-panel" type="button"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="version-list">
            ${(wf.versions || []).length
              ? (wf.versions || []).slice().reverse().map((v) => `
                <div class="version-item">
                  <div class="version-info">
                    <strong>v${v.version}</strong>
                    <span class="text-muted">${formatDate(v.publishedAt || v.createdAt)}</span>
                    <span class="text-muted">by ${escapeHtml(v.createdBy || 'Admin')}</span>
                  </div>
                  <button class="btn btn-secondary btn-sm rollback-version" type="button" data-version="${v.version}">
                    <i class="fa-solid fa-rotate-left"></i> Rollback
                  </button>
                </div>`).join('')
              : '<p class="text-muted">No published versions yet.</p>'}
          </div>
        </div>
      </div>

      <div class="integrations-drawer" id="integrationsDrawer">
        <div class="integrations-drawer-inner">
          <div class="integrations-drawer-header">
            <h3><i class="fa-solid fa-plug"></i> Connected Integrations</h3>
            <button class="btn btn-icon close-integrations" type="button"><i class="fa-solid fa-xmark"></i></button>
          </div>
          ${renderIntegrationsPanel()}
        </div>
      </div>
    </div>`;
}

function renderFlowCanvas() {
  const nodes = builderState.nodes;
  if (!nodes.length) {
    return `
      <div class="flow-empty">
        <p>No steps yet</p>
        <button class="btn btn-primary btn-sm add-first-step" type="button"><i class="fa-solid fa-plus"></i> Add Trigger</button>
      </div>`;
  }

  let html = '';
  nodes.forEach((node, index) => {
    html += renderAddStepButton(index);
    html += renderNode(node, index);
    if (node.branch) {
      html += renderBranchFork(node);
    }
  });
  html += renderAddStepButton(nodes.length);
  return html;
}

function renderAddStepButton(index) {
  return `
    <div class="flow-connector">
      <div class="flow-line"></div>
      <button class="flow-add-step" type="button" data-index="${index}" title="Add step">
        <i class="fa-solid fa-plus"></i>
      </button>
      <div class="flow-line"></div>
    </div>`;
}

function renderNode(node, index) {
  const color = TYPE_COLORS[node.type] || '#7c3aed';
  const selected = builderState.selectedNodeId === node.id ? 'selected' : '';
  return `
    <div class="flow-node ${selected}" data-id="${escapeHtml(node.id)}" data-index="${index}" style="--node-color:${color}">
      <div class="flow-node-type">${TYPE_LABELS[node.type] || node.type}</div>
      <div class="flow-node-body">
        <div class="flow-node-icon"><i class="${escapeHtml(node.icon)}"></i></div>
        <div class="flow-node-content">
          <strong>${escapeHtml(node.label)}</strong>
          <span class="flow-node-summary">${escapeHtml(configSummary(node))}</span>
        </div>
        <button class="btn btn-icon flow-node-delete" type="button" data-id="${escapeHtml(node.id)}" title="Remove step"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function renderBranchFork(node) {
  const yesNodes = node.branch?.yes || [];
  const noNodes = node.branch?.no || [];
  return `
    <div class="flow-branch">
      <div class="flow-branch-line"></div>
      <div class="flow-branch-paths">
        <div class="flow-branch-path yes">
          <span class="branch-label yes"><i class="fa-solid fa-check"></i> Yes</span>
          ${yesNodes.length ? yesNodes.map((n) => renderNode(n, -1)).join('') : '<span class="branch-empty">No steps</span>'}
        </div>
        <div class="flow-branch-path no">
          <span class="branch-label no"><i class="fa-solid fa-xmark"></i> No</span>
          ${noNodes.length ? noNodes.map((n) => renderNode(n, -1)).join('') : '<span class="branch-empty">No steps</span>'}
        </div>
      </div>
    </div>`;
}

function bindBuilderEvents(mountEl) {
  mountEl.querySelector('.close-builder')?.addEventListener('click', () => {
    mountEl.innerHTML = '';
    builderState.onSave?.();
  });

  mountEl.querySelector('#builderSave')?.addEventListener('click', saveDraft);
  mountEl.querySelector('#builderPublish')?.addEventListener('click', publishDraft);

  mountEl.querySelector('#builderWorkflowName')?.addEventListener('change', (e) => {
    builderState.workflow.name = e.target.value.trim();
  });

  mountEl.querySelector('#builderVersionHistory')?.addEventListener('click', () => {
    mountEl.querySelector('#versionPanel')?.classList.add('open');
  });
  mountEl.querySelector('.close-version-panel')?.addEventListener('click', () => {
    mountEl.querySelector('#versionPanel')?.classList.remove('open');
  });

  mountEl.querySelector('#builderIntegrations')?.addEventListener('click', () => {
    mountEl.querySelector('#integrationsDrawer')?.classList.add('open');
  });
  mountEl.querySelector('.close-integrations')?.addEventListener('click', () => {
    mountEl.querySelector('#integrationsDrawer')?.classList.remove('open');
  });

  mountEl.querySelector('.add-first-step')?.addEventListener('click', () => {
    builderState.insertAtIndex = 0;
    openStepPicker(mountEl);
  });

  mountEl.querySelector('#builderCanvas')?.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.flow-add-step');
    if (addBtn) {
      builderState.insertAtIndex = Number(addBtn.dataset.index);
      openStepPicker(mountEl);
      return;
    }
    const nodeEl = e.target.closest('.flow-node');
    if (nodeEl && !e.target.closest('.flow-node-delete')) {
      selectNode(mountEl, nodeEl.dataset.id);
      return;
    }
    const deleteBtn = e.target.closest('.flow-node-delete');
    if (deleteBtn) {
      removeNode(deleteBtn.dataset.id);
      refreshCanvas(mountEl);
    }
  });

  mountEl.querySelector('.close-step-picker')?.addEventListener('click', () => closeStepPicker(mountEl));
  mountEl.querySelector('#stepPickerModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'stepPickerModal') closeStepPicker(mountEl);
  });

  mountEl.querySelectorAll('.step-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = JSON.parse(btn.dataset.step);
      insertStep(step);
      closeStepPicker(mountEl);
      refreshCanvas(mountEl);
    });
  });

  mountEl.querySelectorAll('.rollback-version').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const version = Number(btn.dataset.version);
      const result = await rollbackWorkflow(builderState.workflow.id, version, false);
      if (result.error) { showToast(result.error, 'error'); return; }
      builderState.workflow = result.item;
      builderState.nodes = JSON.parse(JSON.stringify(result.item.nodes));
      showToast(`Restored v${version} as draft`, 'success');
      mountEl.innerHTML = buildBuilderMarkup();
      bindBuilderEvents(mountEl);
      builderState.onSave?.();
    });
  });
}

function openStepPicker(mountEl) {
  mountEl.querySelector('#stepPickerModal')?.classList.add('open');
}

function closeStepPicker(mountEl) {
  mountEl.querySelector('#stepPickerModal')?.classList.remove('open');
  builderState.insertAtIndex = null;
}

function insertStep(stepDef) {
  const node = createNodeFromStep(stepDef);
  const index = builderState.insertAtIndex ?? builderState.nodes.length;
  builderState.nodes.splice(index, 0, node);
  builderState.selectedNodeId = node.id;
}

function removeNode(nodeId) {
  builderState.nodes = builderState.nodes.filter((n) => n.id !== nodeId);
  if (builderState.selectedNodeId === nodeId) builderState.selectedNodeId = null;
}

function selectNode(mountEl, nodeId) {
  builderState.selectedNodeId = nodeId;
  mountEl.querySelectorAll('.flow-node').forEach((el) => {
    el.classList.toggle('selected', el.dataset.id === nodeId);
  });
  const node = builderState.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  renderSidePanel(mountEl, node);
}

function renderSidePanel(mountEl, node) {
  const panel = mountEl.querySelector('#builderSidePanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="side-panel-content">
      <div class="side-panel-header">
        <div class="side-panel-icon" style="background:${TYPE_COLORS[node.type]}20;color:${TYPE_COLORS[node.type]}">
          <i class="${escapeHtml(node.icon)}"></i>
        </div>
        <div>
          <span class="side-panel-type">${TYPE_LABELS[node.type]}</span>
          <input type="text" class="side-panel-label" id="sidePanelLabel" value="${escapeAttr(node.label)}" />
        </div>
      </div>
      <div class="side-panel-form">
        ${buildConfigForm(node)}
      </div>
      <button class="btn btn-primary btn-sm" type="button" id="applyNodeConfig" style="width:100%;margin-top:16px;">
        <i class="fa-solid fa-check"></i> Apply Changes
      </button>
    </div>`;

  panel.querySelector('#applyNodeConfig')?.addEventListener('click', () => {
    node.label = panel.querySelector('#sidePanelLabel')?.value || node.label;
    node.config = readConfigFromForm(node);
    showToast('Step updated', 'success');
    refreshCanvas(mountEl);
    selectNode(mountEl, node.id);
  });
}

function refreshCanvas(mountEl) {
  const canvas = mountEl.querySelector('#builderCanvas');
  if (canvas) canvas.innerHTML = renderFlowCanvas();
  bindCanvasAddButtons(mountEl);
}

function bindCanvasAddButtons(mountEl) {
  mountEl.querySelector('.add-first-step')?.addEventListener('click', () => {
    builderState.insertAtIndex = 0;
    openStepPicker(mountEl);
  });
}

async function saveDraft() {
  const name = builderState.workflow.name;
  const result = await updateWorkflow(builderState.workflow.id, {
    name,
    nodes: builderState.nodes,
  });
  if (result.error) { showToast(result.error, 'error'); return; }
  builderState.workflow = result.item;
  showToast('Draft saved', 'success');
  builderState.onSave?.();
}

async function publishDraft() {
  await saveDraft();
  const result = await publishWorkflow(builderState.workflow.id);
  if (result.error) { showToast(result.error, 'error'); return; }
  builderState.workflow = result.item;
  showToast(`Published as v${result.version}`, 'success');
  builderState.onSave?.();
}

