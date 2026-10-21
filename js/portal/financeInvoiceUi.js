/**
 * Finance — invoice editor modal + detail drawer (portal UI).
 */
import { escapeHtml, showToast } from '../admin/ui.js';
import {
  formatMoneyMinor,
  invoiceBalanceMinor,
  previewClientInvoiceTotals,
  lineItemsForEditor,
  minorToMajor,
} from './financeDisplay.js';
import {
  createFinanceInvoice,
  patchFinanceInvoice,
  voidFinanceInvoice,
} from './api.js';
import { markQuotationNotes, stripQuotationNotes, isFinanceQuotation } from './financeQuotation.js';
import { invoiceAcceptsPortalPayment, promptAndRecordInvoicePayment } from './financePaymentUi.js';

export function createEmptyInvoiceDraft() {
  return {
    id: null,
    invoiceKind: 'receivable',
    counterpartyName: '',
    invoiceNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    currency: 'ZAR',
    taxAmount: '',
    notes: '',
    lineItems: [{ description: '', quantity: 1, unitAmount: '' }],
  };
}

export function draftFromInvoice(invoice) {
  if (!invoice) return createEmptyInvoiceDraft();
  const cur = invoice.currency || 'ZAR';
  return {
    id: invoice.id,
    invoiceKind: invoice.invoiceKind || 'receivable',
    counterpartyName: invoice.counterpartyName || '',
    invoiceNumber: invoice.invoiceNumber || '',
    issueDate: invoice.issueDate || new Date().toISOString().slice(0, 10),
    dueDate: invoice.dueDate || '',
    currency: cur,
    taxAmount:
      invoice.taxAmountMinor != null
        ? String(minorToMajor(Number(invoice.taxAmountMinor), cur))
        : invoice.taxAmount != null
          ? String(invoice.taxAmount)
          : '',
    notes: isFinanceQuotation(invoice) ? stripQuotationNotes(invoice.notes) : invoice.notes || '',
    lineItems: lineItemsForEditor(invoice, cur),
  };
}

function validateDraft(draft) {
  const errors = [];
  if (!String(draft.counterpartyName || '').trim()) {
    errors.push('Counterparty name is required.');
  }
  if (!String(draft.issueDate || '').trim()) {
    errors.push('Issue date is required.');
  }
  if (!String(draft.currency || '').trim()) {
    errors.push('Currency is required.');
  }
  const lines = draft.lineItems || [];
  let validLines = 0;
  for (const li of lines) {
    const desc = String(li.description || '').trim();
    const amt = Number(li.unitAmount);
    if (desc && Number.isFinite(amt) && amt >= 0) validLines += 1;
  }
  if (validLines === 0) {
    errors.push('Add at least one line item with description and unit price.');
  }
  return errors;
}

function buildPayload(draft, documentRole = 'invoice') {
  const lineItems = (draft.lineItems || [])
    .map((li) => ({
      description: String(li.description || '').trim(),
      quantity: Number(li.quantity) || 1,
      unitAmount: Number(li.unitAmount),
    }))
    .filter((li) => li.description && Number.isFinite(li.unitAmount) && li.unitAmount >= 0);

  const payload = {
    invoiceKind: draft.invoiceKind,
    counterpartyName: String(draft.counterpartyName).trim(),
    issueDate: draft.issueDate,
    currency: String(draft.currency).trim().toUpperCase(),
    lineItems,
    notes:
      documentRole === 'quotation'
        ? markQuotationNotes(draft.notes)
        : draft.notes || '',
  };
  if (draft.invoiceNumber) payload.invoiceNumber = String(draft.invoiceNumber).trim();
  if (draft.dueDate) payload.dueDate = draft.dueDate;
  const tax = Number(draft.taxAmount);
  if (Number.isFinite(tax) && tax > 0) payload.taxAmount = tax;
  return payload;
}

function statusPillHtml(label, variant) {
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

function renderEditorModal(ui, draft) {
  const preview = previewClientInvoiceTotals(draft.lineItems, draft.taxAmount, draft.currency);
  const cur = preview.currency;
  const errors = ui.editorErrors?.length
    ? `<ul class="fin-form-errors">${ui.editorErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';

  const rows = (draft.lineItems || [])
    .map(
      (li, idx) => `
    <tr data-fin-line-row="${idx}">
      <td><input type="text" class="fin-input" data-fin-field="description" value="${escapeHtml(String(li.description || ''))}" placeholder="Description" /></td>
      <td><input type="number" min="0.001" step="any" class="fin-input fin-input-qty" data-fin-field="quantity" value="${escapeHtml(String(li.quantity ?? 1))}" /></td>
      <td><input type="number" min="0" step="0.01" class="fin-input fin-input-amt" data-fin-field="unitAmount" value="${escapeHtml(li.unitAmount === '' ? '' : String(li.unitAmount))}" placeholder="0.00" /></td>
      <td><button type="button" class="btn btn-ghost btn-sm fin-line-remove" data-fin-line-remove="${idx}" aria-label="Remove line"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`
    )
    .join('');

  return `
  <div class="fin-overlay" data-fin-overlay="editor">
    <div class="fin-modal" role="dialog" aria-labelledby="fin-editor-title" aria-modal="true">
      <header class="fin-modal-head">
        <h2 id="fin-editor-title">${ui.documentRole === 'quotation' ? (ui.editorMode === 'edit' ? 'Edit quotation' : 'New quotation') : ui.editorMode === 'edit' ? 'Edit invoice draft' : 'New invoice'}</h2>
        <button type="button" class="fin-modal-close" data-fin-close-editor aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="fin-modal-body">
        ${errors}
        <div class="fin-form-grid">
          <label class="fin-field"><span>Kind</span>
            <select class="fin-select" data-fin-draft="invoiceKind">
              <option value="receivable" ${draft.invoiceKind === 'receivable' ? 'selected' : ''}>Receivable</option>
              <option value="payable" ${draft.invoiceKind === 'payable' ? 'selected' : ''}>Payable</option>
            </select>
          </label>
          <label class="fin-field"><span>Currency</span>
            <input class="fin-input" data-fin-draft="currency" value="${escapeHtml(draft.currency)}" maxlength="3" />
          </label>
          <label class="fin-field fin-field-wide"><span>Counterparty</span>
            <input class="fin-input" data-fin-draft="counterpartyName" value="${escapeHtml(draft.counterpartyName)}" />
          </label>
          <label class="fin-field"><span>Invoice #</span>
            <input class="fin-input" data-fin-draft="invoiceNumber" value="${escapeHtml(draft.invoiceNumber)}" placeholder="Optional" />
          </label>
          <label class="fin-field"><span>Issue date</span>
            <input type="date" class="fin-input" data-fin-draft="issueDate" value="${escapeHtml(draft.issueDate)}" />
          </label>
          <label class="fin-field"><span>Due date</span>
            <input type="date" class="fin-input" data-fin-draft="dueDate" value="${escapeHtml(draft.dueDate)}" />
          </label>
          <label class="fin-field"><span>Tax (${escapeHtml(cur)})</span>
            <input type="number" min="0" step="0.01" class="fin-input" data-fin-draft="taxAmount" value="${escapeHtml(String(draft.taxAmount ?? ''))}" placeholder="0" />
          </label>
        </div>
        <h3 class="fin-subhead">Line items</h3>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-fin-add-line><i class="fa-solid fa-plus"></i> Add line</button>
        <div class="fin-totals-preview">
          <p><span>Subtotal (preview)</span><strong>${formatMoneyMinor(preview.subtotalMinor, cur)}</strong></p>
          <p><span>Tax (preview)</span><strong>${formatMoneyMinor(preview.taxMinor, cur)}</strong></p>
          <p class="fin-totals-total"><span>Total (preview)</span><strong>${formatMoneyMinor(preview.totalMinor, cur)}</strong></p>
          <p class="fin-totals-note"><i class="fa-solid fa-server"></i> Final totals are calculated by the server when you save.</p>
        </div>
        <label class="fin-field fin-field-wide"><span>Notes</span>
          <textarea class="fin-input fin-textarea" data-fin-draft="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea>
        </label>
      </div>
      <footer class="fin-modal-foot">
        <button type="button" class="btn btn-secondary" data-fin-close-editor>Cancel</button>
        <button type="button" class="btn btn-primary" data-fin-save-invoice ${ui.saving ? 'disabled' : ''}>
          ${ui.saving ? 'Saving…' : ui.editorMode === 'edit' ? 'Save changes' : 'Create draft'}
        </button>
      </footer>
    </div>
  </div>`;
}

function renderStatusTimeline(invoice, linkedTxs) {
  const events = [];
  events.push({ at: invoice.createdAt, label: 'Created', detail: 'Draft invoice' });
  const st = String(invoice.status || 'draft');
  if (['sent', 'partial', 'paid'].includes(st)) {
    events.push({ at: invoice.updatedAt, label: 'Sent', detail: 'Available for payment recording' });
  }
  for (const tx of linkedTxs.filter((t) => t.status === 'posted')) {
    events.push({
      at: tx.occurredAt || tx.createdAt,
      label: 'Payment posted',
      detail: formatMoneyMinor(tx.amountMinor, tx.currency || invoice.currency),
    });
  }
  if (st === 'void') {
    events.push({
      at: invoice.voidedAt,
      label: 'Voided',
      detail: invoice.voidReason || '',
    });
  }
  return `<ol class="fin-timeline">
    ${events
      .map(
        (e) =>
          `<li><span class="fin-timeline-label">${escapeHtml(e.label)}</span>
          <span class="fin-timeline-meta">${escapeHtml(formatTs(e.at))}${e.detail ? ` · ${escapeHtml(e.detail)}` : ''}</span></li>`
      )
      .join('')}
  </ol>`;
}

function formatTs(val) {
  if (!val) return '—';
  const t = Date.parse(String(val));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : String(val);
}

function renderDetailDrawer(ui, invoice, linkedTxs, opts) {
  const { canUpdate, canCreate, canVoid, paymentsDisabled } = opts;
  const showRecordPayment =
    !paymentsDisabled && canCreate && invoiceAcceptsPortalPayment(invoice);
  const cur = invoice.currency || 'ZAR';
  const st = String(invoice.status || 'draft');
  const lines = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  const lineRows = lines
    .map((li) => {
      const lineTotal = li.lineTotalMinor != null ? formatMoneyMinor(li.lineTotalMinor, cur) : '—';
      const unit =
        li.unitAmountMinor != null ? formatMoneyMinor(li.unitAmountMinor, cur) : li.unitAmount ?? '—';
      return `<tr>
        <td>${escapeHtml(li.description || '')}</td>
        <td>${escapeHtml(String(li.quantity ?? 1))}</td>
        <td>${escapeHtml(String(unit))}</td>
        <td class="fin-num">${escapeHtml(lineTotal)}</td>
      </tr>`;
    })
    .join('');

  const payRows = linkedTxs.length
    ? linkedTxs
        .map((tx) => {
          const voided = tx.status === 'void';
          return `<tr class="${voided ? 'is-void' : ''}">
            <td>${formatTs(tx.occurredAt)}</td>
            <td>${escapeHtml(tx.status)}</td>
            <td class="fin-num">${escapeHtml(formatMoneyMinor(tx.amountMinor, tx.currency || cur))}</td>
            <td>${voided ? escapeHtml(tx.voidReason || '') : '—'}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="4" class="muted">No linked ledger entries yet.</td></tr>`;

  return `
  <div class="fin-overlay fin-overlay--drawer" data-fin-overlay="detail">
    <div class="fin-drawer" role="dialog" aria-labelledby="fin-detail-title">
      <header class="fin-drawer-head">
        <div>
          <h2 id="fin-detail-title">${escapeHtml(invoice.counterpartyName || 'Invoice')}</h2>
          <p class="fin-drawer-sub">${escapeHtml(invoice.invoiceKind || '')} · ${escapeHtml(cur)} ${invoice.invoiceNumber ? `#${escapeHtml(invoice.invoiceNumber)}` : ''}</p>
        </div>
        <button type="button" class="fin-modal-close" data-fin-close-detail aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="fin-drawer-body">
        <div class="fin-detail-badges">
          ${isFinanceQuotation(invoice) ? statusPillHtml('Quotation', 'info') : ''}
          ${statusPillHtml(st, invoiceStatusVariant(st))}
          ${paymentsDisabled ? '<span class="fin-pay-disabled"><i class="fa-solid fa-lock"></i> Record payment disabled</span>' : ''}
        </div>
        <div class="fin-detail-totals">
          <div><span>Total</span><strong>${formatMoneyMinor(invoice.totalMinor, cur)}</strong></div>
          <div><span>Paid</span><strong>${formatMoneyMinor(invoice.amountPaidMinor, cur)}</strong></div>
          <div><span>Balance</span><strong>${formatMoneyMinor(invoiceBalanceMinor(invoice), cur)}</strong></div>
        </div>
        <h3 class="fin-subhead">Line items</h3>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Line total</th></tr></thead>
            <tbody>${lineRows}</tbody>
          </table>
        </div>
        <p class="fin-totals-note">Tax: ${formatMoneyMinor(invoice.taxAmountMinor, cur)} · Subtotal: ${formatMoneyMinor(invoice.subtotalMinor, cur)}</p>
        <h3 class="fin-subhead">Payment history (ledger)</h3>
        <div class="fin-table-wrap">
          <table class="fin-table fin-table-compact">
            <thead><tr><th>Date</th><th>Status</th><th>Amount</th><th>Void reason</th></tr></thead>
            <tbody>${payRows}</tbody>
          </table>
        </div>
        <h3 class="fin-subhead">Status history</h3>
        ${renderStatusTimeline(invoice, linkedTxs)}
        ${invoice.notes ? `<h3 class="fin-subhead">Notes</h3><p class="fin-notes">${escapeHtml(invoice.notes)}</p>` : ''}
      </div>
      <footer class="fin-drawer-foot">
        ${canUpdate && st === 'draft' ? `<button type="button" class="btn btn-secondary btn-sm" data-fin-detail-edit>Edit draft</button>` : ''}
        ${canUpdate && st === 'draft' ? `<button type="button" class="btn btn-primary btn-sm" data-fin-detail-send>Mark sent</button>` : ''}
        ${showRecordPayment ? `<button type="button" class="btn btn-primary btn-sm" data-fin-detail-pay>Record payment</button>` : ''}
        ${canVoid && st !== 'void' && (Number(invoice.amountPaidMinor) || 0) === 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-fin-detail-void>Void invoice</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-fin-close-detail>Close</button>
      </footer>
    </div>
  </div>`;
}

export function renderInvoiceUiOverlays(fin, opts) {
  let html = '';
  const ui = fin.invoiceUi;
  if (ui?.editorOpen && ui.draft) {
    html += renderEditorModal(ui, ui.draft);
  }
  if (ui?.detailId) {
    const invoice = fin.invoices.find((i) => i.id === ui.detailId);
    if (invoice) {
      const linked = (fin.txs || []).filter((t) => t.invoiceId === invoice.id);
      html += renderDetailDrawer(ui, invoice, linked, opts);
    }
  }
  return html;
}

function readDraftFromDom(modal, draft) {
  const next = { ...draft, lineItems: [...(draft.lineItems || [])] };
  modal.querySelectorAll('[data-fin-draft]').forEach((el) => {
    const key = el.getAttribute('data-fin-draft');
    next[key] = el.value;
  });
  modal.querySelectorAll('[data-fin-line-row]').forEach((row) => {
    const idx = Number(row.getAttribute('data-fin-line-row'));
    if (!next.lineItems[idx]) next.lineItems[idx] = { description: '', quantity: 1, unitAmount: '' };
    row.querySelectorAll('[data-fin-field]').forEach((input) => {
      const field = input.getAttribute('data-fin-field');
      if (field === 'quantity' || field === 'unitAmount') {
        next.lineItems[idx][field] = input.value === '' ? '' : Number(input.value);
      } else {
        next.lineItems[idx][field] = input.value;
      }
    });
  });
  return next;
}

export function bindInvoiceUi(container, fin, ctx) {
  const { companyId, canUpdate, canCreate, canVoid, paymentsDisabled, onRefresh, onRepaint } = ctx;

  container.querySelectorAll('[data-fin-inv-open]').forEach((el) => {
    const open = () => {
      fin.invoiceUi.detailId = el.getAttribute('data-fin-inv-open');
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

  container.querySelector('[data-fin-close-detail]')?.addEventListener('click', () => {
    fin.invoiceUi.detailId = null;
    onRepaint();
  });
  container.querySelectorAll('[data-fin-close-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fin.invoiceUi.detailId = null;
      onRepaint();
    });
  });

  container.querySelector('[data-fin-detail-edit]')?.addEventListener('click', () => {
    const inv = fin.invoices.find((i) => i.id === fin.invoiceUi.detailId);
    if (!inv) return;
    fin.invoiceUi.detailId = null;
    if (isFinanceQuotation(inv)) {
      openQuotationEditor(fin, 'edit', inv);
    } else {
      openInvoiceEditor(fin, 'edit', inv);
    }
    onRepaint();
  });

  container.querySelector('[data-fin-detail-send]')?.addEventListener('click', async () => {
    const id = fin.invoiceUi.detailId;
    try {
      await patchFinanceInvoice(companyId(), id, { status: 'sent' });
      showToast('Invoice marked sent', 'success');
      await onRefresh();
      onRepaint();
    } catch (e) {
      showToast(e?.message || 'Update failed', 'error');
    }
  });

  container.querySelector('[data-fin-detail-void]')?.addEventListener('click', async () => {
    const reason = window.prompt('Reason for voiding this invoice (required):');
    if (!reason?.trim()) return;
    try {
      await voidFinanceInvoice(companyId(), fin.invoiceUi.detailId, reason.trim());
      showToast('Invoice voided', 'success');
      fin.invoiceUi.detailId = null;
      await onRefresh();
      onRepaint();
    } catch (e) {
      showToast(e?.message || 'Void failed', 'error');
    }
  });

  container.querySelector('[data-fin-detail-pay]')?.addEventListener('click', async () => {
    const inv = fin.invoices.find((i) => i.id === fin.invoiceUi.detailId);
    if (!inv) return;
    const ok = await promptAndRecordInvoicePayment(companyId(), inv);
    if (ok) {
      await onRefresh();
      onRepaint();
    }
  });

  const editorOverlay = container.querySelector('[data-fin-overlay="editor"]');
  if (!editorOverlay) return;

  const closeEditor = () => {
    fin.invoiceUi.editorOpen = false;
    fin.invoiceUi.draft = null;
    fin.invoiceUi.editorErrors = [];
    onRepaint();
  };

  editorOverlay.querySelectorAll('[data-fin-close-editor]').forEach((b) => b.addEventListener('click', closeEditor));
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) closeEditor();
  });

  editorOverlay.querySelector('[data-fin-add-line]')?.addEventListener('click', () => {
    fin.invoiceUi.draft = readDraftFromDom(editorOverlay, fin.invoiceUi.draft);
    fin.invoiceUi.draft.lineItems.push({ description: '', quantity: 1, unitAmount: '' });
    onRepaint();
  });

  editorOverlay.querySelectorAll('[data-fin-line-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      fin.invoiceUi.draft = readDraftFromDom(editorOverlay, fin.invoiceUi.draft);
      const idx = Number(btn.getAttribute('data-fin-line-remove'));
      fin.invoiceUi.draft.lineItems.splice(idx, 1);
      if (!fin.invoiceUi.draft.lineItems.length) {
        fin.invoiceUi.draft.lineItems.push({ description: '', quantity: 1, unitAmount: '' });
      }
      onRepaint();
    });
  });

  editorOverlay.querySelector('[data-fin-save-invoice]')?.addEventListener('click', async () => {
    fin.invoiceUi.draft = readDraftFromDom(editorOverlay, fin.invoiceUi.draft);
    const errors = validateDraft(fin.invoiceUi.draft);
    if (errors.length) {
      fin.invoiceUi.editorErrors = errors;
      onRepaint();
      return;
    }
    fin.invoiceUi.saving = true;
    fin.invoiceUi.editorErrors = [];
    onRepaint();
    try {
      const docRole = fin.invoiceUi.documentRole || 'invoice';
      const payload = buildPayload(fin.invoiceUi.draft, docRole);
      if (fin.invoiceUi.editorMode === 'edit' && fin.invoiceUi.draft.id) {
        await patchFinanceInvoice(companyId(), fin.invoiceUi.draft.id, payload);
        showToast(docRole === 'quotation' ? 'Quotation updated' : 'Invoice updated', 'success');
      } else {
        await createFinanceInvoice(companyId(), payload);
        showToast(docRole === 'quotation' ? 'Quotation created' : 'Invoice draft created', 'success');
      }
      fin.invoiceUi.editorOpen = false;
      fin.invoiceUi.draft = null;
      fin.invoiceUi.saving = false;
      fin.tab = 'invoices';
      await onRefresh();
      onRepaint();
    } catch (e) {
      fin.invoiceUi.saving = false;
      fin.invoiceUi.editorErrors = [e?.message || 'Save failed'];
      onRepaint();
    }
  });
}

export function openInvoiceEditor(fin, mode = 'create', invoice = null) {
  fin.invoiceUi.editorOpen = true;
  fin.invoiceUi.editorMode = mode;
  fin.invoiceUi.documentRole = 'invoice';
  fin.invoiceUi.draft = mode === 'edit' ? draftFromInvoice(invoice) : createEmptyInvoiceDraft();
  fin.invoiceUi.editorErrors = [];
  fin.invoiceUi.saving = false;
}

export function openQuotationEditor(fin, mode = 'create', invoice = null) {
  fin.invoiceUi.editorOpen = true;
  fin.invoiceUi.editorMode = mode;
  fin.invoiceUi.documentRole = 'quotation';
  const draft = mode === 'edit' ? draftFromInvoice(invoice) : createEmptyInvoiceDraft();
  draft.invoiceKind = 'receivable';
  fin.invoiceUi.draft = draft;
  fin.invoiceUi.editorErrors = [];
  fin.invoiceUi.saving = false;
}
