/**
 * Finance module — seven-workspace navigation (UI shell; some workspaces unavailable).
 */
import { escapeHtml } from '../admin/ui.js';
import { sarahNavIconMarkup } from '../shared/sarahAvatar.js';

/** @typedef {'live' | 'shell'} FinanceWorkspaceMode */

export const FINANCE_WORKSPACES = [
  { id: 'overview', label: 'Financial Overview', shortLabel: 'Overview', icon: 'fa-chart-pie', mode: 'live' },
  { id: 'sarah', label: 'Sarah', shortLabel: 'Sarah', icon: 'fa-wand-magic-sparkles', mode: 'live' },
  { id: 'income', label: 'Income & Sales', shortLabel: 'Income', icon: 'fa-arrow-trend-up', mode: 'live' },
  { id: 'expenses', label: 'Expenses & Payables', shortLabel: 'Expenses', icon: 'fa-arrow-trend-down', mode: 'live' },
  { id: 'collections', label: 'Accounts & Collections', shortLabel: 'Collections', icon: 'fa-hand-holding-dollar', mode: 'shell' },
  { id: 'banking', label: 'Banking & Reconciliation', shortLabel: 'Banking', icon: 'fa-building-columns', mode: 'shell' },
  { id: 'reports', label: 'Reports & Planning', shortLabel: 'Reports', icon: 'fa-chart-column', mode: 'shell' },
  { id: 'audit', label: 'Audit & Settings', shortLabel: 'Audit', icon: 'fa-shield-halved', mode: 'shell' },
];

/** @type {Record<string, Array<{ id: string, label: string }>>} */
export const FINANCE_SUB_TABS = {
  income: [
    { id: 'transactions', label: 'Transactions' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'quotations', label: 'Quotations' },
  ],
  expenses: [
    { id: 'transactions', label: 'Expenses' },
    { id: 'invoices', label: 'Bills (payable)' },
    { id: 'categories', label: 'Categories' },
  ],
  audit: [
    { id: 'categories', label: 'Categories' },
    { id: 'activity', label: 'Activity history' },
    { id: 'settings', label: 'Configuration' },
  ],
  collections: [
    { id: 'accounts', label: 'Accounts' },
    { id: 'ageing', label: 'Ageing' },
    { id: 'queue', label: 'Collections queue' },
    { id: 'plans', label: 'Payment plans' },
  ],
  banking: [
    { id: 'accounts', label: 'Bank accounts' },
    { id: 'import', label: 'Statement import' },
    { id: 'reconcile', label: 'Reconciliation' },
  ],
  reports: [
    { id: 'catalogue', label: 'Report library' },
    { id: 'planning', label: 'Budgets & variance' },
  ],
};

const SHELL_COPY = {
  collections: {
    title: 'Accounts & Collections',
    reason:
      'Customer and supplier accounts, ageing, statements, collection notes, and instalment schedules will appear here after Tier A read APIs are authorized.',
    doc: 'FINANCE_PHASE2_TIER_A_TASKS.md',
  },
  banking: {
    title: 'Banking & Reconciliation',
    reason:
      'Bank feeds, statement imports, and reconciliation require a dedicated banking data source. Cash position is not inferred from the ledger.',
    doc: 'FINANCE_UI_COMPLETION_PLAN.md',
  },
  reports: {
    title: 'Reports & Planning',
    reason:
      'Income statement, cash flow, ageing reports, and budgets will use authoritative ledger and invoice data once the report engine is connected.',
    doc: 'FINANCE_UI_COMPLETION_PLAN.md',
  },
  audit: {
    title: 'Audit & Settings',
    reason: 'Financial activity history and tenant configuration screens are planned; categories are available under the Categories sub-tab.',
    doc: 'FINANCE_UI_COMPLETION_PLAN.md',
  },
};

export function defaultSubTab(workspaceId) {
  const tabs = FINANCE_SUB_TABS[workspaceId];
  return tabs?.[0]?.id || '';
}

export function renderFinanceShellPanel(workspaceId) {
  const meta = SHELL_COPY[workspaceId] || {
    title: 'Unavailable',
    reason: 'This workspace is not available yet.',
    doc: '',
  };
  return `<section class="fin-unavailable-panel" aria-labelledby="fin-shell-${escapeHtml(workspaceId)}">
    <div class="fin-unavailable-icon" aria-hidden="true"><i class="fa-solid fa-lock"></i></div>
    <h3 id="fin-shell-${escapeHtml(workspaceId)}" class="fin-unavailable-title">${escapeHtml(meta.title)}</h3>
    <p class="fin-unavailable-body">${escapeHtml(meta.reason)}</p>
    <p class="fin-capability-badge fin-capability-badge--unavailable"><i class="fa-solid fa-eye-slash"></i> Preview · not connected</p>
  </section>`;
}

export function renderAuditSubShell(subTab) {
  if (subTab === 'activity') {
    return `<section class="fin-unavailable-panel fin-unavailable-panel--compact">
      <h3 class="fin-unavailable-title">Activity history</h3>
      <p class="fin-unavailable-body">Immutable financial audit events will list here when the audit stream is implemented. Void reasons on transactions and invoices are recorded server-side today.</p>
      <p class="fin-capability-badge fin-capability-badge--unavailable">Unavailable</p>
    </section>`;
  }
  if (subTab === 'settings') {
    return `<section class="fin-unavailable-panel fin-unavailable-panel--compact">
      <h3 class="fin-unavailable-title">Configuration</h3>
      <p class="fin-unavailable-body">Fiscal year, currencies, tax defaults, invoice numbering, and approval rules will be configured here. No settings API is wired in this UI batch.</p>
      <p class="fin-capability-badge fin-capability-badge--unavailable">Unavailable</p>
    </section>`;
  }
  return '';
}

export function renderFinanceWorkspaceNav(fin) {
  const ws = fin.workspace || 'overview';
  const items = FINANCE_WORKSPACES.map((w) => {
    const active = ws === w.id;
    const modeBadge =
      w.mode === 'shell'
        ? '<span class="fin-ws-badge" title="Interface preview">Preview</span>'
        : '';
    const iconMarkup =
      w.id === 'sarah'
        ? sarahNavIconMarkup()
        : `<i class="fa-solid ${w.icon}" aria-hidden="true"></i>`;
    return `<button type="button" class="fin-ws-link ${active ? 'is-active' : ''} ${w.id === 'sarah' ? 'fin-ws-link--sarah' : ''}" data-fin-workspace="${escapeHtml(w.id)}" aria-current="${active ? 'page' : 'false'}">
      ${iconMarkup}
      <span class="fin-ws-link-label">${escapeHtml(w.label)}</span>
      ${modeBadge}
    </button>`;
  }).join('');

  const mobileOptions = FINANCE_WORKSPACES.map(
    (w) => `<option value="${escapeHtml(w.id)}" ${ws === w.id ? 'selected' : ''}>${escapeHtml(w.shortLabel)}</option>`
  ).join('');

  return `<nav class="fin-workspace-nav" aria-label="Finance workspaces">
    <div class="fin-workspace-nav-desktop">${items}</div>
    <label class="fin-workspace-nav-mobile fin-field">
      <span class="fin-sr-only">Finance workspace</span>
      <select class="fin-select fin-workspace-select" data-fin-workspace-select aria-label="Finance workspace">${mobileOptions}</select>
    </label>
  </nav>`;
}

export function renderFinanceSubNav(fin) {
  const tabs = FINANCE_SUB_TABS[fin.workspace];
  if (!tabs?.length) return '';
  const sub = fin.subTab || tabs[0].id;
  return `<nav class="fin-subnav" aria-label="Workspace sections">
    ${tabs
      .map(
        (t) =>
          `<button type="button" class="fin-subnav-btn ${sub === t.id ? 'is-active' : ''}" data-fin-subtab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`
      )
      .join('')}
  </nav>`;
}
