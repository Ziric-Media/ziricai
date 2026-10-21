/**
 * Company Portal — workspace Finance (ledger + invoices; not subscription billing).
 * Uses /api/portal/finance/* ; invoice payments via recordFinanceInvoicePayment when enabled.
 */
import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState } from '../../admin/ui.js';
import { showToast } from '../../admin/ui.js';
import { can } from '../permissions.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { formatMoneyMinor, invoiceBalanceMinor } from '../financeDisplay.js';
import {
  fetchFinanceTransactions,
  fetchFinanceInvoices,
  fetchFinanceCategories,
  patchFinanceInvoice,
  voidFinanceInvoice,
} from '../api.js';
import {
  renderInvoiceUiOverlays,
  bindInvoiceUi,
  openInvoiceEditor,
  openQuotationEditor,
} from '../financeInvoiceUi.js';
import {
  applyTransactionFilters,
  transactionFiltersActive,
  TX_FILTER_DEFAULTS,
} from '../financeTransactionFilters.js';
import { isFinanceQuotation } from '../financeQuotation.js';
import {
  createDefaultTxUiState,
  renderTransactionFiltersBar,
  renderFilteredTotalsStrip,
  renderTransactionUiOverlays,
  bindTransactionUi,
} from '../financeTransactionUi.js';
import { OVERVIEW_PERIOD_DEFAULTS } from '../financeOverviewCalculations.js';
import { renderOverviewHeader, renderOverviewPanel, bindOverviewUi } from '../financeOverviewUi.js';
import {
  FINANCE_WORKSPACES,
  defaultSubTab,
  renderFinanceWorkspaceNav,
  renderFinanceSubNav,
  renderFinanceShellPanel,
} from '../financeWorkspaceNav.js';
import {
  renderCollectionsShell,
  renderBankingShell,
  renderReportsShell,
  renderAuditActivityShell,
  renderAuditSettingsShell,
} from '../financeWorkspaceShells.js';
import {
  createDefaultCreateUiState,
  renderCreateUiOverlays,
  bindCreateUi,
  openCreateTxModal,
  openCreateCatModal,
} from '../financeCreateModals.js';
import {
  initFinanceSarah,
  renderFinanceSarahPageShell,
  syncFinanceSarahAfterPaint,
} from '../financeSarahPanel.js';
import { consumePendingSarahNav } from '../portalWorkforceNav.js';
import { invoiceAcceptsPortalPayment, promptAndRecordInvoicePayment } from '../financePaymentUi.js';

/** Set false to allow invoice payment recording via POST …/invoices/:id/payments. */
const PAYMENTS_UI_DISABLED = false;

/** @type {{ workspace: string, subTab: string, txs: object[], invoices: object[], categories: object[], loading: boolean, error: string|null }} */
let fin = {
  workspace: 'overview',
  subTab: 'transactions',
  overviewPeriod: { ...OVERVIEW_PERIOD_DEFAULTS },
  txs: [],
  invoices: [],
  categories: [],
  loading: false,
  error: null,
  invoiceUi: {
    editorOpen: false,
    editorMode: 'create',
    documentRole: 'invoice',
    draft: null,
    editorErrors: [],
    saving: false,
    detailId: null,
  },
  txUi: createDefaultTxUiState(),
  createUi: createDefaultCreateUiState(),
};

function role() {
  return state.profile?.role;
}

function companyId() {
  return state.companyId;
}

function formatTs(val) {
  if (!val) return '—';
  const t = Date.parse(String(val));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : escapeHtml(String(val));
}

function statusPill(label, variant = 'neutral') {
  return `<span class="fin-pill fin-pill--${variant}">${escapeHtml(label)}</span>`;
}

function invoiceStatusVariant(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'paid') return 'success';
  if (s === 'partial') return 'warn';
  if (s === 'void') return 'danger';
  if (s === 'sent') return 'info';
  return 'neutral';
}

function txTypeIcon(recordType) {
  const t = String(recordType || '').toLowerCase();
  if (t === 'income') return { icon: 'fa-arrow-trend-up', tone: 'income' };
  if (t === 'transfer') return { icon: 'fa-right-left', tone: 'transfer' };
  return { icon: 'fa-arrow-trend-down', tone: 'expense' };
}

function paymentsBanner() {
  if (!PAYMENTS_UI_DISABLED) return '';
  return `<div class="fin-alert fin-alert--warn" role="status">
    <span class="fin-alert-icon" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
    <div class="fin-alert-body">
      <strong>Payment recording is disabled in this build.</strong>
      <p>Drafts, transactions, and invoice status work locally. Live customer payments stay blocked until backend verification completes.</p>
    </div>
  </div>`;
}

function permHints() {
  const r = role();
  const bits = [];
  if (can(r, 'canCreateFinance')) bits.push('Create');
  if (can(r, 'canUpdateFinance')) bits.push('Update');
  if (can(r, 'canVoidFinance')) bits.push('Void');
  if (can(r, 'canExportFinance')) bits.push('Export');
  if (!bits.length) bits.push('Read only');
  return `<div class="fin-role-chip"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${escapeHtml(bits.join(' · '))}</div>`;
}

function sectionToolbar(title, actionHtml = '') {
  return `<div class="fin-section-head">
    <h3 class="fin-section-title">${escapeHtml(title)}</h3>
    ${actionHtml ? `<div class="fin-section-actions">${actionHtml}</div>` : ''}
  </div>`;
}

function renderWorkspaceIntro(workspaceId) {
  const copy = {
    income: {
      title: 'Income & Sales',
      lede: 'Revenue-side ledger and receivable documents. Customer account views will connect in a later phase.',
    },
    expenses: {
      title: 'Expenses & Payables',
      lede: 'Spend and supplier bills. Record payments against sent invoices with remaining balance.',
    },
  }[workspaceId];
  if (!copy) return '';
  return `<div class="fin-workspace-intro">
    <h2 class="fin-workspace-intro-title">${escapeHtml(copy.title)}</h2>
    <p class="fin-workspace-intro-lede">${escapeHtml(copy.lede)}</p>
  </div>`;
}

function applyWorkspaceTransactionDefaults(workspaceId, subTab) {
  if (subTab !== 'transactions') return;
  if (workspaceId === 'income') {
    fin.txUi.filters = { ...TX_FILTER_DEFAULTS, recordType: 'income', status: 'posted' };
  } else if (workspaceId === 'expenses') {
    fin.txUi.filters = { ...TX_FILTER_DEFAULTS, recordType: 'expense', status: 'posted' };
  }
}

function renderOverview() {
  return `${renderOverviewHeader(fin)}${renderOverviewPanel(fin, {
    canCreate: can(role(), 'canCreateFinance'),
  })}`;
}

function renderTransactionsList() {
  const canCreate = can(role(), 'canCreateFinance');
  const canVoid = can(role(), 'canVoidFinance');
  const filters = fin.txUi?.filters;
  const filtered = applyTransactionFilters(fin.txs, filters);
  const rows = [...filtered].sort(
    (a, b) => Date.parse(b.occurredAt || b.createdAt || 0) - Date.parse(a.occurredAt || a.createdAt || 0)
  );
  const defaultCur = fin.txs[0]?.currency || 'ZAR';
  const ws = fin.workspace || 'overview';
  const listTitle =
    ws === 'income' ? 'Income transactions' : ws === 'expenses' ? 'Expense transactions' : 'Transactions';

  const action = canCreate
    ? '<button type="button" class="btn btn-primary btn-sm" data-fin-action="new-tx"><i class="fa-solid fa-plus"></i> New transaction</button>'
    : '';

  const filtersBar = renderTransactionFiltersBar(fin);
  const totalsStrip = rows.length ? renderFilteredTotalsStrip(rows, defaultCur) : '';
  const intro = ws === 'income' || ws === 'expenses' ? renderWorkspaceIntro(ws) : '';

  if (!fin.txs.length) {
    return `${intro}${sectionToolbar(listTitle, action)}${filtersBar}${renderEmptyState({ title: 'No transactions yet', message: 'Record income, expenses, or transfers once you have create permission.' })}`;
  }

  if (!rows.length) {
    return `${intro}${sectionToolbar(listTitle, action)}${filtersBar}${renderEmptyState({
      title: 'No matching transactions',
      message: transactionFiltersActive(filters)
        ? 'Try adjusting filters or clear them to see all transactions.'
        : 'No transactions match the current view.',
    })}`;
  }

  return `${intro}${sectionToolbar(listTitle, action)}${filtersBar}${totalsStrip}<div class="fin-card-list">
    ${rows
      .map((t) => {
        const cur = t.currency || 'ZAR';
        const voided = t.status === 'void';
        const amt = formatMoneyMinor(t.amountMinor, cur);
        const type = txTypeIcon(t.recordType);
        return `<article class="fin-card fin-card--clickable ${voided ? 'is-void' : ''}" data-fin-tx-open="${escapeHtml(t.id)}" role="button" tabindex="0">
          <div class="fin-card-leading fin-card-leading--${type.tone}">
            <i class="fa-solid ${type.icon}" aria-hidden="true"></i>
          </div>
          <div class="fin-card-main">
            <h4 class="fin-card-title">${escapeHtml(t.description || t.category || t.recordType || 'Transaction')}</h4>
            <p class="fin-card-meta">${escapeHtml(t.recordType || '')} · ${formatTs(t.occurredAt)} · ${escapeHtml(t.category || '')}${t.invoiceId ? ` · Linked invoice` : ''}</p>
            ${voided ? `<p class="fin-card-meta fin-card-meta--void">Void — ${escapeHtml(t.voidReason || '')} · ${formatTs(t.voidedAt)}</p>` : ''}
          </div>
          <div class="fin-card-trailing">
            ${statusPill(voided ? 'Void' : 'Posted', voided ? 'danger' : 'success')}
            <span class="fin-amount fin-amount--${type.tone}">${escapeHtml(amt)}</span>
            ${canVoid && !voided ? `<button type="button" class="btn btn-ghost btn-sm" data-fin-void-tx-open="${escapeHtml(t.id)}">Void</button>` : ''}
          </div>
        </article>`;
      })
      .join('')}
  </div>`;
}

function renderInvoicesList(invoiceKindFilter = null) {
  const canCreate = can(role(), 'canCreateFinance');
  const canUpdate = can(role(), 'canUpdateFinance');
  const canVoid = can(role(), 'canVoidFinance');
  let rows = [...fin.invoices].filter((inv) => !isFinanceQuotation(inv));
  if (invoiceKindFilter === 'receivable' || invoiceKindFilter === 'payable') {
    rows = rows.filter((inv) => inv.invoiceKind === invoiceKindFilter);
  }
  rows.sort((a, b) => Date.parse(b.issueDate || b.createdAt || 0) - Date.parse(a.issueDate || a.createdAt || 0));
  const title =
    invoiceKindFilter === 'payable' ? 'Payable bills' : invoiceKindFilter === 'receivable' ? 'Receivable invoices' : 'Invoices';

  const action = canCreate
    ? '<button type="button" class="btn btn-primary btn-sm" data-fin-action="new-inv"><i class="fa-solid fa-plus"></i> New invoice</button>'
    : '';

  const intro =
    invoiceKindFilter === 'receivable'
      ? renderWorkspaceIntro('income')
      : invoiceKindFilter === 'payable'
        ? renderWorkspaceIntro('expenses')
        : '';

  if (!rows.length) {
    return `${intro}${sectionToolbar(title, action)}${renderEmptyState({ title: 'No invoices', message: 'Create receivable or payable documents as drafts, then mark sent when ready.' })}`;
  }

  return `${intro}${sectionToolbar(title, action)}<div class="fin-card-list">
    ${rows
      .map((inv) => {
        const cur = inv.currency || 'ZAR';
        const total = formatMoneyMinor(inv.totalMinor, cur);
        const paid = formatMoneyMinor(inv.amountPaidMinor, cur);
        const bal = formatMoneyMinor(invoiceBalanceMinor(inv), cur);
        const st = String(inv.status || 'draft');
        const kind = inv.invoiceKind === 'payable' ? 'expense' : 'income';
        return `<article class="fin-card fin-card--clickable" data-fin-inv-open="${escapeHtml(inv.id)}" role="button" tabindex="0">
          <div class="fin-card-leading fin-card-leading--${kind}">
            <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
          </div>
          <div class="fin-card-main">
            <h4 class="fin-card-title">${escapeHtml(inv.counterpartyName || 'Invoice')}${inv.invoiceNumber ? ` <span class="fin-card-ref">#${escapeHtml(inv.invoiceNumber)}</span>` : ''}</h4>
            <p class="fin-card-meta">${escapeHtml(inv.invoiceKind || '')} · Issued ${escapeHtml(inv.issueDate || '—')}</p>
            <div class="fin-inv-amounts">
              <span><em>Total</em> ${escapeHtml(total)}</span>
              <span><em>Paid</em> ${escapeHtml(paid)}</span>
              <span class="fin-inv-balance"><em>Balance</em> ${escapeHtml(bal)}</span>
            </div>
          </div>
          <div class="fin-card-trailing">
            ${statusPill(st, invoiceStatusVariant(st))}
            <div class="fin-card-actions">
              ${canUpdate && st === 'draft' ? `<button type="button" class="btn btn-secondary btn-sm" data-fin-send-inv="${escapeHtml(inv.id)}">Mark sent</button>` : ''}
              ${
                PAYMENTS_UI_DISABLED
                  ? '<span class="fin-pay-disabled" title="Disabled until backend sign-off"><i class="fa-solid fa-lock"></i> Payments off</span>'
                  : can(role(), 'canCreateFinance') && invoiceAcceptsPortalPayment(inv)
                    ? `<button type="button" class="btn btn-primary btn-sm" data-fin-record-pay="${escapeHtml(inv.id)}">Record payment</button>`
                    : ''
              }
              ${canVoid && st !== 'void' && (Number(inv.amountPaidMinor) || 0) === 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-fin-void-inv="${escapeHtml(inv.id)}">Void</button>` : ''}
            </div>
          </div>
        </article>`;
      })
      .join('')}
  </div>`;
}

function renderQuotationsList() {
  const canCreate = can(role(), 'canCreateFinance');
  const rows = fin.invoices.filter((inv) => isFinanceQuotation(inv)).sort(
    (a, b) => Date.parse(b.issueDate || b.createdAt || 0) - Date.parse(a.issueDate || a.createdAt || 0)
  );
  const action = canCreate
    ? '<button type="button" class="btn btn-primary btn-sm" data-fin-action="new-quotation"><i class="fa-solid fa-plus"></i> New quotation</button>'
    : '';
  const intro = renderWorkspaceIntro('income');
  if (!rows.length) {
    return `${intro}${sectionToolbar('Quotations', action)}${renderEmptyState({ title: 'No quotations', message: 'Draft pricing documents appear here before conversion to invoices.' })}`;
  }
  return `${intro}${sectionToolbar('Quotations', action)}<div class="fin-card-list">
    ${rows
      .map((q) => {
        const cur = q.currency || 'ZAR';
        return `<article class="fin-card fin-card--clickable" data-fin-quotation-open="${escapeHtml(q.id)}" role="button" tabindex="0">
          <div class="fin-card-leading fin-card-leading--income"><i class="fa-solid fa-file-signature"></i></div>
          <div class="fin-card-main">
            <h4 class="fin-card-title">${escapeHtml(q.counterpartyName || 'Quotation')}</h4>
            <p class="fin-card-meta">${escapeHtml(formatTs(q.issueDate))} · ${escapeHtml(q.status || 'draft')}</p>
          </div>
          <div class="fin-card-trailing"><span class="fin-amount">${escapeHtml(formatMoneyMinor(q.totalMinor, cur))}</span></div>
        </article>`;
      })
      .join('')}
  </div>`;
}

function renderCategoriesList() {
  const canCreate = can(role(), 'canCreateFinance');
  const action = canCreate
    ? '<button type="button" class="btn btn-primary btn-sm" data-fin-action="new-cat"><i class="fa-solid fa-plus"></i> Add category</button>'
    : '';
  const ws = fin.workspace || 'expenses';
  const intro =
    ws === 'audit'
      ? `<div class="fin-workspace-intro"><h2 class="fin-workspace-intro-title">Categories</h2><p class="fin-workspace-intro-lede">Tenant chart for classifying ledger transactions (shared across workspaces).</p></div>`
      : renderWorkspaceIntro('expenses');
  if (!fin.categories.length) {
    return `${intro}${sectionToolbar('Categories', action)}${renderEmptyState({ title: 'No categories', message: 'Optional chart for classifying transactions.' })}`;
  }
  return `${intro}${sectionToolbar('Categories', action)}<div class="fin-cat-grid">
    ${fin.categories
      .map((c) => {
        const k = String(c.kind || 'both');
        const icon = k === 'income' ? 'fa-arrow-trend-up' : k === 'expense' ? 'fa-arrow-trend-down' : 'fa-layer-group';
        return `<article class="fin-cat-card">
          <div class="fin-cat-icon"><i class="fa-solid ${icon}"></i></div>
          <h4>${escapeHtml(c.name)}</h4>
          <span class="fin-pill fin-pill--neutral">${escapeHtml(k)}</span>
        </article>`;
      })
      .join('')}
  </div>`;
}

function workspaceMeta(id) {
  return FINANCE_WORKSPACES.find((w) => w.id === id) || FINANCE_WORKSPACES[0];
}

function renderBody() {
  const ws = fin.workspace || 'overview';
  const meta = workspaceMeta(ws);

  if (ws === 'collections') return renderCollectionsShell(fin.subTab || 'accounts');
  if (ws === 'banking') return renderBankingShell(fin.subTab || 'accounts');
  if (ws === 'reports') return renderReportsShell(fin.subTab || 'catalogue');

  if (meta.mode === 'shell' && ws !== 'audit') {
    return renderFinanceShellPanel(ws);
  }

  if (ws === 'overview') return renderOverview();

  if (ws === 'sarah') return renderFinanceSarahPageShell();

  if (ws === 'income') {
    if (fin.subTab === 'invoices') return renderInvoicesList('receivable');
    if (fin.subTab === 'quotations') return renderQuotationsList();
    return renderTransactionsList();
  }

  if (ws === 'expenses') {
    if (fin.subTab === 'invoices') return renderInvoicesList('payable');
    if (fin.subTab === 'categories') return renderCategoriesList();
    return renderTransactionsList();
  }

  if (ws === 'audit') {
    if (fin.subTab === 'categories') return renderCategoriesList();
    if (fin.subTab === 'activity') return renderAuditActivityShell();
    if (fin.subTab === 'settings') return renderAuditSettingsShell();
  }

  return renderFinanceShellPanel(ws);
}

async function reloadData() {
  const cid = companyId();
  if (!cid) throw new Error('Company context missing');
  fin.loading = true;
  fin.error = null;
  const [txRes, invRes, catRes] = await Promise.all([
    fetchFinanceTransactions(cid),
    fetchFinanceInvoices(cid),
    fetchFinanceCategories(cid),
  ]);
  fin.txs = txRes?.items || txRes?.data?.items || [];
  fin.invoices = invRes?.items || invRes?.data?.items || [];
  fin.categories = catRes?.items || catRes?.data?.items || [];
  fin.loading = false;
}

function paint(container) {
  const onSarah = fin.workspace === 'sarah';
  container.innerHTML = `
    <div class="fin-module ${onSarah ? 'fin-module--sarah' : ''}">
      ${pageHeader(
        'Sarah Finance',
        onSarah
          ? 'Sarah — Finance assistant'
          : 'Workspace ledger — income, expenses, and invoices (not subscription billing).'
      )}
      ${
        onSarah
          ? ''
          : `<div class="fin-top">
        ${paymentsBanner()}
        <div class="fin-top-meta">${permHints()}</div>
      </div>`
      }
      ${renderFinanceWorkspaceNav(fin)}
      <div class="fin-workspace-stack ${onSarah ? 'fin-workspace-stack--sarah' : ''}">
        ${onSarah ? '' : renderFinanceSubNav(fin)}
        <div class="fin-panel card fin-panel-card fin-panel-card--full ${onSarah ? 'fin-panel-card--sarah' : ''}">
          ${onSarah ? renderBody() : fin.loading ? '<div class="fin-loading"><span class="fin-loading-dot"></span><span class="fin-loading-dot"></span><span class="fin-loading-dot"></span><p>Loading finance data…</p></div>' : renderBody()}
        </div>
      </div>
      ${renderInvoiceUiOverlays(fin, {
        canUpdate: can(role(), 'canUpdateFinance'),
        canCreate: can(role(), 'canCreateFinance'),
        canVoid: can(role(), 'canVoidFinance'),
        paymentsDisabled: PAYMENTS_UI_DISABLED,
      })}
      ${renderTransactionUiOverlays(fin, {
        canVoid: can(role(), 'canVoidFinance'),
      })}
      ${renderCreateUiOverlays(fin)}
    </div>
  `;
  bindFinanceEvents(container);
  void syncFinanceSarahAfterPaint(container, () => fin);
  const repainOverview = () => paint(container);
  bindOverviewUi(container, fin, repainOverview, {
    canCreate: can(role(), 'canCreateFinance'),
    onNewQuotation: () => {
      openQuotationEditor(fin, 'create');
      paint(container);
    },
    onViewAllExpenses: () => {
      const preset = fin.overviewPeriod?.preset || '90d';
      fin.txUi.filters = {
        ...TX_FILTER_DEFAULTS,
        recordType: 'expense',
        status: 'posted',
        dateRange: preset === 'custom' ? 'all' : preset,
      };
      fin.workspace = 'expenses';
      fin.subTab = 'transactions';
      paint(container);
    },
    onOpenQuotation: (id) => {
      fin.invoiceUi.detailId = id;
      paint(container);
    },
  });
  bindTransactionUi(container, fin, {
    companyId,
    canVoid: can(role(), 'canVoidFinance'),
    onRefresh: reloadData,
    onRepaint: () => paint(container),
    onOpenInvoice: (invoiceId) => {
      fin.invoiceUi.detailId = invoiceId;
    },
  });
  bindInvoiceUi(container, fin, {
    companyId,
    canUpdate: can(role(), 'canUpdateFinance'),
    canCreate: can(role(), 'canCreateFinance'),
    canVoid: can(role(), 'canVoidFinance'),
    paymentsDisabled: PAYMENTS_UI_DISABLED,
    onRefresh: reloadData,
    onRepaint: () => paint(container),
  });
  bindCreateUi(container, fin, {
    companyId,
    canCreate: can(role(), 'canCreateFinance'),
    onRefresh: reloadData,
    onRepaint: () => paint(container),
  });
}

function bindFinanceEvents(container) {
  const setWorkspace = (id) => {
    fin.workspace = id || 'overview';
    fin.subTab = defaultSubTab(fin.workspace);
    applyWorkspaceTransactionDefaults(fin.workspace, fin.subTab);
    paint(container);
  };

  container.querySelectorAll('[data-fin-workspace]').forEach((btn) => {
    btn.addEventListener('click', () => setWorkspace(btn.getAttribute('data-fin-workspace')));
  });
  container.querySelector('[data-fin-workspace-select]')?.addEventListener('change', (e) => {
    setWorkspace(e.target.value);
  });
  container.querySelectorAll('[data-fin-subtab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fin.subTab = btn.getAttribute('data-fin-subtab') || defaultSubTab(fin.workspace);
      applyWorkspaceTransactionDefaults(fin.workspace, fin.subTab);
      paint(container);
    });
  });

  container.querySelector('[data-fin-action="new-tx"]')?.addEventListener('click', () => {
    openCreateTxModal(fin, fin.workspace);
    paint(container);
  });
  container.querySelector('[data-fin-action="new-quotation"]')?.addEventListener('click', () => {
    openQuotationEditor(fin, 'create');
    paint(container);
  });
  container.querySelectorAll('[data-fin-quotation-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fin.invoiceUi.detailId = btn.getAttribute('data-fin-quotation-open');
      paint(container);
    });
  });
  container.querySelector('[data-fin-action="new-inv"]')?.addEventListener('click', () => {
    openInvoiceEditor(fin, 'create');
    paint(container);
  });
  container.querySelector('[data-fin-action="new-cat"]')?.addEventListener('click', () => {
    openCreateCatModal(fin);
    paint(container);
  });

  container.querySelectorAll('[data-fin-send-inv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-fin-send-inv');
      try {
        await patchFinanceInvoice(companyId(), id, { status: 'sent' });
        showToast('Invoice marked sent', 'success');
        await reloadData();
        paint(container);
      } catch (e) {
        showToast(e?.message || 'Update failed', 'error');
      }
    });
  });

  container.querySelectorAll('[data-fin-void-inv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-fin-void-inv');
      const reason = window.prompt('Reason for voiding this invoice (required):');
      if (!reason?.trim()) return;
      try {
        await voidFinanceInvoice(companyId(), id, reason.trim());
        showToast('Invoice voided', 'success');
        await reloadData();
        paint(container);
      } catch (e) {
        showToast(e?.message || 'Void failed', 'error');
      }
    });
  });

  container.querySelectorAll('[data-fin-record-pay]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-fin-record-pay');
      const inv = fin.invoices.find((i) => i.id === id);
      if (!inv) return;
      const ok = await promptAndRecordInvoicePayment(companyId(), inv);
      if (ok) {
        await reloadData();
        paint(container);
      }
    });
  });
}

export async function renderFinance(container) {
  if (!can(role(), 'canViewFinance')) {
    container.innerHTML = errorState('You do not have permission to view Finance.');
    return;
  }
  const pendingWorkspace = consumePendingSarahNav('finance');
  if (pendingWorkspace) fin.workspace = pendingWorkspace;
  container.classList.add('fin-module-page');
  initFinanceSarah(container, () => fin);
  fin.loading = true;
  paint(container);
  try {
    await reloadData();
    paint(container);
  } catch (err) {
    fin.loading = false;
    fin.error = err?.message || 'Failed to load finance data';
    container.innerHTML = `${pageHeader('Sarah Finance')}${errorState(fin.error)}`;
  }
}
