/**
 * Finance Overview — dashboard layout, movement, expenses & quotations panels.
 */
import { escapeHtml } from '../admin/ui.js';
import { formatMoneyMinor } from './financeDisplay.js';
import { listQuotations } from './financeQuotation.js';
import {
  OVERVIEW_PERIOD_DEFAULTS,
  OVERVIEW_PRESET_LABELS,
  resolveOverviewPeriod,
  filterPostedTransactionsForOverview,
  groupMovementByCurrency,
  groupOutstandingByCurrency,
  listExpenseTransactionsForOverview,
  buildOverviewDashboardStats,
  movementTimeSeriesForCurrency,
  outstandingMinorForCurrency,
} from './financeOverviewCalculations.js';
import { refreshOverviewCharts } from './financeOverviewCharts.js';

function formatShortDate(val) {
  const t = Date.parse(String(val || ''));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : '—';
}

function movementTableRows(groups, formatRow) {
  if (!groups.length) {
    return `<tr><td colspan="4" class="muted">No posted transactions in this period.</td></tr>`;
  }
  return groups.map(formatRow).join('');
}

function outstandingTableRows(groups, emptyLabel) {
  if (!groups.length) {
    return `<tr><td colspan="3" class="muted">${escapeHtml(emptyLabel)}</td></tr>`;
  }
  return groups
    .map(
      (g) => `<tr>
      <td><strong>${escapeHtml(g.currency)}</strong></td>
      <td class="fin-num">${escapeHtml(formatMoneyMinor(g.totalMinor, g.currency))}</td>
      <td>${escapeHtml(String(g.count))} open</td>
    </tr>`
    )
    .join('');
}

function renderAlertsViewBlock() {
  return `<section class="fin-view-block fin-view-block--alerts fin-view-block--unavailable" aria-labelledby="fin-alerts-heading">
    <header class="fin-view-block-head">
      <h3 id="fin-alerts-heading" class="fin-view-block-title"><i class="fa-solid fa-bell" aria-hidden="true"></i> Financial alerts</h3>
      <span class="fin-capability-badge fin-capability-badge--unavailable">Preview</span>
    </header>
    <p class="fin-view-block-lede">Threshold and overdue notifications when alert rules are connected.</p>
    <div class="fin-view-block-body fin-alerts-empty fin-alerts-empty--compact" role="status">
      <i class="fa-solid fa-bell-slash" aria-hidden="true"></i>
      <p><strong>No alerts right now.</strong> This area does not show fabricated figures.</p>
    </div>
  </section>`;
}

function renderCashUnavailablePanel() {
  return `<section class="fin-view-block fin-view-block--cash fin-view-block--unavailable" aria-labelledby="fin-cash-heading">
    <header class="fin-view-block-head">
      <h3 id="fin-cash-heading" class="fin-view-block-title"><i class="fa-solid fa-vault" aria-hidden="true"></i> Cash position</h3>
      <span class="fin-capability-badge fin-capability-badge--unavailable">Unavailable</span>
    </header>
    <p class="fin-view-block-lede">Bank and cash balances are not shown until a reliable cash or bank data source exists. Ledger movement below is <strong>not</strong> cash at bank.</p>
  </section>`;
}

function renderOverviewKpiRow(stats, movement, receivables) {
  const cur = stats.primaryCurrency;
  const primary =
    movement.find((m) => m.currency === cur) || {
      currency: cur,
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
    };
  const netTone = primary.netMinor >= 0 ? 'positive' : 'negative';
  const recvDue = outstandingMinorForCurrency(receivables, cur);

  return `<div class="fin-overview-kpi-row" aria-label="Key performance indicators">
    <article class="fin-kpi fin-kpi--tile fin-kpi--income">
      <div class="fin-kpi-icon"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i></div>
      <div class="fin-kpi-body">
        <span class="fin-kpi-label">Income · ${escapeHtml(cur)}</span>
        <span class="fin-kpi-value">${escapeHtml(formatMoneyMinor(primary.incomeMinor, cur))}</span>
        <span class="fin-kpi-sub">${escapeHtml(String(stats.incomeTxCount))} posted</span>
      </div>
    </article>
    <article class="fin-kpi fin-kpi--tile fin-kpi--expense">
      <div class="fin-kpi-icon"><i class="fa-solid fa-arrow-trend-down" aria-hidden="true"></i></div>
      <div class="fin-kpi-body">
        <span class="fin-kpi-label">Expenses · ${escapeHtml(cur)}</span>
        <span class="fin-kpi-value">${escapeHtml(formatMoneyMinor(primary.expenseMinor, cur))}</span>
        <span class="fin-kpi-sub">${escapeHtml(String(stats.expenseTxCount))} posted</span>
      </div>
    </article>
    <article class="fin-kpi fin-kpi--tile fin-kpi--net fin-kpi--${netTone}">
      <div class="fin-kpi-icon"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i></div>
      <div class="fin-kpi-body">
        <span class="fin-kpi-label">Net movement · ${escapeHtml(cur)}</span>
        <span class="fin-kpi-value">${escapeHtml(formatMoneyMinor(primary.netMinor, cur))}</span>
        <span class="fin-kpi-sub">${escapeHtml(String(stats.postedCount))} transactions</span>
      </div>
    </article>
    <article class="fin-kpi fin-kpi--tile fin-kpi--recv">
      <div class="fin-kpi-icon"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></div>
      <div class="fin-kpi-body">
        <span class="fin-kpi-label">Receivables due · ${escapeHtml(cur)}</span>
        <span class="fin-kpi-value">${escapeHtml(formatMoneyMinor(recvDue, cur))}</span>
        <span class="fin-kpi-sub">${escapeHtml(String(stats.recvCount))} open invoices</span>
      </div>
    </article>
  </div>`;
}

function renderOverviewChartsGrid(periodLabel, movement, cur) {
  const empty = '<p class="fin-overview-empty">No data to chart yet.</p>';
  return `<section class="fin-overview-charts-section" aria-labelledby="fin-charts-heading">
    <h3 id="fin-charts-heading" class="fin-overview-section-label">Charts · ${escapeHtml(periodLabel)}</h3>
    <div class="fin-dash-charts fin-dash-charts--quad">
      <article class="fin-chart-card">
        <header class="fin-chart-card-head">
          <h4><i class="fa-solid fa-chart-column"></i> Income vs expenses by currency</h4>
          <p>Posted ledger · ${escapeHtml(periodLabel)}</p>
        </header>
        <div class="fin-chart-canvas-wrap">
          ${movement.length ? '<canvas id="finChartCurrencyBar" role="img" aria-label="Bar chart of income and expenses by currency"></canvas>' : empty}
        </div>
      </article>
      <article class="fin-chart-card">
        <header class="fin-chart-card-head">
          <h4><i class="fa-solid fa-chart-line"></i> Movement trend · ${escapeHtml(cur)}</h4>
          <p>Income, expenses and net over time (ledger, not bank cash)</p>
        </header>
        <div class="fin-chart-canvas-wrap">
          <canvas id="finChartTrendLine" role="img" aria-label="Line chart of movement over time"></canvas>
        </div>
      </article>
      <article class="fin-chart-card">
        <header class="fin-chart-card-head">
          <h4><i class="fa-solid fa-chart-pie"></i> Mix · ${escapeHtml(cur)}</h4>
          <p>Income vs expenses share</p>
        </header>
        <div class="fin-chart-canvas-wrap">
          <canvas id="finChartExpenseMix" role="img" aria-label="Doughnut chart of income versus expenses"></canvas>
        </div>
      </article>
      <article class="fin-chart-card">
        <header class="fin-chart-card-head">
          <h4><i class="fa-solid fa-chart-simple"></i> Net by currency</h4>
          <p>Posted net movement in period</p>
        </header>
        <div class="fin-chart-canvas-wrap">
          ${movement.length ? '<canvas id="finChartNetByCurrency" role="img" aria-label="Bar chart of net movement by currency"></canvas>' : empty}
        </div>
      </article>
    </div>
  </section>`;
}

function renderReceivablesBlock(receivables, stats) {
  const cur = stats.primaryCurrency;
  const recvDue = outstandingMinorForCurrency(receivables, cur);
  return `<section class="fin-view-block fin-view-block--recv" aria-labelledby="fin-recv-block-heading">
    <header class="fin-view-block-head">
      <h3 id="fin-recv-block-heading" class="fin-view-block-title"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> Receivables</h3>
      <span class="fin-capability-badge fin-capability-badge--live">As of now</span>
    </header>
    <p class="fin-view-block-lede">Outstanding customer invoices · balance from open receivable documents.</p>
    <p class="fin-view-highlight">${escapeHtml(formatMoneyMinor(recvDue, cur))} <span>due · ${escapeHtml(cur)}</span> · ${escapeHtml(String(stats.recvCount))} open</p>
    <div class="fin-table-wrap">
      <table class="fin-table fin-table-compact fin-overview-table">
        <thead><tr><th scope="col">Currency</th><th scope="col" class="fin-num">Balance due</th><th scope="col">Count</th></tr></thead>
        <tbody>${outstandingTableRows(receivables, 'No open receivables.')}</tbody>
      </table>
    </div>
  </section>`;
}

function renderPayablesBlock(payables, stats) {
  const cur = stats.primaryCurrency;
  const payDue = outstandingMinorForCurrency(payables, cur);
  return `<section class="fin-view-block fin-view-block--pay" aria-labelledby="fin-pay-block-heading">
    <header class="fin-view-block-head">
      <h3 id="fin-pay-block-heading" class="fin-view-block-title"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> Payables</h3>
      <span class="fin-capability-badge fin-capability-badge--live">As of now</span>
    </header>
    <p class="fin-view-block-lede">Outstanding supplier bills · balance from open payable documents.</p>
    <p class="fin-view-highlight">${escapeHtml(formatMoneyMinor(payDue, cur))} <span>due · ${escapeHtml(cur)}</span> · ${escapeHtml(String(stats.payCount))} open</p>
    <div class="fin-table-wrap">
      <table class="fin-table fin-table-compact fin-overview-table">
        <thead><tr><th scope="col">Currency</th><th scope="col" class="fin-num">Balance due</th><th scope="col">Count</th></tr></thead>
        <tbody>${outstandingTableRows(payables, 'No open payables.')}</tbody>
      </table>
    </div>
  </section>`;
}

function renderExpensesPanel(expenses, periodLabel) {
  if (!expenses.length) {
    return `<p class="fin-overview-empty">No expenses recorded for ${escapeHtml(periodLabel)}.</p>`;
  }
  return `<ul class="fin-overview-mini-list">
    ${expenses
      .map((t) => {
        const cur = t.currency || 'ZAR';
        return `<li>
          <button type="button" class="fin-overview-mini-row" data-fin-tx-open="${escapeHtml(t.id)}">
            <span class="fin-overview-mini-title">${escapeHtml(t.description || t.category || 'Expense')}</span>
            <span class="fin-overview-mini-meta">${escapeHtml(formatShortDate(t.occurredAt))}${t.category ? ` · ${escapeHtml(t.category)}` : ''}</span>
            <span class="fin-overview-mini-amt fin-amount--expense">${escapeHtml(formatMoneyMinor(t.amountMinor, cur))}</span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
}

function renderQuotationsPanel(quotations, canCreate) {
  const action = canCreate
    ? `<button type="button" class="btn btn-primary btn-sm" data-fin-action="new-quotation"><i class="fa-solid fa-plus"></i> New quotation</button>`
    : '';
  const header = `<div class="fin-overview-panel-head"><h4>Quotations</h4>${action}</div>`;
  if (!quotations.length) {
    return `${header}<p class="fin-overview-empty">No quotations yet. Create one to send pricing to a customer.</p>`;
  }
  const rows = quotations
    .sort((a, b) => Date.parse(b.issueDate || b.createdAt || 0) - Date.parse(a.issueDate || a.createdAt || 0))
    .slice(0, 8);
  return `${header}<ul class="fin-overview-mini-list">
    ${rows
      .map((q) => {
        const cur = q.currency || 'ZAR';
        return `<li>
          <button type="button" class="fin-overview-mini-row" data-fin-quotation-open="${escapeHtml(q.id)}">
            <span class="fin-overview-mini-title">${escapeHtml(q.counterpartyName || 'Quotation')}</span>
            <span class="fin-overview-mini-meta">${escapeHtml(formatShortDate(q.issueDate))} · ${escapeHtml(q.status || 'draft')}</span>
            <span class="fin-overview-mini-amt">${escapeHtml(formatMoneyMinor(q.totalMinor, cur))}</span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
}

function renderOverviewPeriodControls(op) {
  return `<div class="fin-overview-period-controls" role="group" aria-label="Overview date range">
    <select class="fin-select fin-select--toolbar" data-fin-overview-preset aria-label="Overview date preset">
      <option value="30d" ${op.preset === '30d' ? 'selected' : ''}>${escapeHtml(OVERVIEW_PRESET_LABELS['30d'])}</option>
      <option value="90d" ${op.preset === '90d' ? 'selected' : ''}>${escapeHtml(OVERVIEW_PRESET_LABELS['90d'])}</option>
      <option value="365d" ${op.preset === '365d' ? 'selected' : ''}>${escapeHtml(OVERVIEW_PRESET_LABELS['365d'])}</option>
      <option value="all" ${op.preset === 'all' ? 'selected' : ''}>${escapeHtml(OVERVIEW_PRESET_LABELS.all)}</option>
      <option value="custom" ${op.preset === 'custom' ? 'selected' : ''}>${escapeHtml(OVERVIEW_PRESET_LABELS.custom)}</option>
    </select>
    ${
      op.preset === 'custom'
        ? `<span class="fin-overview-custom-dates">
          <input type="date" class="fin-input fin-input--compact" data-fin-overview-custom-start value="${escapeHtml(op.customStart || '')}" aria-label="Custom range start" />
          <span class="fin-overview-custom-sep" aria-hidden="true">–</span>
          <input type="date" class="fin-input fin-input--compact" data-fin-overview-custom-end value="${escapeHtml(op.customEnd || '')}" aria-label="Custom range end" />
        </span>`
        : ''
    }
  </div>`;
}

/** Overview title, period context line, and preset control (top-right). */
export function renderOverviewHeader(fin) {
  const op = fin.overviewPeriod || OVERVIEW_PERIOD_DEFAULTS;
  const period = resolveOverviewPeriod(op);
  const contextLine = period.valid
    ? `<strong>${escapeHtml(period.label)}</strong> · posted ledger by transaction date · <strong>not combined across currencies</strong>`
    : escapeHtml(period.error || 'Invalid date range.');

  return `<header class="fin-overview-header">
    <div class="fin-overview-header-main">
      <h3 class="fin-section-title">Overview</h3>
      <p class="fin-overview-header-context" role="status">${contextLine}</p>
    </div>
    <div class="fin-overview-header-aside">
      ${renderOverviewPeriodControls(op)}
    </div>
  </header>
  ${
    !period.valid
      ? `<div class="fin-alert fin-alert--warn fin-overview-invalid" role="alert">${escapeHtml(period.error || 'Invalid date range.')}</div>`
      : ''
  }`;
}

export function renderOverviewPanel(fin, opts = {}) {
  const { canCreate = false } = opts;
  const period = resolveOverviewPeriod(fin.overviewPeriod || OVERVIEW_PERIOD_DEFAULTS);

  if (!period.valid) {
    return '';
  }

  const scoped = filterPostedTransactionsForOverview(fin.txs, period);
  const movement = groupMovementByCurrency(scoped);
  const receivables = groupOutstandingByCurrency(fin.invoices, 'receivable');
  const payables = groupOutstandingByCurrency(fin.invoices, 'payable');
  const expenses = listExpenseTransactionsForOverview(fin.txs, period, 10);
  const quotations = listQuotations(fin.invoices);
  const stats = buildOverviewDashboardStats(scoped, receivables, payables, quotations.length);
  const series = movementTimeSeriesForCurrency(scoped, stats.primaryCurrency, period);
  fin._overviewChartPayload = { movement, series, primaryCurrency: stats.primaryCurrency };

  const movementRows = movementTableRows(movement, (g) => {
    const netTone = g.netMinor >= 0 ? 'positive' : 'negative';
    return `<tr>
      <td><strong>${escapeHtml(g.currency)}</strong></td>
      <td class="fin-num fin-amount--income">${escapeHtml(formatMoneyMinor(g.incomeMinor, g.currency))}</td>
      <td class="fin-num fin-amount--expense">${escapeHtml(formatMoneyMinor(g.expenseMinor, g.currency))}</td>
      <td class="fin-num fin-amount--${netTone === 'positive' ? 'income' : 'expense'}">${escapeHtml(formatMoneyMinor(g.netMinor, g.currency))}</td>
    </tr>`;
  });

  const multiCur = movement.length > 1;

  return `
    ${renderOverviewKpiRow(stats, movement, receivables)}
    ${
      multiCur
        ? `<p class="fin-dash-multi-cur-note"><i class="fa-solid fa-coins"></i> Primary KPIs use <strong>${escapeHtml(stats.primaryCurrency)}</strong>. Charts include every currency in this period.</p>`
        : ''
    }
    ${renderOverviewChartsGrid(period.label, movement, stats.primaryCurrency)}
    <div class="fin-four-views" aria-label="Four financial views">
      ${renderCashUnavailablePanel()}
      ${renderReceivablesBlock(receivables, stats)}
      ${renderPayablesBlock(payables, stats)}
      ${renderAlertsViewBlock()}
    </div>
    <div class="fin-overview-dashboard">
      <div class="fin-overview-main">
        <section class="fin-overview-section" aria-labelledby="fin-movement-heading">
          <h3 id="fin-movement-heading" class="fin-section-title">Financial movement (detail)</h3>
          <div class="fin-table-wrap">
            <table class="fin-table fin-table-compact fin-overview-table">
              <thead>
                <tr><th scope="col">Currency</th><th scope="col" class="fin-num">Income</th><th scope="col" class="fin-num">Expenses</th><th scope="col" class="fin-num">Net</th></tr>
              </thead>
              <tbody>${movementRows}</tbody>
            </table>
          </div>
        </section>
      </div>
      <aside class="fin-overview-aside">
        <section class="fin-overview-panel fin-overview-panel--expense" aria-labelledby="fin-expenses-heading">
          <div class="fin-overview-panel-head">
            <h4 id="fin-expenses-heading">Expenses</h4>
            <button type="button" class="btn btn-ghost btn-sm" data-fin-action="view-all-expenses">View all</button>
          </div>
          <p class="fin-overview-panel-lede">Posted expenses in ${escapeHtml(period.label)}.</p>
          ${renderExpensesPanel(expenses, period.label)}
        </section>
        <section class="fin-overview-panel fin-overview-panel--quote" aria-labelledby="fin-quotations-heading">
          ${renderQuotationsPanel(quotations, canCreate)}
        </section>
      </aside>
    </div>
    <p class="fin-footnote"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Quotations are stored as draft receivable documents until converted to invoices. Voided transactions are excluded from movement.</p>`;
}

export function bindOverviewUi(container, fin, onRepaint, ctx = {}) {
  const { canCreate, onNewQuotation, onViewAllExpenses, onOpenQuotation } = ctx;

  const presetSel = container.querySelector('[data-fin-overview-preset]');
  presetSel?.addEventListener('change', () => {
    if (!fin.overviewPeriod) fin.overviewPeriod = { ...OVERVIEW_PERIOD_DEFAULTS };
    fin.overviewPeriod.preset = presetSel.value;
    onRepaint();
  });

  container.querySelector('[data-fin-overview-custom-start]')?.addEventListener('change', (e) => {
    if (!fin.overviewPeriod) fin.overviewPeriod = { ...OVERVIEW_PERIOD_DEFAULTS };
    fin.overviewPeriod.customStart = e.target.value;
    onRepaint();
  });
  container.querySelector('[data-fin-overview-custom-end]')?.addEventListener('change', (e) => {
    if (!fin.overviewPeriod) fin.overviewPeriod = { ...OVERVIEW_PERIOD_DEFAULTS };
    fin.overviewPeriod.customEnd = e.target.value;
    onRepaint();
  });

  container.querySelector('[data-fin-action="new-quotation"]')?.addEventListener('click', () => {
    onNewQuotation?.();
  });
  container.querySelector('[data-fin-action="view-all-expenses"]')?.addEventListener('click', () => {
    onViewAllExpenses?.();
  });
  container.querySelectorAll('[data-fin-quotation-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onOpenQuotation?.(btn.getAttribute('data-fin-quotation-open'));
    });
  });

  requestAnimationFrame(() => refreshOverviewCharts(fin, container));
}
