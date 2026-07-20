import { state, setState } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  showToast,
  statusBadge,
  formatNumber,
} from '../ui.js';
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  duplicateAgent,
} from '../services/agents.js';
import { provisionAgentWorkspace, fetchSupervisorReviews } from '../api.js';
import { withTimeout } from '../utils.js';
import { DEMO_AGENTS, DEMO_COMPANIES } from '../demo-data.js';
import { listCompanies } from '../services/companies.js';

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
const WIZARD_STEPS = 7;

const ROLES = [
  { value: 'sales_consultant', label: 'Sales Consultant', icon: '🚗' },
  { value: 'customer_support', label: 'Customer Support', icon: '🎧' },
  { value: 'technical_support', label: 'Technical Support', icon: '🛠' },
  { value: 'accounts_assistant', label: 'Accounts Assistant', icon: '💰' },
  { value: 'receptionist', label: 'Receptionist', icon: '📅' },
  { value: 'hr_assistant', label: 'HR Assistant', icon: '👨‍💼' },
  { value: 'legal_assistant', label: 'Legal Assistant', icon: '⚖' },
  { value: 'marketing_assistant', label: 'Marketing Assistant', icon: '📣' },
  { value: 'security_advisor', label: 'Security Advisor', icon: '🛡️' },
  { value: 'compassion_counselor', label: 'Compassion Counselor', icon: '💐' },
];

const PERSONALITIES = [
  { value: 'friendly', label: 'Friendly', desc: 'Warm, approachable, and conversational' },
  { value: 'professional', label: 'Professional', desc: 'Polished, clear, and business-focused' },
  { value: 'luxury_brand', label: 'Luxury Brand', desc: 'Refined tone for premium clients' },
  { value: 'corporate', label: 'Corporate', desc: 'Structured and enterprise-ready' },
  { value: 'funny', label: 'Funny', desc: 'Light humour with helpful answers' },
  { value: 'formal', label: 'Formal', desc: 'Respectful and protocol-driven' },
  { value: 'empathetic', label: 'Empathetic', desc: 'Sensitive and supportive' },
  { value: 'sales_driven', label: 'Sales Driven', desc: 'Goal-oriented with gentle persuasion' },
];

const KNOWLEDGE_OPTIONS = [
  { key: 'pdfs', label: 'Upload PDFs', icon: 'fa-file-pdf' },
  { key: 'docx', label: 'Upload DOCX', icon: 'fa-file-word' },
  { key: 'faqs', label: 'FAQs', icon: 'fa-circle-question' },
  { key: 'websiteUrl', label: 'Website URL', icon: 'fa-globe' },
  { key: 'manualKnowledge', label: 'Manual Knowledge', icon: 'fa-book' },
  { key: 'policies', label: 'Policies', icon: 'fa-shield-halved' },
  { key: 'products', label: 'Products', icon: 'fa-box' },
  { key: 'services', label: 'Services', icon: 'fa-briefcase' },
];

const CHANNEL_OPTIONS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { key: 'websiteChat', label: 'Website Chat', icon: 'fa-comments' },
  { key: 'facebookMessenger', label: 'Facebook Messenger', icon: 'fa-brands fa-facebook-messenger' },
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
  { key: 'telegram', label: 'Telegram', icon: 'fa-brands fa-telegram' },
  { key: 'email', label: 'Email', icon: 'fa-envelope' },
];

const AVATAR_PRESETS = ['🤖', '👩‍💼', '👨‍💼', '🧑‍💻', '💼', '🎯', '✨', '🦊', '🛡️', '📣', '💐', '📅'];

let filters = { search: '', company: '', role: '', status: '' };
let wizardStep = 1;

export async function renderAgents(container) {
  container.innerHTML = loadingState('Loading AI employees...');

  const [agentsRes, companiesRes] = await Promise.all([
    withTimeout(listAgents()),
    withTimeout(listCompanies()),
  ]);

  let agents = agentsRes.items?.length ? agentsRes.items : DEMO_AGENTS;
  if (!agents.length) agents = DEMO_AGENTS;
  const companies = companiesRes.items?.length ? companiesRes.items : (state.companies?.length ? state.companies : DEMO_COMPANIES);
  setState({ agents, companies });

  const companyId = state.selectedCompanyId || companies[0]?.id || null;
  let supervisor = null;
  if (companyId) {
    const supRes = await withTimeout(fetchSupervisorReviews(companyId, 5));
    if (!supRes.error && supRes.data) supervisor = supRes.data;
  }

  container.innerHTML = buildListMarkup(agents, companies, agentsRes.isDemo, supervisor);
  bindListEvents(container, agents, companies);
}

function roleLabel(agent) {
  if (agent.roleLabel) return agent.roleLabel;
  const match = ROLES.find((r) => r.value === agent.role);
  return match?.label || agent.role || '—';
}

function companyName(companyId, companies) {
  return companies.find((c) => c.id === companyId)?.name || '—';
}

function applyFilters(agents, companies) {
  const term = filters.search.toLowerCase();
  return agents.filter((a) => {
    const coName = companyName(a.companyId, companies);
    const matchesSearch = !term || [
      a.name, coName, roleLabel(a), a.department, a.model,
    ].some((v) => String(v || '').toLowerCase().includes(term));
    const matchesCompany = !filters.company || a.companyId === filters.company;
    const matchesRole = !filters.role || a.role === filters.role;
    const matchesStatus = !filters.status || a.status === filters.status;
    return matchesSearch && matchesCompany && matchesRole && matchesStatus;
  });
}

function employeeAvatar(agent) {
  if (agent.avatarUrl) {
    return `<img src="${escapeHtml(agent.avatarUrl)}" alt="" class="employee-avatar-img" />`;
  }
  if (agent.avatar) {
    return `<span class="employee-avatar-emoji">${escapeHtml(agent.avatar)}</span>`;
  }
  const initials = String(agent.name || '?').slice(0, 2).toUpperCase();
  return `<span class="employee-avatar-initials">${escapeHtml(initials)}</span>`;
}

function whatsappBadge(agent) {
  const connected = agent.whatsappConnected && agent.channels?.whatsapp !== false;
  if (connected) {
    return '<span class="status-badge active"><i class="fa-brands fa-whatsapp"></i> Connected</span>';
  }
  return '<span class="status-badge inactive">Not connected</span>';
}

function actionMenu(agent) {
  const isActive = agent.status === 'active';
  return `
    <div class="action-menu" data-stop-propagation="true">
      <button class="btn btn-icon action-menu-trigger" type="button" data-id="${escapeHtml(agent.id)}" aria-label="Actions for ${escapeHtml(agent.name)}" aria-haspopup="true">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <div class="action-menu-dropdown" role="menu">
        <button class="action-menu-item edit-employee" type="button" data-id="${escapeHtml(agent.id)}" role="menuitem">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button class="action-menu-item duplicate-employee" type="button" data-id="${escapeHtml(agent.id)}" role="menuitem">
          <i class="fa-solid fa-copy"></i> Duplicate
        </button>
        ${isActive
          ? `<button class="action-menu-item deactivate-employee" type="button" data-id="${escapeHtml(agent.id)}" role="menuitem">
              <i class="fa-solid fa-pause"></i> Deactivate
            </button>`
          : `<button class="action-menu-item activate-employee" type="button" data-id="${escapeHtml(agent.id)}" role="menuitem">
              <i class="fa-solid fa-play"></i> Activate
            </button>`}
        <button class="action-menu-item danger delete-employee" type="button" data-id="${escapeHtml(agent.id)}" role="menuitem">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `;
}

function renderRow(agent, companies) {
  return `
    <tr data-id="${escapeHtml(agent.id)}">
      <td>
        <div class="org-name">
          <div class="avatar employee-table-avatar">${employeeAvatar(agent)}</div>
          <div class="company-name-text">${escapeHtml(agent.name)}</div>
        </div>
      </td>
      <td>${escapeHtml(companyName(agent.companyId, companies))}</td>
      <td>${escapeHtml(roleLabel(agent))}</td>
      <td><span class="model-tag">${escapeHtml(agent.model || 'gpt-4o-mini')}</span></td>
      <td>${whatsappBadge(agent)}</td>
      <td>${statusBadge(agent.status === 'training' ? 'inactive' : agent.status)}</td>
      <td>${formatNumber(agent.conversations || 0)}</td>
      <td class="col-actions">${actionMenu(agent)}</td>
    </tr>
  `;
}

function renderTable(agents, companies) {
  return `
    <div class="table-container employees-table-wrap">
      <table class="org-table employees-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Role</th>
            <th>Model</th>
            <th>WhatsApp</th>
            <th>Status</th>
            <th>Conversations</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>${agents.map((a) => renderRow(a, companies)).join('')}</tbody>
      </table>
      <div class="table-footer">
        <div class="info">${agents.length} AI employee${agents.length === 1 ? '' : 's'}</div>
      </div>
    </div>
  `;
}

function buildSupervisorPanel(supervisor) {
  const summary = supervisor?.summary;
  const reviews = supervisor?.items || [];
  const avg = summary?.avgScore;
  const demoHint = !reviews.length
    ? '<p class="text-muted supervisor-hint">Send a WhatsApp message to generate supervisor reviews. The AI Supervisor scores reply quality after each conversation turn.</p>'
    : '';

  return `
    <section class="supervisor-panel">
      <div class="supervisor-panel-head">
        <div>
          <h3><i class="fa-solid fa-user-shield"></i> AI Supervisor</h3>
          <p class="text-muted">Watches conversations, scores quality, and suggests prompt improvements.</p>
        </div>
        ${avg != null ? `<div class="supervisor-score-badge" data-grade="${reviews[0]?.grade || 'good'}">${avg}<span>/100 avg</span></div>` : ''}
      </div>
      ${demoHint}
      ${reviews.length ? `
        <div class="supervisor-reviews">
          ${reviews.slice(0, 3).map((r) => `
            <div class="supervisor-review-card">
              <div class="review-meta">
                <span class="review-score">${r.qualityScore}</span>
                <span class="review-grade ${escapeHtml(r.grade)}">${escapeHtml(r.grade?.replace('_', ' ') || '')}</span>
                <span class="text-muted">${escapeHtml(String(r.phone || '').slice(-4) ? `···${String(r.phone).slice(-4)}` : 'Recent')}</span>
              </div>
              ${(r.recommendations || []).slice(0, 1).map((rec) => `<p class="review-rec"><i class="fa-solid fa-lightbulb"></i> ${escapeHtml(rec)}</p>`).join('')}
            </div>`).join('')}
        </div>` : ''}
    </section>`;
}

function buildListMarkup(agents, companies, isDemo, supervisor = null) {
  const filtered = applyFilters(agents, companies);
  const companyOptions = companies.length
    ? companies
    : [...new Map(agents.map((a) => [a.companyId, { id: a.companyId, name: companyName(a.companyId, companies) }])).values()];

  return `
    ${pageHeader(
      'AI Employees',
      'Create named AI team members — not chatbots, but dedicated digital employees for each company.',
      `<button class="btn btn-primary btn-sm" type="button" id="openEmployeeWizard">
        <i class="fa-solid fa-plus"></i> Create AI Employee
      </button>`
    )}
    ${isDemo ? `<div class="demo-banner"><i class="fa-solid fa-flask"></i> Showing demo data — Firestore unavailable or empty. Changes persist locally.</div>` : ''}

    ${buildSupervisorPanel(supervisor)}

    <div class="companies-toolbar table-toolbar">
      <div class="search-wrapper">
        <span class="search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="text" placeholder="Search by name, company, or role..." id="employeeSearch" value="${escapeHtml(filters.search)}" />
      </div>
      <div class="filter-group">
        <select id="employeeCompanyFilter" aria-label="Filter by company">
          <option value="">All Companies</option>
          ${companyOptions.map((c) => `<option value="${escapeHtml(c.id)}" ${filters.company === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <select id="employeeRoleFilter" aria-label="Filter by role">
          <option value="">All Roles</option>
          ${ROLES.map((r) => `<option value="${escapeHtml(r.value)}" ${filters.role === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
        </select>
        <select id="employeeStatusFilter" aria-label="Filter by status">
          <option value="">All Statuses</option>
          <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>

    <div id="employeesContent">
      ${filtered.length
        ? renderTable(filtered, companies)
        : emptyState('No AI employees match your filters.', '<button class="btn btn-primary btn-sm" type="button" id="clearEmployeeFilters">Clear filters</button>')}
    </div>

    ${buildWizardSlideOver(companies)}
  `;
}

function buildWizardSlideOver(companies) {
  const companyOptions = companies.length ? companies : [];

  return `
    <div class="slide-over employee-wizard-slide" id="employeeWizardPanel">
      <div class="slide-header">
        <div class="title-group">
          <h2 id="employeeWizardTitle">Create AI Employee</h2>
          <div class="sub" id="employeeWizardSubtitle">Step <span id="wizardStepNum">1</span> of ${WIZARD_STEPS}</div>
        </div>
        <button class="close-btn" type="button" id="closeEmployeeWizard" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="wizard-progress-bar">
        <div class="wizard-progress-fill" id="wizardProgressFill" style="width:${100 / WIZARD_STEPS}%"></div>
      </div>

      <div class="slide-body employee-wizard-body">
        <input type="hidden" id="employeeEditId" />

        <div class="wizard-step active" data-step="1">
          <h3>Basic Details</h3>
          <p class="step-desc">Give your AI employee a name, role, and company assignment.</p>
          <div class="form-group">
            <label for="empName">Employee Name *</label>
            <input type="text" id="empName" placeholder="e.g. Sarah" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="empDepartment">Department</label>
              <input type="text" id="empDepartment" placeholder="e.g. Sales" />
            </div>
            <div class="form-group">
              <label for="empCompany">Company *</label>
              <select id="empCompany">
                <option value="">— Select company —</option>
                ${companyOptions.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Role *</label>
            <div class="role-cards" id="empRoleCards">
              ${ROLES.map((r) => `
                <label class="role-card">
                  <input type="radio" name="empRole" value="${escapeHtml(r.value)}" data-label="${escapeHtml(r.label)}" />
                  <span class="role-card-inner">
                    <span class="role-icon">${r.icon}</span>
                    <span class="role-label">${escapeHtml(r.label)}</span>
                  </span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label for="empAvatarUrl">Profile Picture URL</label>
            <input type="url" id="empAvatarUrl" placeholder="https://..." />
          </div>
          <div class="form-group">
            <label>Avatar</label>
            <div class="avatar-picker" id="empAvatarPicker">
              ${AVATAR_PRESETS.map((emoji, i) => `
                <button type="button" class="avatar-preset ${i === 0 ? 'selected' : ''}" data-avatar="${escapeHtml(emoji)}">${emoji}</button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="wizard-step" data-step="2">
          <h3>Personality</h3>
          <p class="step-desc">Choose how your AI employee communicates with customers.</p>
          <div class="personality-cards" id="empPersonalityCards">
            ${PERSONALITIES.map((p, i) => `
              <label class="personality-card">
                <input type="radio" name="empPersonality" value="${escapeHtml(p.value)}" ${i === 1 ? 'checked' : ''} />
                <span class="personality-card-inner">
                  <span class="personality-label">${escapeHtml(p.label)}</span>
                  <span class="personality-desc">${escapeHtml(p.desc)}</span>
                </span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="wizard-step" data-step="3">
          <h3>Knowledge Sources</h3>
          <p class="step-desc">Select knowledge sources for this employee. File uploads connect to the knowledge service later.</p>
          <div class="checkbox-grid">
            ${KNOWLEDGE_OPTIONS.map((k) => `
              <label class="form-check knowledge-check">
                <span class="checkbox-label">
                  <input type="checkbox" name="empKnowledge" value="${escapeHtml(k.key)}" ${['pdfs', 'faqs', 'manualKnowledge', 'products', 'services'].includes(k.key) ? 'checked' : ''} />
                  <i class="fa-solid ${k.icon}"></i> ${escapeHtml(k.label)}
                </span>
              </label>
            `).join('')}
          </div>
          <div class="upload-placeholder">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <p>Drag & drop PDFs or DOCX here</p>
            <small>Upload integration coming soon</small>
          </div>
        </div>

        <div class="wizard-step" data-step="4">
          <h3>Channels</h3>
          <p class="step-desc">Choose where this AI employee can interact with customers.</p>
          <div class="checkbox-grid channel-grid">
            ${CHANNEL_OPTIONS.map((c) => `
              <label class="form-check channel-check">
                <span class="checkbox-label">
                  <input type="checkbox" name="empChannel" value="${escapeHtml(c.key)}" ${c.key === 'whatsapp' ? 'checked' : ''} />
                  <i class="${c.icon}"></i> ${escapeHtml(c.label)}
                </span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="wizard-step" data-step="5">
          <h3>OpenAI Configuration</h3>
          <p class="step-desc">Fine-tune the AI model behaviour for this employee.</p>
          <div class="form-row">
            <div class="form-group">
              <label for="empModel">Model</label>
              <select id="empModel">
                ${MODELS.map((m) => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="empReasoning">Reasoning Level</label>
              <select id="empReasoning">
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="empTemperature">Temperature: <span id="empTempValue">0.7</span></label>
            <input type="range" id="empTemperature" min="0" max="1" step="0.1" value="0.7" class="range-slider" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="empMaxTokens">Max Tokens</label>
              <input type="number" id="empMaxTokens" min="256" max="8192" step="256" value="1024" />
            </div>
            <div class="form-group form-check memory-toggle">
              <label class="checkbox-label">
                <input type="checkbox" id="empMemory" checked />
                <span>Enable conversation memory</span>
              </label>
            </div>
          </div>
        </div>

        <div class="wizard-step" data-step="6">
          <h3>Behaviour</h3>
          <p class="step-desc">Define greetings, fallbacks, and escalation rules.</p>
          <div class="form-group">
            <label for="empGreeting">Greeting Message</label>
            <textarea id="empGreeting" rows="3" placeholder="Hi! I'm Sarah from Central Motors. How can I help you today?"></textarea>
          </div>
          <div class="form-group">
            <label for="empFallback">Fallback Message</label>
            <textarea id="empFallback" rows="2" placeholder="I'm not sure about that — let me connect you with a team member."></textarea>
          </div>
          <div class="form-row">
            <div class="form-group form-check">
              <label class="checkbox-label">
                <input type="checkbox" id="empHumanTakeover" checked />
                <span>Human Takeover</span>
              </label>
            </div>
            <div class="form-group">
              <label for="empOfficeHours">Office Hours</label>
              <input type="text" id="empOfficeHours" value="Mon–Fri 08:00–17:00" placeholder="Mon–Fri 08:00–17:00" />
            </div>
          </div>
          <div class="form-group">
            <label for="empEscalation">Escalation Rules</label>
            <textarea id="empEscalation" rows="3" placeholder="Escalate when customer requests pricing approval or speaks to a manager."></textarea>
          </div>
        </div>

        <div class="wizard-step" data-step="7">
          <h3>Preview</h3>
          <p class="step-desc">Chat with your AI employee before saving — responses are simulated from personality and greeting settings.</p>
          <div class="preview-chat" id="previewChat">
            <div class="preview-chat-header">
              <div class="preview-avatar" id="previewAvatar">🤖</div>
              <div>
                <div class="preview-name" id="previewName">Sarah</div>
                <div class="preview-role" id="previewRole">Sales Consultant</div>
              </div>
            </div>
            <div class="preview-messages" id="previewMessages"></div>
            <div class="preview-compose">
              <input type="text" id="previewInput" placeholder="Type a test message..." />
              <button class="btn btn-primary btn-sm" type="button" id="previewSendBtn"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
          </div>
        </div>
      </div>

      <div class="slide-footer employee-wizard-footer">
        <button class="btn btn-secondary" type="button" id="wizardBackBtn" disabled><i class="fa-solid fa-arrow-left"></i> Back</button>
        <div class="btn-group">
          <button class="btn btn-secondary" type="button" id="wizardCancelBtn">Cancel</button>
          <button class="btn btn-primary" type="button" id="wizardNextBtn">Next <i class="fa-solid fa-arrow-right"></i></button>
          <button class="btn btn-success hidden" type="button" id="wizardSaveBtn"><i class="fa-solid fa-check"></i> Save AI Employee</button>
        </div>
      </div>
    </div>
  `;
}

function bindListEvents(container, agents, companies) {
  const panel = container.querySelector('#employeeWizardPanel');
  const backdrop = document.getElementById('overlay');

  const openWizard = () => {
    panel?.classList.add('open');
    backdrop?.classList.add('open');
  };

  const closeWizard = () => {
    panel?.classList.remove('open');
    backdrop?.classList.remove('open');
    wizardStep = 1;
    updateWizardStep(container);
  };

  container.querySelector('#openEmployeeWizard')?.addEventListener('click', () => {
    resetWizardForm(container, companies);
    container.querySelector('#employeeWizardTitle').textContent = 'Create AI Employee';
    container.querySelector('#employeeEditId').value = '';
    openWizard();
    seedPreviewChat(container);
  });

  container.querySelector('#closeEmployeeWizard')?.addEventListener('click', closeWizard);
  container.querySelector('#wizardCancelBtn')?.addEventListener('click', closeWizard);

  container.querySelector('#employeeSearch')?.addEventListener('input', (e) => {
    filters.search = e.target.value;
    refreshContent(container, agents, companies);
  });

  container.querySelector('#employeeCompanyFilter')?.addEventListener('change', (e) => {
    filters.company = e.target.value;
    refreshContent(container, agents, companies);
  });

  container.querySelector('#employeeRoleFilter')?.addEventListener('change', (e) => {
    filters.role = e.target.value;
    refreshContent(container, agents, companies);
  });

  container.querySelector('#employeeStatusFilter')?.addEventListener('change', (e) => {
    filters.status = e.target.value;
    refreshContent(container, agents, companies);
  });

  container.querySelector('#clearEmployeeFilters')?.addEventListener('click', () => {
    filters = { search: '', company: '', role: '', status: '' };
    const search = container.querySelector('#employeeSearch');
    if (search) search.value = '';
    ['employeeCompanyFilter', 'employeeRoleFilter', 'employeeStatusFilter'].forEach((id) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.value = '';
    });
    refreshContent(container, agents, companies);
  });

  bindWizardEvents(container, { closeWizard, openWizard, agents, companies });
  bindDelegatedActions(container, { openWizard, agents, companies });
  bindDropdownClose(container);
}

function refreshContent(container, agents, companies) {
  const filtered = applyFilters(agents, companies);
  const content = container.querySelector('#employeesContent');
  if (!content) return;
  content.innerHTML = filtered.length
    ? renderTable(filtered, companies)
    : emptyState('No AI employees match your filters.', '<button class="btn btn-primary btn-sm" type="button" id="clearEmployeeFilters">Clear filters</button>');

  container.querySelector('#clearEmployeeFilters')?.addEventListener('click', () => {
    filters = { search: '', company: '', role: '', status: '' };
    refreshContent(container, agents, companies);
  });
}

function bindWizardEvents(container, { closeWizard, agents, companies }) {
  const tempSlider = container.querySelector('#empTemperature');
  const tempValue = container.querySelector('#empTempValue');
  tempSlider?.addEventListener('input', (e) => {
    if (tempValue) tempValue.textContent = e.target.value;
  });

  container.querySelector('#empAvatarPicker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.avatar-preset');
    if (!btn) return;
    container.querySelectorAll('.avatar-preset').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    updatePreviewHeader(container);
  });

  ['empName', 'empDepartment'].forEach((id) => {
    container.querySelector(`#${id}`)?.addEventListener('input', () => updatePreviewHeader(container));
  });

  container.querySelectorAll('input[name="empRole"]').forEach((input) => {
    input.addEventListener('change', () => updatePreviewHeader(container));
  });

  container.querySelector('#wizardBackBtn')?.addEventListener('click', () => {
    if (wizardStep > 1) {
      wizardStep -= 1;
      updateWizardStep(container);
    }
  });

  container.querySelector('#wizardNextBtn')?.addEventListener('click', () => {
    if (!validateStep(container, wizardStep)) return;
    if (wizardStep < WIZARD_STEPS) {
      wizardStep += 1;
      updateWizardStep(container);
      if (wizardStep === WIZARD_STEPS) seedPreviewChat(container);
    }
  });

  container.querySelector('#wizardSaveBtn')?.addEventListener('click', () => saveEmployee(container, closeWizard, agents, companies));

  container.querySelector('#previewSendBtn')?.addEventListener('click', () => sendPreviewMessage(container));
  container.querySelector('#previewInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendPreviewMessage(container);
  });
}

function validateStep(container, step) {
  if (step === 1) {
    const name = container.querySelector('#empName')?.value.trim();
    const company = container.querySelector('#empCompany')?.value;
    const role = container.querySelector('input[name="empRole"]:checked');
    if (!name) {
      showToast('Employee name is required', 'warning');
      return false;
    }
    if (!company) {
      showToast('Please select a company', 'warning');
      return false;
    }
    if (!role) {
      showToast('Please select a role', 'warning');
      return false;
    }
  }
  return true;
}

function updateWizardStep(container) {
  container.querySelectorAll('.wizard-step').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.step) === wizardStep);
  });

  const stepNum = container.querySelector('#wizardStepNum');
  if (stepNum) stepNum.textContent = String(wizardStep);

  const fill = container.querySelector('#wizardProgressFill');
  if (fill) fill.style.width = `${(wizardStep / WIZARD_STEPS) * 100}%`;

  const backBtn = container.querySelector('#wizardBackBtn');
  const nextBtn = container.querySelector('#wizardNextBtn');
  const saveBtn = container.querySelector('#wizardSaveBtn');
  if (backBtn) backBtn.disabled = wizardStep === 1;
  if (nextBtn) nextBtn.classList.toggle('hidden', wizardStep === WIZARD_STEPS);
  if (saveBtn) saveBtn.classList.toggle('hidden', wizardStep !== WIZARD_STEPS);
}

function resetWizardForm(container, companies) {
  wizardStep = 1;
  updateWizardStep(container);
  container.querySelector('#employeeEditId').value = '';
  container.querySelector('#empName').value = '';
  container.querySelector('#empDepartment').value = '';
  container.querySelector('#empCompany').value = companies[0]?.id || '';
  container.querySelector('#empAvatarUrl').value = '';
  container.querySelectorAll('input[name="empRole"]').forEach((r, i) => { r.checked = i === 0; });
  container.querySelectorAll('.avatar-preset').forEach((b, i) => b.classList.toggle('selected', i === 0));
  container.querySelectorAll('input[name="empPersonality"]').forEach((r, i) => { r.checked = i === 1; });
  container.querySelector('#empModel').value = 'gpt-4o-mini';
  container.querySelector('#empReasoning').value = 'standard';
  container.querySelector('#empTemperature').value = '0.7';
  container.querySelector('#empTempValue').textContent = '0.7';
  container.querySelector('#empMaxTokens').value = '1024';
  container.querySelector('#empMemory').checked = true;
  container.querySelector('#empGreeting').value = '';
  container.querySelector('#empFallback').value = '';
  container.querySelector('#empHumanTakeover').checked = true;
  container.querySelector('#empOfficeHours').value = 'Mon–Fri 08:00–17:00';
  container.querySelector('#empEscalation').value = '';
  container.querySelectorAll('input[name="empKnowledge"]').forEach((cb) => {
    cb.checked = ['pdfs', 'faqs', 'manualKnowledge', 'products', 'services'].includes(cb.value);
  });
  container.querySelectorAll('input[name="empChannel"]').forEach((cb) => {
    cb.checked = cb.value === 'whatsapp';
  });
  const previewMessages = container.querySelector('#previewMessages');
  if (previewMessages) previewMessages.innerHTML = '';
}

function populateWizardForm(container, agent) {
  resetWizardForm(container, state.companies);
  container.querySelector('#employeeEditId').value = agent.id;
  container.querySelector('#employeeWizardTitle').textContent = 'Edit AI Employee';
  container.querySelector('#empName').value = agent.name || '';
  container.querySelector('#empDepartment').value = agent.department || '';
  container.querySelector('#empCompany').value = agent.companyId || '';
  container.querySelector('#empAvatarUrl').value = agent.avatarUrl || '';

  const roleInput = container.querySelector(`input[name="empRole"][value="${agent.role}"]`);
  if (roleInput) roleInput.checked = true;

  container.querySelectorAll('.avatar-preset').forEach((b) => {
    b.classList.toggle('selected', b.dataset.avatar === agent.avatar);
  });

  const personalityInput = container.querySelector(`input[name="empPersonality"][value="${agent.personality}"]`);
  if (personalityInput) personalityInput.checked = true;

  Object.entries(agent.knowledgeSources || {}).forEach(([key, val]) => {
    const cb = container.querySelector(`input[name="empKnowledge"][value="${key}"]`);
    if (cb) cb.checked = Boolean(val);
  });

  Object.entries(agent.channels || {}).forEach(([key, val]) => {
    const cb = container.querySelector(`input[name="empChannel"][value="${key}"]`);
    if (cb) cb.checked = Boolean(val);
  });

  container.querySelector('#empModel').value = agent.model || 'gpt-4o-mini';
  container.querySelector('#empReasoning').value = agent.reasoningLevel || 'standard';
  container.querySelector('#empTemperature').value = agent.temperature ?? 0.7;
  container.querySelector('#empTempValue').textContent = String(agent.temperature ?? 0.7);
  container.querySelector('#empMaxTokens').value = agent.maxTokens ?? 1024;
  container.querySelector('#empMemory').checked = agent.memory !== false;
  container.querySelector('#empGreeting').value = agent.greetingMessage || '';
  container.querySelector('#empFallback').value = agent.fallbackMessage || '';
  container.querySelector('#empHumanTakeover').checked = agent.humanTakeover !== false;
  container.querySelector('#empOfficeHours').value = agent.officeHours || 'Mon–Fri 08:00–17:00';
  container.querySelector('#empEscalation').value = agent.escalationRules || '';
}

function collectFormPayload(container) {
  const roleInput = container.querySelector('input[name="empRole"]:checked');
  const personalityInput = container.querySelector('input[name="empPersonality"]:checked');
  const selectedAvatar = container.querySelector('.avatar-preset.selected');

  const knowledgeSources = {};
  container.querySelectorAll('input[name="empKnowledge"]:checked').forEach((cb) => {
    knowledgeSources[cb.value] = true;
  });
  KNOWLEDGE_OPTIONS.forEach((k) => {
    if (knowledgeSources[k.key] === undefined) knowledgeSources[k.key] = false;
  });

  const channels = {};
  container.querySelectorAll('input[name="empChannel"]:checked').forEach((cb) => {
    channels[cb.value] = true;
  });
  CHANNEL_OPTIONS.forEach((c) => {
    if (channels[c.key] === undefined) channels[c.key] = false;
  });

  const companyId = container.querySelector('#empCompany').value;
  const company = state.companies.find((c) => c.id === companyId);

  return {
    companyId,
    name: container.querySelector('#empName').value.trim(),
    department: container.querySelector('#empDepartment').value.trim(),
    role: roleInput?.value || 'customer_support',
    roleLabel: roleInput?.dataset?.label || '',
    avatar: selectedAvatar?.dataset?.avatar || '🤖',
    avatarUrl: container.querySelector('#empAvatarUrl').value.trim(),
    personality: personalityInput?.value || 'professional',
    knowledgeSources,
    channels,
    model: container.querySelector('#empModel').value,
    temperature: Number(container.querySelector('#empTemperature').value),
    maxTokens: Number(container.querySelector('#empMaxTokens').value) || 1024,
    memory: container.querySelector('#empMemory').checked,
    reasoningLevel: container.querySelector('#empReasoning').value,
    greetingMessage: container.querySelector('#empGreeting').value.trim(),
    fallbackMessage: container.querySelector('#empFallback').value.trim(),
    humanTakeover: container.querySelector('#empHumanTakeover').checked,
    officeHours: container.querySelector('#empOfficeHours').value.trim(),
    escalationRules: container.querySelector('#empEscalation').value.trim(),
    whatsappNumber: company?.whatsappNumber || '',
    whatsappConnected: Boolean(channels.whatsapp && company?.whatsappConnected),
    status: 'active',
  };
}

async function saveEmployee(container, closeWizard, agents, companies) {
  const id = container.querySelector('#employeeEditId').value;
  const payload = collectFormPayload(container);

  if (!payload.name) {
    showToast('Employee name is required', 'warning');
    return;
  }

  const existing = id ? agents.find((a) => a.id === id) : null;
  if (existing?.conversations) payload.conversations = existing.conversations;

  const result = id ? await updateAgent(id, payload) : await createAgent(payload);
  if (result.error) {
    showToast(result.error, 'error');
    return;
  }

  const agentId = id || result.id || result.item?.id;
  if (agentId && !id) {
    const company = companies.find((c) => c.id === payload.companyId);
    const provision = await provisionAgentWorkspace(payload.companyId, agentId, {
      ...payload,
      companyName: company?.name,
    });
    if (!provision.error) {
      showToast('AI employee created — prompt, memory, inbox, and analytics ready', 'success');
    } else {
      showToast(`Employee saved; provisioning pending (${provision.error})`, 'warning');
    }
  } else {
    showToast(id ? 'AI employee updated' : 'AI employee created', 'success');
  }

  closeWizard();
  renderAgents(container);
}

function updatePreviewHeader(container) {
  const name = container.querySelector('#empName')?.value.trim() || 'Sarah';
  const roleInput = container.querySelector('input[name="empRole"]:checked');
  const role = roleInput?.dataset?.label || 'Sales Consultant';
  const avatar = container.querySelector('.avatar-preset.selected')?.dataset?.avatar || '🤖';

  const nameEl = container.querySelector('#previewName');
  const roleEl = container.querySelector('#previewRole');
  const avatarEl = container.querySelector('#previewAvatar');
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;
  if (avatarEl) avatarEl.textContent = avatar;
}

function seedPreviewChat(container) {
  updatePreviewHeader(container);
  const messages = container.querySelector('#previewMessages');
  if (!messages) return;
  messages.innerHTML = '';
  const greeting = container.querySelector('#empGreeting')?.value.trim()
    || `Hi! I'm ${container.querySelector('#empName')?.value.trim() || 'your AI employee'}. How can I help you today?`;
  appendPreviewBubble(container, 'ai', greeting);
}

function appendPreviewBubble(container, role, text) {
  const messages = container.querySelector('#previewMessages');
  if (!messages) return;
  const bubble = document.createElement('div');
  bubble.className = `preview-bubble ${role}`;
  bubble.innerHTML = `
    <div class="bubble-label">${role === 'ai' ? 'AI Employee' : 'You'}</div>
    <div>${escapeHtml(text)}</div>
  `;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function mockPreviewResponse(container, userMessage) {
  const personality = container.querySelector('input[name="empPersonality"]:checked')?.value || 'professional';
  const name = container.querySelector('#empName')?.value.trim() || 'I';
  const fallback = container.querySelector('#empFallback')?.value.trim();

  const lower = userMessage.toLowerCase();
  if (/hello|hi|hey|good (morning|day|afternoon)/.test(lower)) {
    const greetings = {
      friendly: `Hey there! ${name} here — great to hear from you! What can I help with?`,
      professional: `Good day. This is ${name}. How may I assist you?`,
      empathetic: `Hello, thank you for reaching out. I'm ${name}, and I'm here to help.`,
      sales_driven: `Hi! ${name} from the team — I'd love to help you find exactly what you need today.`,
      funny: `Hey! ${name} at your service — ask me anything (within reason)!`,
    };
    return greetings[personality] || `Hello! I'm ${name}. How can I help you today?`;
  }
  if (/price|cost|quote|how much/.test(lower)) {
    return personality === 'sales_driven'
      ? `Great question! I'd be happy to put together options for you. What product or service are you interested in?`
      : `I can help with pricing information. Could you tell me more about what you're looking for?`;
  }
  if (/thank|thanks/.test(lower)) {
    return `You're welcome! Is there anything else I can help you with?`;
  }
  return fallback || `Thanks for your message. Let me look into that for you — could you share a few more details?`;
}

function sendPreviewMessage(container) {
  const input = container.querySelector('#previewInput');
  const text = input?.value.trim();
  if (!text) return;
  appendPreviewBubble(container, 'customer', text);
  input.value = '';
  setTimeout(() => {
    appendPreviewBubble(container, 'ai', mockPreviewResponse(container, text));
  }, 400);
}

function bindDropdownClose(container) {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu')) {
      container.querySelectorAll('.action-menu.open').forEach((menu) => menu.classList.remove('open'));
    }
  });
}

function toggleDropdown(container, id) {
  container.querySelectorAll('.action-menu').forEach((menu) => {
    const trigger = menu.querySelector('.action-menu-trigger');
    if (trigger?.dataset.id === id) {
      const isOpen = menu.classList.contains('open');
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    } else {
      menu.classList.remove('open');
    }
  });
}

function bindDelegatedActions(container, { openWizard, agents, companies }) {
  if (container.dataset.employeeActionsBound) return;
  container.dataset.employeeActionsBound = '1';

  container.addEventListener('click', async (e) => {
    const trigger = e.target.closest('.action-menu-trigger');
    if (trigger) {
      e.stopPropagation();
      toggleDropdown(container, trigger.dataset.id);
      return;
    }

    const editBtn = e.target.closest('.edit-employee');
    const dupBtn = e.target.closest('.duplicate-employee');
    const deactivateBtn = e.target.closest('.deactivate-employee');
    const activateBtn = e.target.closest('.activate-employee');
    const deleteBtn = e.target.closest('.delete-employee');

    if (editBtn) {
      e.stopPropagation();
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      const agent = state.agents.find((a) => a.id === editBtn.dataset.id);
      if (agent) {
        populateWizardForm(container, agent);
        wizardStep = 1;
        updateWizardStep(container);
        openWizard();
        seedPreviewChat(container);
      }
      return;
    }

    if (dupBtn) {
      e.stopPropagation();
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      const result = await duplicateAgent(dupBtn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('AI employee duplicated', 'success');
      renderAgents(container);
      return;
    }

    if (deactivateBtn) {
      e.stopPropagation();
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      const agent = state.agents.find((a) => a.id === deactivateBtn.dataset.id);
      const result = await updateAgent(deactivateBtn.dataset.id, { ...agent, status: 'inactive' });
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('AI employee deactivated', 'warning');
      renderAgents(container);
      return;
    }

    if (activateBtn) {
      e.stopPropagation();
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      const agent = state.agents.find((a) => a.id === activateBtn.dataset.id);
      const result = await updateAgent(activateBtn.dataset.id, { ...agent, status: 'active' });
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('AI employee activated', 'success');
      renderAgents(container);
      return;
    }

    if (deleteBtn) {
      e.stopPropagation();
      container.querySelectorAll('.action-menu.open').forEach((m) => m.classList.remove('open'));
      if (!confirm('Delete this AI employee? This cannot be undone.')) return;
      const result = await deleteAgent(deleteBtn.dataset.id);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast('AI employee deleted', 'success');
      renderAgents(container);
    }
  });
}
