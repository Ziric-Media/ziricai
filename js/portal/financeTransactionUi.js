/**
 * Finance — transaction filters, detail drawer, void confirmation (portal UI).
 */
import { escapeHtml, showToast } from '../admin/ui.js';
import { formatMoneyMinor } from './financeDisplay.js';
import { voidFinanceTransaction } from './api.js';
import {
  TX_FILTER_DEFAULTS,
  applyTransactionFilters,
  transactionFiltersActive,
  sumFilteredPostedTotals,
} from './financeTransactionFilters.js';

export {
  TX_FILTER_DEFAULTS,
  applyTransactionFilters,
  transactionFiltersActive,
  sumFilteredPostedTotals,
} from './financeTransactionFilters.js';

export function createDefaultTxUiState() {
  return {
    filters: { ...TX_FILTER_DEFAULTS },
    detailId: null,
    voidModal: {
      open: false,
      txId: null,
      reason: '',
      errors: [],
      submitting: false,
    },
  };
}

function formatTs(val) {
  if (val == null || val === '') return null;
  const t = Date.parse(String(val));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : String(val);
}

function formatTsDisplay(val) {
  const formatted = formatTs(val);
  return formatted == null ? '—' : formatted;
}

function statusPillHtml(label, variant) {
  return `<span class="fin-pill fin-pill--${variant}">${escapeHtml(label)}</span>`;
}

function txStatusVariant(status) {
  return String(status || 'posted') === 'void' ? 'danger' : 'success';
}

function txTypeIcon(recordType) {
  const t = String(recordType || '').toLowerCase();
  if (t === 'income') return { icon: 'fa-arrow-trend-up', tone: 'income' };
  if (t === 'transfer') return { icon: 'fa-right-left', tone: 'transfer' };
  return { icon: 'fa-arrow-trend-down', tone: 'expense' };
}

function categoryOptions(fin) {
  const names = new Set();
  for (const c of fin.categories || []) {
    if (c?.name) names.add(String(c.name));
  }
  for (const t of fin.txs || []) {
    if (t?.category) names.add(String(t.category));
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function renderTransactionFiltersBar(fin) {
  const f = fin.txUi?.filters || TX_FILTER_DEFAULTS;
  const cats = categoryOptions(fin);
  const active = transactionFiltersActive(f);
  return `
  <div class="fin-filters" role="search" aria-label="Transaction filters">
    <div class="fin-filters-grid">
      <label class="fin-field"><span>Date range</span>
        <select class="fin-select" data-fin-tx-filter="dateRange" aria-label="Date range">
          <option value="30d" ${f.dateRange === '30d' ? 'selected' : ''}>Last 30 days</option>
          <option value="90d" ${f.dateRange === '90d' ? 'selected' : ''}>Last 90 days</option>
          <option value="365d" ${f.dateRange === '365d' ? 'selected' : ''}>Last 12 months</option>
          <option value="all" ${f.dateRange === 'all' ? 'selected' : ''}>All time</option>
        </select>
      </label>
      <label class="fin-field"><span>Type</span>
        <select class="fin-select" data-fin-tx-filter="recordType" aria-label="Transaction type">
          <option value="" ${!f.recordType ? 'selected' : ''}>All types</option>
          <option value="income" ${f.recordType === 'income' ? 'selected' : ''}>Income</option>
          <option value="expense" ${f.recordType === 'expense' ? 'selected' : ''}>Expense</option>
          <option value="transfer" ${f.recordType === 'transfer' ? 'selected' : ''}>Transfer</option>
        </select>
      </label>
      <label class="fin-field"><span>Category</span>
        <select class="fin-select" data-fin-tx-filter="category" aria-label="Category">
          <option value="" ${!f.category ? 'selected' : ''}>All categories</option>
          ${cats.map((c) => `<option value="${escapeHtml(c)}" ${f.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </label>
      <label class="fin-field"><span>Status</span>
        <select class="fin-select" data-fin-tx-filter="status" aria-label="Status">
          <option value="all" ${f.status === 'all' ? 'selected' : ''}>All statuses</option>
          <option value="posted" ${f.status === 'posted' ? 'selected' : ''}>Posted</option>
          <option value="void" ${f.status === 'void' ? 'selected' : ''}>Void</option>
        </select>
      </label>
    </div>
    ${
      active
        ? `<button type="button" class="btn btn-ghost btn-sm fin-filters-clear" data-fin-tx-clear-filters><i class="fa-solid fa-filter-circle-xmark"></i> Clear filters</button>`
        : ''
    }
  </div>`;
}

export function renderFilteredTotalsStrip(filteredRows, defaultCur) {
  const { income, expense, net } = sumFilteredPostedTotals(filteredRows);
  const cur = defaultCur || 'ZAR';
  return `
  <div class="fin-filtered-totals" role="status" aria-live="polite">
    <p class="fin-filtered-totals-label"><i class="fa-solid fa-calculator"></i> Totals for filtered view (posted transactions only)</p>
    <div class="fin-filtered-totals-grid">
      <span><em>Income</em> ${escapeHtml(formatMoneyMinor(income, cur))}</span>
      <span><em>Expenses</em> ${escapeHtml(formatMoneyMinor(expense, cur))}</span>
      <span><em>Net</em> ${escapeHtml(formatMoneyMinor(net, cur))}</span>
    </div>
  </div>`;
}

function auditDlRow(label, value) {
  if (value == null || value === '') return '';
  return `<div class="fin-dl-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`;
}

function renderAuditSection(title, rowsHtml) {
  if (!rowsHtml.trim()) return '';
  return `<section class="fin-audit-block"><h3 class="fin-subhead">${escapeHtml(title)}</h3><dl class="fin-dl">${rowsHtml}</dl></section>`;
}

function linkedInvoiceHtml(invoice, tx) {
  if (!tx.invoiceId) return '';
  if (!invoice) {
    return `<p class="fin-muted-line"><strong>Linked invoice</strong> · ID ${escapeHtml(tx.invoiceId)} (not in current list)</p>`;
  }
  const label = [invoice.counterpartyName, invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : '']
    .filter(Boolean)
    .join(' ');
  return `<p class="fin-linked-inv">
    <strong>Linked invoice</strong>
    <button type="button" class="btn btn-link btn-sm" data-fin-tx-open-invoice="${escapeHtml(invoice.id)}">${escapeHtml(label || invoice.id)}</button>
  </p>`;
}

function renderTransactionDetailDrawer(tx, invoice, opts) {
  const { canVoid } = opts;
  const cur = tx.currency || 'ZAR';
  const voided = tx.status === 'void';
  const type = txTypeIcon(tx.recordType);
  const creationRows = [
    auditDlRow('Recorded at', formatTs(tx.createdAt)),
    auditDlRow('Created by (user ID)', tx.createdByUid),
    auditDlRow('Last updated at', formatTs(tx.updatedAt)),
    auditDlRow('Updated by (user ID)', tx.updatedByUid),
  ].join('');

  const voidRows = voided
    ? [
        auditDlRow('Voided at', formatTs(tx.voidedAt)),
        auditDlRow('Voided by (user ID)', tx.voidedByUid),
        auditDlRow('Void reason', tx.voidReason),
      ].join('')
    : '';

  return `
  <div class="fin-overlay fin-overlay--drawer" data-fin-overlay="tx-detail">
    <div class="fin-drawer" role="dialog" aria-labelledby="fin-tx-detail-title">
      <header class="fin-drawer-head">
        <div>
          <h2 id="fin-tx-detail-title">${escapeHtml(tx.description || tx.category || 'Transaction')}</h2>
          <p class="fin-drawer-sub">${escapeHtml(tx.recordType || '')} · ${escapeHtml(formatTsDisplay(tx.occurredAt))}</p>
        </div>
        <button type="button" class="fin-modal-close" data-fin-close-tx-detail aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="fin-drawer-body">
        <div class="fin-detail-badges">
          ${statusPillHtml(voided ? 'Void' : 'Posted', txStatusVariant(tx.status))}
          <span class="fin-amount fin-amount--${type.tone}">${escapeHtml(formatMoneyMinor(tx.amountMinor, cur))}</span>
        </div>
        <dl class="fin-dl fin-dl--detail">
          ${auditDlRow('Type', tx.recordType)}
          ${auditDlRow('Description', tx.description)}
          ${auditDlRow('Counterparty', invoice?.counterpartyName)}
          ${auditDlRow('Contact ID', tx.contactId)}
          ${auditDlRow('Category', tx.category)}
          ${auditDlRow('Amount', formatMoneyMinor(tx.amountMinor, cur))}
          ${auditDlRow('Currency', tx.currency)}
          ${auditDlRow('Transaction date', formatTsDisplay(tx.occurredAt))}
          ${auditDlRow('Direction', tx.direction)}
          ${auditDlRow('Payment method', tx.paymentMethod)}
          ${auditDlRow('Reference', tx.reference)}
          ${auditDlRow('Status', tx.status || 'posted')}
        </dl>
        ${linkedInvoiceHtml(invoice, tx)}
        ${renderAuditSection('Creation & updates', creationRows)}
        ${voided ? renderAuditSection('Void audit', voidRows) : ''}
      </div>
      <footer class="fin-drawer-foot">
        ${canVoid && !voided ? `<button type="button" class="btn btn-ghost btn-sm" data-fin-tx-detail-void>Void transaction</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-fin-close-tx-detail>Close</button>
      </footer>
    </div>
  </div>`;
}

function renderVoidTxModal(ui) {
  const vm = ui.voidModal;
  if (!vm?.open) return '';
  const errors = vm.errors?.length
    ? `<ul class="fin-form-errors">${vm.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';
  return `
  <div class="fin-overlay fin-overlay--modal" data-fin-overlay="void-tx">
    <div class="fin-modal fin-modal--compact" role="dialog" aria-labelledby="fin-void-tx-title" aria-modal="true">
      <header class="fin-modal-head">
        <h2 id="fin-void-tx-title">Void transaction?</h2>
        <button type="button" class="fin-modal-close" data-fin-close-void-tx aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="fin-modal-body">
        ${errors}
        <p class="fin-void-copy">Voiding keeps this entry in the audit trail but marks it void. If this transaction is linked to an invoice, the invoice paid balance is recalculated from remaining posted ledger entries.</p>
        <label class="fin-field fin-field-wide"><span>Reason (required)</span>
          <textarea class="fin-input fin-textarea" data-fin-void-reason rows="3" placeholder="Why is this transaction being voided?" ${vm.submitting ? 'disabled' : ''}>${escapeHtml(vm.reason || '')}</textarea>
        </label>
      </div>
      <footer class="fin-modal-foot">
        <button type="button" class="btn btn-secondary" data-fin-close-void-tx ${vm.submitting ? 'disabled' : ''}>Cancel</button>
        <button type="button" class="btn btn-primary fin-btn-danger" data-fin-confirm-void-tx ${vm.submitting ? 'disabled' : ''}>
          ${vm.submitting ? 'Voiding…' : 'Void transaction'}
        </button>
      </footer>
    </div>
  </div>`;
}

export function renderTransactionUiOverlays(fin, opts) {
  let html = '';
  const ui = fin.txUi;
  if (ui?.voidModal?.open) {
    html += renderVoidTxModal(ui);
  }
  if (ui?.detailId) {
    const tx = fin.txs.find((t) => t.id === ui.detailId);
    if (tx) {
      const invoice = tx.invoiceId ? fin.invoices.find((i) => i.id === tx.invoiceId) : null;
      html += renderTransactionDetailDrawer(tx, invoice, opts);
    }
  }
  return html;
}

export function openVoidTxModal(fin, txId) {
  fin.txUi.voidModal = {
    open: true,
    txId,
    reason: '',
    errors: [],
    submitting: false,
  };
}

export function closeVoidTxModal(fin) {
  fin.txUi.voidModal = {
    open: false,
    txId: null,
    reason: '',
    errors: [],
    submitting: false,
  };
}

export function bindTransactionUi(container, fin, ctx) {
  const { companyId, canVoid, onRefresh, onRepaint, onOpenInvoice } = ctx;

  container.querySelectorAll('[data-fin-tx-filter]').forEach((el) => {
    el.addEventListener('change', () => {
      const key = el.getAttribute('data-fin-tx-filter');
      if (!fin.txUi.filters) fin.txUi.filters = { ...TX_FILTER_DEFAULTS };
      fin.txUi.filters[key] = el.value;
      onRepaint();
    });
  });

  container.querySelector('[data-fin-tx-clear-filters]')?.addEventListener('click', () => {
    fin.txUi.filters = { ...TX_FILTER_DEFAULTS };
    onRepaint();
  });

  container.querySelectorAll('[data-fin-tx-open]').forEach((el) => {
    const open = () => {
      fin.txUi.detailId = el.getAttribute('data-fin-tx-open');
      onRepaint();
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      open();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });

  const closeTxDetail = () => {
    fin.txUi.detailId = null;
    onRepaint();
  };
  container.querySelectorAll('[data-fin-close-tx-detail]').forEach((btn) => {
    btn.addEventListener('click', closeTxDetail);
  });
  container.querySelector('[data-fin-overlay="tx-detail"]')?.addEventListener('click', (e) => {
    if (e.target.matches('[data-fin-overlay="tx-detail"]')) closeTxDetail();
  });

  container.querySelectorAll('[data-fin-tx-open-invoice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-fin-tx-open-invoice');
      if (id && onOpenInvoice) {
        fin.txUi.detailId = null;
        onOpenInvoice(id);
        onRepaint();
      }
    });
  });

  container.querySelector('[data-fin-tx-detail-void]')?.addEventListener('click', () => {
    if (!fin.txUi.detailId) return;
    openVoidTxModal(fin, fin.txUi.detailId);
    onRepaint();
  });

  container.querySelectorAll('[data-fin-void-tx-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-fin-void-tx-open');
      openVoidTxModal(fin, id);
      onRepaint();
    });
  });

  const voidOverlay = container.querySelector('[data-fin-overlay="void-tx"]');
  if (voidOverlay) {
    const closeVoid = () => {
      if (fin.txUi.voidModal.submitting) return;
      closeVoidTxModal(fin);
      onRepaint();
    };
    voidOverlay.querySelectorAll('[data-fin-close-void-tx]').forEach((b) => b.addEventListener('click', closeVoid));
    voidOverlay.addEventListener('click', (e) => {
      if (e.target === voidOverlay) closeVoid();
    });

    voidOverlay.querySelector('[data-fin-confirm-void-tx]')?.addEventListener('click', async () => {
      const ta = voidOverlay.querySelector('[data-fin-void-reason]');
      fin.txUi.voidModal.reason = ta?.value ?? '';
      const reason = String(fin.txUi.voidModal.reason).trim();
      if (!reason) {
        fin.txUi.voidModal.errors = ['A void reason is required.'];
        onRepaint();
        return;
      }
      const txId = fin.txUi.voidModal.txId;
      const reopenDetail = fin.txUi.detailId === txId;
      fin.txUi.voidModal.reason = reason;
      fin.txUi.voidModal.errors = [];
      fin.txUi.voidModal.submitting = true;
      onRepaint();
      try {
        await voidFinanceTransaction(companyId(), txId, reason);
        showToast('Transaction voided', 'success');
        closeVoidTxModal(fin);
        await onRefresh();
        fin.txUi.detailId = reopenDetail ? txId : null;
        onRepaint();
      } catch (e) {
        fin.txUi.voidModal.submitting = false;
        fin.txUi.voidModal.errors = [e?.message || 'Void failed'];
        onRepaint();
      }
    });
  }
}
