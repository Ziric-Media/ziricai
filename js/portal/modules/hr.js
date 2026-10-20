/**
 * Sarah HR — people-management workspace (preview-first; no confidential HR APIs yet).
 */
import { escapeHtml, pageHeader } from '../../admin/ui.js';
import { state } from '../core/dataStore.js';
import { can } from '../permissions.js';
import {
  renderSarahHorizontalNav,
  renderSwKpiGrid,
  renderDonutChart,
  renderBarChart,
  renderSwChartCard,
  renderSwOverviewQuad,
  renderSparkBars,
  renderSarahWorkspaceChatShell,
} from '../sarahWorkspaceUi.js';
import { mountSarahChat } from '../sarah/sarah-ui.js';
import { mountWorkforceInstructionsPanel } from '../workforceInstructionsPanel.js';
import { getSarahPageContext } from '../core/sarahPageContext.js';

const HR_WORKSPACES = [
  { id: 'overview', label: 'Overview', icon: 'fa-gauge-high' },
  { id: 'sarah', label: 'Sarah', sarah: true },
  { id: 'directory', label: 'Employee directory', icon: 'fa-address-book' },
  { id: 'leave', label: 'Leave & attendance', icon: 'fa-calendar-days' },
  { id: 'recruitment', label: 'Recruitment', icon: 'fa-user-plus' },
  { id: 'performance', label: 'Performance', icon: 'fa-chart-line' },
  { id: 'requests', label: 'HR requests', icon: 'fa-inbox' },
];

/** Preview workforce metrics until HRIS sync. */
function hrPreviewMetrics() {
  const teamSize = Array.isArray(state.team) ? state.team.length : 0;
  const active = Math.max(teamSize, teamSize ? teamSize - 1 : 0);
  const onLeave = teamSize > 2 ? 1 : 0;
  const openRoles = 2;
  const pendingRequests = 3;
  return {
    teamSize: teamSize || 12,
    active: active || 10,
    onLeave,
    openRoles,
    pendingRequests,
    contractors: 2,
    newHires30d: 1,
  };
}

/** @type {{ workspace: string }} */
let hrState = { workspace: 'overview' };

function shellBanner(title, lede, icon = 'fa-user-tie') {
  return `<div class="fin-shell-banner hr-shell-banner">
    <div class="fin-shell-banner-head">
      <div class="fin-shell-banner-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></div>
      <div class="fin-shell-banner-copy">
        <h2 class="fin-shell-banner-title">${escapeHtml(title)}</h2>
        <p class="fin-shell-banner-lede">${escapeHtml(lede)}</p>
        <p class="fin-capability-badge fin-capability-badge--unavailable"><i class="fa-solid fa-eye-slash"></i> Preview · not connected to live HR records</p>
      </div>
    </div>
  </div>`;
}

function previewNotice(text) {
  return `<p class="fin-shell-notice" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${escapeHtml(text)}</p>`;
}

function emptyTable(headers, emptyLabel) {
  const head = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  return `<div class="fin-table-wrap fin-shell-table-wrap">
    <table class="fin-table fin-table-compact fin-shell-table">
      <thead><tr>${head}</tr></thead>
      <tbody><tr><td colspan="${headers.length}" class="muted fin-shell-empty-cell">${escapeHtml(emptyLabel)}</td></tr></tbody>
    </table>
  </div>`;
}

function renderHrOverview() {
  const m = hrPreviewMetrics();
  const canManage = can(state.profile?.role, 'canManageHr');
  const manageNote = canManage
    ? 'Your role can manage HR when integrations are enabled. Figures below are illustrative until HRIS sync.'
    : 'Explore planned HR features here. Live employee records stay permission-gated on the server.';

  const kpis = renderSwKpiGrid([
    { label: 'Total workforce', value: m.teamSize, icon: 'fa-users', tone: 'hr' },
    { label: 'Active today', value: m.active, icon: 'fa-user-check', tone: 'success' },
    { label: 'On leave', value: m.onLeave, icon: 'fa-umbrella-beach', tone: 'warn' },
    { label: 'Open roles', value: m.openRoles, icon: 'fa-briefcase', tone: 'hr' },
    { label: 'HR requests', value: m.pendingRequests, icon: 'fa-inbox', tone: 'accent' },
    { label: 'New hires (30d)', value: m.newHires30d, icon: 'fa-user-plus', tone: 'success' },
  ]);

  const quad = renderSwOverviewQuad(
    [
      renderSwChartCard(
        'Workforce mix',
        'Headcount breakdown (preview)',
        renderDonutChart(
          [
            { label: 'Active', value: m.active, color: '#db2777' },
            { label: 'On leave', value: m.onLeave, color: '#f59e0b' },
            { label: 'Contractors', value: m.contractors, color: '#6366f1' },
          ],
          { centerLabel: 'People', centerValue: m.teamSize, compact: true }
        )
      ),
      renderSwChartCard(
        'HR workload',
        'Open queues',
        renderBarChart([
          { label: 'Leave pending', value: m.onLeave + 1, color: '#f59e0b' },
          { label: 'Requisitions', value: m.openRoles, color: '#db2777' },
          { label: 'HR cases', value: m.pendingRequests, color: '#8b5cf6' },
        ])
      ),
      renderSwChartCard(
        'Attendance trend',
        'Active vs leave (preview)',
        renderSparkBars([m.active, m.active - 1, m.active, m.onLeave, m.active, m.teamSize, m.active], {
          color: '#db2777',
        })
      ),
      renderSwChartCard(
        'Hiring pipeline',
        'Recruitment snapshot',
        renderDonutChart(
          [
            { label: 'Open roles', value: m.openRoles, color: '#db2777' },
            { label: 'New hires', value: m.newHires30d, color: '#10b981' },
            { label: 'Requests', value: m.pendingRequests, color: '#8b5cf6' },
          ],
          { centerLabel: 'HR', centerValue: m.openRoles + m.pendingRequests, compact: true }
        )
      ),
    ].join('')
  );

  return `${previewNotice(manageNote)}
    ${kpis}
    ${quad}
    <ul class="hr-overview-grid">
      ${HR_WORKSPACES.filter((w) => !['overview', 'sarah'].includes(w.id))
        .map(
          (w) => `<li><button type="button" class="hr-overview-card" data-hr-ws="${w.id}">
            <i class="fa-solid ${w.icon}"></i>
            <strong>${escapeHtml(w.label)}</strong>
            <span class="bos-nav-tag bos-nav-tag-preview">Preview</span>
          </button></li>`
        )
        .join('')}
    </ul>`;
}

function renderHrSarahShell() {
  return renderSarahWorkspaceChatShell({
    title: 'Sarah',
    subtitle: 'HR Assistant',
    intro:
      'Ask about leave policies, onboarding checklists, and how Sarah HR workspaces will connect to your HRIS. Sarah does not change employee records from chat in this preview phase.',
    capabilities: [
      { icon: 'fa-address-book', label: 'Directory & org structure' },
      { icon: 'fa-calendar-days', label: 'Leave & attendance guidance' },
      { icon: 'fa-user-plus', label: 'Recruitment workflows' },
      { icon: 'fa-shield-halved', label: 'Permissions & confidentiality' },
    ],
    suggestions: [
      'What will Sarah HR overview show when live?',
      'How is employee data kept private?',
      'Explain leave vs attendance workspaces',
      'What integrations are planned for HR?',
    ],
    chatMountId: 'hrSarahPageChat',
    accent: 'hr',
  });
}

function renderWorkspacePanel() {
  switch (hrState.workspace) {
    case 'sarah':
      return renderHrSarahShell();
    case 'directory':
      return `${shellBanner(
        'Employee directory',
        'Organisation chart, roles, departments, and contact details for your team.',
        'fa-address-book'
      )}${previewNotice('Directory will sync from your team and HRIS when Sarah HR is wired.')}${emptyTable(
        ['Name', 'Role', 'Department', 'Status'],
        'Directory will sync from your team and HRIS when Sarah HR is wired.'
      )}`;
    case 'leave':
      return `${shellBanner(
        'Leave & attendance',
        'Leave balances, approvals, and attendance patterns in one place.',
        'fa-calendar-days'
      )}${previewNotice('Leave policies and balances are not stored in this build.')}${emptyTable(
        ['Employee', 'Leave type', 'Dates', 'Status'],
        'Awaiting leave-management integration.'
      )}`;
    case 'recruitment':
      return `${shellBanner(
        'Recruitment & onboarding',
        'Open roles, applicants, and onboarding checklists for new hires.',
        'fa-user-plus'
      )}${previewNotice('Recruitment pipelines will connect to ATS or manual workflows later.')}${emptyTable(
        ['Role', 'Stage', 'Candidates', 'Owner'],
        'No active requisitions in preview mode.'
      )}`;
    case 'performance':
      return `${shellBanner(
        'Performance & training',
        'Reviews, goals, training assignments, and completion tracking.',
        'fa-chart-line'
      )}${previewNotice('Performance cycles are structural only until HR data models are authorized.')}${emptyTable(
        ['Employee', 'Cycle', 'Rating', 'Next step'],
        'Performance data not connected.'
      )}`;
    case 'requests':
      return `${shellBanner(
        'HR requests',
        'Policy questions, document requests, and HR case intake from staff.',
        'fa-inbox'
      )}${previewNotice('Staff will submit HR requests here; Sarah HR will triage when live.')}${emptyTable(
        ['Request', 'Submitted by', 'Status', 'Updated'],
        'No HR requests in preview.'
      )}`;
    case 'overview':
    default:
      return renderHrOverview();
  }
}

function bindHrUi(container) {
  container.querySelectorAll('[data-hr-ws]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hrState.workspace = btn.getAttribute('data-hr-ws') || 'overview';
      repaint(container);
    });
  });

  container.querySelectorAll('[data-hr-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hrState.workspace = btn.getAttribute('data-hr-section') || 'overview';
      repaint(container);
    });
  });
  container.querySelector('[data-sw-nav-select]')?.addEventListener('change', (e) => {
    hrState.workspace = e.target.value || 'overview';
    repaint(container);
  });
}

async function mountHrSarahChat(container) {
  const root = container.querySelector('[data-sw-sarah-chat]');
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';
  const instrHost = container.querySelector('[data-workforce-instructions-host]');
  if (instrHost) await mountWorkforceInstructionsPanel(instrHost, { persistenceScope: 'hrSarah', adminView: false });

  await mountSarahChat(root, {
    mode: 'page',
    persistenceScope: 'hrSarah',
    welcomeMessage:
      "Hi! I'm Sarah, your HR assistant. I can explain how Sarah HR workspaces will work and what stays confidential until your HRIS is connected.",
    suggestions: [
      'How many people are on the team?',
      'What is preview vs live HR data?',
      'Where will leave approvals live?',
      'How do HR requests get routed?',
    ],
    getPageContext: () => ({ ...getSarahPageContext(), module: 'hr', workspace: hrState.workspace }),
  });
}

function repaint(container) {
  const nav = renderSarahHorizontalNav(HR_WORKSPACES, hrState.workspace, 'data-hr-section');
  const panel = container.querySelector('[data-hr-panel]');
  const navHost = container.querySelector('[data-hr-nav]');
  if (navHost) navHost.innerHTML = nav;
  if (panel) panel.innerHTML = renderWorkspacePanel();
  bindHrUi(container);
  if (hrState.workspace === 'sarah') void mountHrSarahChat(container);
}

export async function renderHr(container) {
  hrState = { workspace: 'overview' };
  container.innerHTML = `
    <div class="fin-module hr-module sw-module">
      ${pageHeader('Sarah HR', 'People management — preview workspaces; live employee data requires backend integration.')}
      <div data-hr-nav>${renderSarahHorizontalNav(HR_WORKSPACES, hrState.workspace, 'data-hr-section')}</div>
      <div class="hr-module-main sw-module-body" data-hr-panel>${renderWorkspacePanel()}</div>
    </div>
  `;
  bindHrUi(container);
}
