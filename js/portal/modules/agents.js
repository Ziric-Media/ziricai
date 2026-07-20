import { state } from '../state.js';
import { escapeHtml, pageHeader, emptyState, loadingState, statusBadge, formatNumber } from '../../admin/ui.js';
import { DEMO_AGENTS } from '../../admin/demo-data.js';
import { fetchAiEmployees } from '../api.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can } from '../permissions.js';

const ROLE_COLORS = {
  sales_consultant: 'purple',
  customer_support: 'blue',
  technical_support: 'orange',
  accounts_assistant: 'green',
  receptionist: 'yellow',
  hr_assistant: 'blue',
  legal_assistant: 'purple',
  marketing_assistant: 'orange',
  security_advisor: 'green',
  compassion_counselor: 'purple',
};

const CHANNEL_ICONS = {
  whatsapp: { icon: 'fa-brands fa-whatsapp', label: 'WhatsApp' },
  websiteChat: { icon: 'fa-comments', label: 'Web Chat' },
  facebookMessenger: { icon: 'fa-brands fa-facebook-messenger', label: 'Messenger' },
  instagram: { icon: 'fa-brands fa-instagram', label: 'Instagram' },
  telegram: { icon: 'fa-brands fa-telegram', label: 'Telegram' },
  email: { icon: 'fa-envelope', label: 'Email' },
};

let searchTerm = '';

export async function renderAgents(container) {
  if (!can(state.profile?.role, 'canEditAI')) {
    container.innerHTML = emptyState('You do not have permission to manage AI Employees.');
    return;
  }

  container.innerHTML = loadingState('Loading AI employees...');
  const companyId = state.companyId;

  const apiRes = await fetchAiEmployees(companyId);
  const useDemo = shouldUseDemoFallback({ companyId, isDemo: state.hubData?.isDemo, isProvisioned: state.hubData?.isProvisioned });
  let agents = [];
  if (apiRes.data?.items?.length) {
    agents = apiRes.data.items;
  } else if (apiRes.items?.length) {
    agents = apiRes.items;
  } else if (useDemo) {
    agents = DEMO_AGENTS.filter((a) => a.companyId === companyId);
  }

  if (apiRes.error && !agents.length && !useDemo) {
    container.innerHTML = `${pageHeader('AI Employees', 'Your AI team.')}
      ${renderEmptyState({ message: apiRes.error, actionHtml: '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>' })}`;
    return;
  }

  const filtered = filterAgents(agents);
  const activeCount = agents.filter((a) => a.status === 'active').length;
  const totalConversations = agents.reduce((s, a) => s + (a.conversations || 0), 0);
  const plan = state.company?.plan || state.usage?.plan || 'trial';
  const aiLimit = state.usage?.aiEmployeesLimit ?? 1;
  const atAiLimit = agents.length >= aiLimit;
  const usingApi = Boolean(apiRes.data?.items?.length || apiRes.items?.length);

  container.innerHTML = `
    ${pageHeader(
      'AI Employees',
      `Dedicated AI team members for ${escapeHtml(state.company?.name || 'your company')}.`,
      state.permissions.canEditAI
        ? `<button class="btn btn-primary btn-sm" type="button" disabled title="Create via Sarah or Admin console"><i class="fa-solid fa-plus"></i> New AI Employee</button>`
        : ''
    )}

    ${!usingApi && useDemo ? `<div class="portal-limit-banner"><i class="fa-solid fa-circle-info"></i> Showing demo agents — create real employees via Sarah chat or provision your workspace.</div>` : ''}
    ${atAiLimit ? `<div class="portal-limit-banner"><i class="fa-solid fa-lock"></i> ${escapeHtml(plan)} plan limit reached (${agents.length}/${aiLimit} AI). <a href="#" data-nav="billing">Upgrade</a></div>` : ''}

    <div class="portal-agents-summary">
      <span class="portal-agent-stat-pill"><i class="fa-solid fa-robot"></i> ${agents.length} employee${agents.length === 1 ? '' : 's'}</span>
      <span class="portal-agent-stat-pill"><i class="fa-solid fa-circle-check"></i> ${activeCount} active</span>
      <span class="portal-agent-stat-pill"><i class="fa-solid fa-comments"></i> ${formatNumber(totalConversations)} conversations</span>
    </div>

    <div class="portal-agents-toolbar">
      <div class="search-wrapper">
        <span class="search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="text" id="portalAgentSearch" placeholder="Search by name or role..." value="${escapeHtml(searchTerm)}" />
      </div>
    </div>

    <div class="portal-employees-grid" id="portalAgentsGrid">
      ${filtered.length
        ? filtered.map((a) => employeeCard(a)).join('')
        : agents.length === 0
          ? renderEmptyState({ message: 'No AI employees yet.', actionHtml: '<button class="btn btn-primary btn-sm" type="button" data-nav="integrations">Connect channels</button>' })
          : emptyState('No AI employees match your search.', '<button class="btn btn-secondary btn-sm" type="button" id="clearAgentSearch">Clear search</button>')}
    </div>
  `;

  bindAgentEvents(container, agents);
  container.querySelector('[data-nav="billing"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-page="billing"]')?.click();
  });
}

function filterAgents(agents) {
  const term = searchTerm.toLowerCase();
  if (!term) return agents;
  return agents.filter((a) =>
    [a.name, a.roleLabel, a.role, a.department, a.model, a.personality]
      .some((v) => String(v || '').toLowerCase().includes(term))
  );
}

function employeeCard(agent) {
  const color = ROLE_COLORS[agent.role] || 'purple';
  const isActive = agent.status === 'active';
  const channels = Object.entries(agent.channels || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => CHANNEL_ICONS[key])
    .filter(Boolean);

  const whatsappConnected = agent.whatsappConnected && agent.channels?.whatsapp !== false;
  const kbLabel = agent.knowledgeBaseId ? escapeHtml(agent.knowledgeBaseId) : '—';

  return `
    <article class="portal-employee-card ${isActive ? '' : 'inactive'}" data-id="${escapeHtml(agent.id)}">
      <div class="portal-employee-card-header">
        <div class="portal-employee-avatar ${color}">${agent.avatar || '🤖'}</div>
        <div class="portal-employee-meta">
          <h3>${escapeHtml(agent.name)}${agent.isDefault ? ' <span class="status-badge active">Default</span>' : ''}</h3>
          <div class="portal-employee-role">${escapeHtml(agent.roleLabel || agent.role)} · ${escapeHtml(agent.department || 'General')}</div>
          <div class="portal-employee-badges">
            ${statusBadge(agent.status)}
            ${whatsappConnected
              ? '<span class="status-badge active"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>'
              : '<span class="status-badge inactive">No WhatsApp</span>'}
            <span class="personality-tag">${escapeHtml((agent.personality || 'professional').replace(/_/g, ' '))}</span>
          </div>
        </div>
      </div>

      <div class="portal-employee-stats">
        <div><span class="label">Model</span><span class="value">${escapeHtml(agent.model || 'gpt-4o-mini')}</span></div>
        <div><span class="label">Knowledge</span><span class="value">${kbLabel}</span></div>
        <div><span class="label">Conversations</span><span class="value">${formatNumber(agent.conversations || 0)}</span></div>
      </div>

      ${channels.length ? `<div class="portal-employee-channels">${channels.map((c) => `<span class="channel-tag"><i class="${c.icon}"></i> ${c.label}</span>`).join('')}</div>` : ''}
    </article>
  `;
}

function bindAgentEvents(container, agents) {
  container.querySelector('#portalAgentSearch')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderAgents(container);
  });
  container.querySelector('#clearAgentSearch')?.addEventListener('click', () => {
    searchTerm = '';
    renderAgents(container);
  });
}
