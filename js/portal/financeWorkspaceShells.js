/**
 * Finance workspace UI shells (U4–U7) — layout only; no live data or mutations.
 */
import { escapeHtml } from '../admin/ui.js';

function shellBanner(title, lede, iconClass = 'fa-folder-open') {
  const icon = iconClass || 'fa-folder-open';
  return `<div class="fin-shell-banner">
    <div class="fin-shell-banner-head">
      <div class="fin-shell-banner-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></div>
      <div class="fin-shell-banner-copy">
        <h2 class="fin-shell-banner-title">${escapeHtml(title)}</h2>
        <p class="fin-shell-banner-lede">${escapeHtml(lede)}</p>
        <p class="fin-capability-badge fin-capability-badge--unavailable"><i class="fa-solid fa-eye-slash"></i> Interface preview · not connected</p>
      </div>
    </div>
  </div>`;
}

function shellNotice(text) {
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

function disabledAction(label, title, icon = '') {
  const iconHtml = icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i> ` : '';
  return `<button type="button" class="btn btn-secondary btn-sm fin-shell-action-btn" disabled title="${escapeHtml(title)}">${iconHtml}${escapeHtml(label)}</button>`;
}

export function renderCollectionsShell(subTab = 'accounts') {
  const banner = shellBanner(
    'Accounts & Collections',
    'Customer and supplier accounts, ageing, statements, and collection workflows. Data will come from invoice and CRM-linked read models (Tier A) — not available in this build.',
    'fa-hand-holding-dollar'
  );
  const notice = shellNotice('No account balances are shown here yet. Open receivable/payable totals remain on Overview and Invoices until Tier A is authorized.');

  let body = '';
  if (subTab === 'accounts') {
    body = `${emptyTable(['Account', 'Type', 'Currency', 'Balance due'], 'No accounts — connect Tier A read APIs to list customer and supplier balances from invoices.')}
      <div class="fin-shell-actions">${disabledAction('Export statement', 'Requires canExportFinance and statement API')}</div>`;
  } else if (subTab === 'ageing') {
    body = emptyTable(
      ['Bucket', 'Receivable', 'Payable', 'Count'],
      'Ageing buckets will be computed from open invoice due dates (Africa/Johannesburg).'
    );
  } else if (subTab === 'queue') {
    body = `${emptyTable(['Customer', 'Days overdue', 'Balance', 'Last action'], 'Collections queue will list overdue receivables when Tier A queue endpoint exists.')}
      <div class="fin-shell-actions">${disabledAction('Add collection note', 'Append-only notes — Tier A')}</div>`;
  } else if (subTab === 'plans') {
    body = emptyTable(
      ['Counterparty', 'Plan total', 'Next due', 'Progress'],
      'Instalment schedules are structural only until plan APIs and allocation reads exist.'
    );
  }

  return `<div class="fin-shell-workspace">${banner}${notice}${body}</div>`;
}

export function renderBankingShell(subTab = 'accounts') {
  const banner = shellBanner(
    'Banking & Reconciliation',
    'Bank accounts, imported statements, and matched transactions. Cash position is not derived from the posted ledger.',
    'fa-building-columns'
  );
  const notice = shellNotice('Bank feeds and reconciliation are not enabled. Overview cash position remains explicitly unavailable.');

  let body = '';
  if (subTab === 'accounts') {
    body = emptyTable(['Bank account', 'Currency', 'Last import', 'Ledger balance'], 'No bank accounts linked.');
  } else if (subTab === 'import') {
    body = `${emptyTable(['File / feed', 'Status', 'Imported rows', 'Date'], 'No statement imports.')}
      <div class="fin-shell-actions">${disabledAction('Import statement', 'Bank integration not configured')}</div>`;
  } else {
    body = `${emptyTable(['Bank line', 'Matched ledger tx', 'Amount', 'Status'], 'No reconciliation session.')}
      ${emptyTable(['Unmatched bank', 'Unmatched ledger', 'Suggested match'], 'Nothing to match.')}`;
  }

  return `<div class="fin-shell-workspace">${banner}${notice}${body}</div>`;
}

const REPORT_CARDS = [
  {
    id: 'pnl',
    icon: 'fa-file-lines',
    title: 'Income statement',
    desc: 'Posted income and expenses by period and category.',
    source: 'Posted ledger',
    period: 'Preset or custom range',
    basis: 'Posted transactions',
    status: 'Preview',
  },
  {
    id: 'cashflow',
    icon: 'fa-money-bill-transfer',
    title: 'Cash flow',
    desc: 'Ledger movement — not bank cash until feeds exist.',
    source: 'Posted ledger',
    period: 'Preset or custom range',
    basis: 'Posted movement',
    status: 'Preview',
  },
  {
    id: 'ar-age',
    icon: 'fa-hourglass-half',
    title: 'Receivables ageing',
    desc: 'Open customer invoices by bucket.',
    source: 'Open receivables',
    period: 'As of today',
    basis: 'Invoice balances due',
    status: 'Preview',
  },
  {
    id: 'ap-age',
    icon: 'fa-clock',
    title: 'Payables ageing',
    desc: 'Open supplier bills by bucket.',
    source: 'Open payables',
    period: 'As of today',
    basis: 'Invoice balances due',
    status: 'Preview',
  },
  {
    id: 'budget',
    icon: 'fa-bullseye',
    title: 'Budget vs actual',
    desc: 'Planning — requires budget data source.',
    source: 'Budgets (future)',
    period: 'Fiscal year',
    basis: 'Budget vs ledger actuals',
    status: 'Preview',
  },
  {
    id: 'ledger',
    icon: 'fa-book',
    title: 'General ledger',
    desc: 'Posted transactions by category and counterparty.',
    source: 'Posted ledger',
    period: 'Preset or custom range',
    basis: 'Posted transactions',
    status: 'Preview',
  },
];

export function renderReportsShell(subTab = 'catalogue') {
  const banner = shellBanner(
    'Reports & Planning',
    'Formal reports and budgets use authoritative ledger and invoice data once the report engine is wired.',
    'fa-chart-column'
  );

  if (subTab === 'planning') {
    return `<div class="fin-shell-workspace">${banner}
      ${shellNotice('Budgets are not stored in Finance v1.')}
      ${emptyTable(['Budget line', 'Period', 'Budget', 'Actual', 'Variance'], 'No budgets defined.')}
      <div class="fin-shell-actions">${disabledAction('Create budget', 'Planning API not available')}</div>
    </div>`;
  }

  const cards = REPORT_CARDS.map(
    (r) => `<article class="fin-report-card fin-report-card--disabled">
      <header class="fin-report-card-head">
        <div class="fin-report-card-title-wrap">
          <span class="fin-report-card-icon" aria-hidden="true"><i class="fa-solid ${r.icon}"></i></span>
          <h3>${escapeHtml(r.title)}</h3>
        </div>
        <span class="fin-capability-badge fin-capability-badge--unavailable">${escapeHtml(r.status)}</span>
      </header>
      <p class="fin-report-card-desc">${escapeHtml(r.desc)}</p>
      <ul class="fin-report-card-facts" role="list">
        <li class="fin-report-card-fact"><span class="fin-report-card-fact-label">Data source</span><span class="fin-report-card-fact-value">${escapeHtml(r.source)}</span></li>
        <li class="fin-report-card-fact"><span class="fin-report-card-fact-label">Period</span><span class="fin-report-card-fact-value">${escapeHtml(r.period)}</span></li>
        <li class="fin-report-card-fact"><span class="fin-report-card-fact-label">Basis</span><span class="fin-report-card-fact-value">${escapeHtml(r.basis)}</span></li>
        <li class="fin-report-card-fact"><span class="fin-report-card-fact-label">Export</span><span class="fin-report-card-fact-value">Requires canExportFinance</span></li>
      </ul>
      <div class="fin-report-card-foot">
        ${disabledAction('Run report', 'Report engine not connected', 'fa-play')}
      </div>
    </article>`
  ).join('');

  return `<div class="fin-shell-workspace fin-shell-workspace--reports">${banner}
    ${shellNotice('Report previews are placeholders. Export requires canExportFinance and server endpoints.')}
    <div class="fin-report-grid fin-report-grid--catalog">${cards}</div>
  </div>`;
}

export function renderAuditActivityShell() {
  return `<div class="fin-shell-workspace fin-shell-workspace--compact">
    <div class="fin-shell-banner">
      <h2 class="fin-shell-banner-title">Activity history</h2>
      <p class="fin-shell-banner-lede">Immutable audit stream for financial events (voids, exports, collection notes). Server records void reasons today; unified UI pending.</p>
      <p class="fin-capability-badge fin-capability-badge--unavailable">Unavailable</p>
    </div>
    ${emptyTable(['When', 'Actor', 'Event', 'Entity'], 'No audit events in this UI — check server logs / future audit collection.')}
  </div>`;
}

export function renderAuditSettingsShell() {
  const fields = [
    ['Fiscal year start', '—', 'Not configured'],
    ['Default currency', '—', 'Tenant setting (future)'],
    ['Tax display', '—', 'Not configured'],
    ['Invoice numbering', '—', 'Not configured'],
    ['Approval rules', '—', 'Phase 3+'],
  ];
  const rows = fields
    .map(
      ([label, val, note]) => `<tr>
        <th scope="row">${escapeHtml(label)}</th>
        <td>${escapeHtml(val)}</td>
        <td class="muted">${escapeHtml(note)}</td>
      </tr>`
    )
    .join('');
  return `<div class="fin-shell-workspace fin-shell-workspace--compact">
    <div class="fin-shell-banner">
      <h2 class="fin-shell-banner-title">Configuration</h2>
      <p class="fin-shell-banner-lede">Financial settings are read-only placeholders. Categories are managed under the Categories tab.</p>
      <p class="fin-capability-badge fin-capability-badge--unavailable">Unavailable</p>
    </div>
    <div class="fin-table-wrap">
      <table class="fin-table fin-table-compact fin-shell-settings-table">
        <thead><tr><th scope="col">Setting</th><th scope="col">Value</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="fin-shell-actions">${disabledAction('Save settings', 'No settings API wired')}</div>
  </div>`;
}
