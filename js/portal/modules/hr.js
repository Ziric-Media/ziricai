/**
 * Sarah HR — people-management workspace (preview-first; no confidential HR APIs yet).
 */
import { escapeHtml, pageHeader } from '../../admin/ui.js';
import { state } from '../core/dataStore.js';
import { can } from '../permissions.js';

const HR_WORKSPACES = [
  { id: 'overview', label: 'Overview', icon: 'fa-gauge-high' },
  { id: 'directory', label: 'Employee directory', icon: 'fa-address-book' },
  { id: 'leave', label: 'Leave & attendance', icon: 'fa-calendar-days' },
  { id: 'recruitment', label: 'Recruitment', icon: 'fa-user-plus' },
  { id: 'performance', label: 'Performance & training', icon: 'fa-chart-line' },
  { id: 'requests', label: 'HR requests', icon: 'fa-inbox' },
];

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

function renderWorkspaceNav() {
  const items = HR_WORKSPACES.map(
    (w) => `<button type="button" class="hr-ws-nav-btn ${hrState.workspace === w.id ? 'active' : ''}" data-hr-ws="${w.id}">
      <i class="fa-solid ${w.icon}" aria-hidden="true"></i><span>${escapeHtml(w.label)}</span>
    </button>`
  ).join('');
  return `<nav class="hr-ws-nav" aria-label="HR sections">${items}</nav>`;
}

function renderWorkspacePanel() {
  const canManage = can(state.profile?.role, 'canManageHr');
  const manageNote = canManage
    ? 'Your role can manage HR when integrations are enabled. No employee records are loaded in this preview.'
    : 'You can explore planned HR features here. Confidential employee records stay permission-gated on the server.';

  switch (hrState.workspace) {
    case 'directory':
      return `${shellBanner(
        'Employee directory',
        'Organisation chart, roles, departments, and contact details for your team.',
        'fa-address-book'
      )}${previewNotice(manageNote)}${emptyTable(
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
      return `${shellBanner(
        'Sarah HR overview',
        'Your people-management centre — directory, leave, recruitment, performance, and HR requests. Workspaces below are explorable previews until integrations ship.',
        'fa-user-tie'
      )}${previewNotice(manageNote)}
      <ul class="hr-overview-grid">
        ${HR_WORKSPACES.filter((w) => w.id !== 'overview')
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
}

function bindHrUi(container) {
  container.querySelectorAll('[data-hr-ws]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hrState.workspace = btn.getAttribute('data-hr-ws') || 'overview';
      const panel = container.querySelector('[data-hr-panel]');
      const nav = container.querySelector('.hr-ws-nav');
      if (panel) panel.innerHTML = renderWorkspacePanel();
      if (nav) nav.outerHTML = renderWorkspaceNav();
      bindHrUi(container);
    });
  });
}

export async function renderHr(container) {
  hrState = { workspace: 'overview' };
  container.innerHTML = `
    <div class="fin-module hr-module">
      ${pageHeader('Sarah HR', 'People management — preview workspaces; live employee data requires backend integration.')}
      <div class="hr-module-layout">
        ${renderWorkspaceNav()}
        <div class="hr-module-main" data-hr-panel>${renderWorkspacePanel()}</div>
      </div>
    </div>
  `;
  bindHrUi(container);
}
