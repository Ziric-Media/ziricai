/**
 * Finance — create transaction / category modals (U8; create flows only).
 */
import { escapeHtml, showToast } from '../admin/ui.js';
import { createFinanceTransaction, createFinanceCategory } from './api.js';

const TX_TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const CAT_KINDS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'both', label: 'Both' },
];

export function createDefaultCreateUiState() {
  return {
    txModal: defaultTxDraftState(false),
    catModal: defaultCatDraftState(false),
  };
}

function defaultTxDraftState(open = false) {
  return {
    open,
    draft: {
      recordType: 'expense',
      amount: '',
      currency: 'ZAR',
      category: 'general',
      description: '',
    },
    errors: [],
    submitting: false,
  };
}

function defaultCatDraftState(open = false) {
  return {
    open,
    draft: { name: '', kind: 'both' },
    errors: [],
    submitting: false,
  };
}

function defaultRecordTypeForWorkspace(workspaceId) {
  if (workspaceId === 'income') return 'income';
  if (workspaceId === 'expenses') return 'expense';
  return 'expense';
}

export function openCreateTxModal(fin, workspaceId) {
  fin.createUi.txModal = {
    ...defaultTxDraftState(true),
    draft: {
      recordType: defaultRecordTypeForWorkspace(workspaceId),
      amount: '',
      currency: 'ZAR',
      category: 'general',
      description: '',
    },
  };
}

export function closeCreateTxModal(fin) {
  if (fin.createUi.txModal.submitting) return;
  fin.createUi.txModal = defaultTxDraftState(false);
}

export function openCreateCatModal(fin) {
  fin.createUi.catModal = defaultCatDraftState(true);
}

export function closeCreateCatModal(fin) {
  if (fin.createUi.catModal.submitting) return;
  fin.createUi.catModal = defaultCatDraftState(false);
}

function validateTxDraft(draft) {
  const errors = [];
  const rt = String(draft.recordType || '').trim().toLowerCase();
  if (!['expense', 'income', 'transfer'].includes(rt)) {
    errors.push('Choose expense, income, or transfer.');
  }
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Enter a valid amount greater than zero (major units, e.g. 150.00).');
  }
  const currency = String(draft.currency || '').trim();
  if (!currency) errors.push('Currency is required.');
  const category = String(draft.category || '').trim();
  if (!category) errors.push('Category is required.');
  return errors;
}

function validateCatDraft(draft) {
  const errors = [];
  if (!String(draft.name || '').trim()) errors.push('Category name is required.');
  const kind = String(draft.kind || '').trim().toLowerCase();
  if (!['expense', 'income', 'both'].includes(kind)) {
    errors.push('Kind must be expense, income, or both.');
  }
  return errors;
}

function readTxDraftFromDom(overlay) {
  return {
    recordType: overlay.querySelector('[data-fin-create-tx-type]')?.value ?? 'expense',
    amount: overlay.querySelector('[data-fin-create-tx-amount]')?.value ?? '',
    currency: overlay.querySelector('[data-fin-create-tx-currency]')?.value ?? 'ZAR',
    category: overlay.querySelector('[data-fin-create-tx-category]')?.value ?? '',
    description: overlay.querySelector('[data-fin-create-tx-description]')?.value ?? '',
  };
}

function readCatDraftFromDom(overlay) {
  return {
    name: overlay.querySelector('[data-fin-create-cat-name]')?.value ?? '',
    kind: overlay.querySelector('[data-fin-create-cat-kind]')?.value ?? 'both',
  };
}

function renderErrors(errors) {
  if (!errors?.length) return '';
  return `<ul class="fin-form-errors" role="alert">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
}

function categoryOptions(fin) {
  const names = (fin.categories || []).map((c) => c.name).filter(Boolean);
  if (!names.length) return '';
  const opts = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
  return `<datalist id="fin-create-tx-cat-list">${opts}</datalist>`;
}

function renderCreateTxModal(fin) {
  const m = fin.createUi?.txModal;
  if (!m?.open) return '';
  const d = m.draft;
  const dis = m.submitting ? 'disabled' : '';
  const typeOpts = TX_TYPES.map(
    (t) => `<option value="${t.value}" ${d.recordType === t.value ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');
  return `
  <div class="fin-overlay fin-overlay--modal" data-fin-overlay="create-tx">
    <div class="fin-modal fin-modal--compact fin-modal--create" role="dialog" aria-labelledby="fin-create-tx-title" aria-modal="true">
      <header class="fin-modal-head">
        <h2 id="fin-create-tx-title">New transaction</h2>
        <button type="button" class="fin-modal-close" data-fin-close-create-tx aria-label="Close" ${dis}><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="fin-modal-body">
        ${renderErrors(m.errors)}
        <div class="fin-form-grid fin-form-grid--create">
          <label class="fin-field"><span>Type</span>
            <select class="fin-select fin-input" data-fin-create-tx-type ${dis} aria-required="true">${typeOpts}</select>
          </label>
          <label class="fin-field"><span>Amount</span>
            <input class="fin-input" type="number" inputmode="decimal" step="0.01" min="0" data-fin-create-tx-amount
              value="${escapeHtml(d.amount)}" placeholder="150.00" ${dis} aria-required="true" />
            <span class="fin-field-hint">Major units (e.g. 150.00)</span>
          </label>
          <label class="fin-field"><span>Currency</span>
            <input class="fin-input" type="text" maxlength="3" data-fin-create-tx-currency
              value="${escapeHtml(d.currency)}" ${dis} aria-required="true" autocomplete="off" />
          </label>
          <label class="fin-field fin-field-wide"><span>Category</span>
            <input class="fin-input" type="text" list="fin-create-tx-cat-list" data-fin-create-tx-category
              value="${escapeHtml(d.category)}" ${dis} aria-required="true" />
            ${categoryOptions(fin)}
          </label>
          <label class="fin-field fin-field-wide"><span>Description</span>
            <input class="fin-input" type="text" data-fin-create-tx-description
              value="${escapeHtml(d.description)}" ${dis} />
          </label>
        </div>
      </div>
      <footer class="fin-modal-foot">
        <button type="button" class="btn btn-secondary" data-fin-close-create-tx ${dis}>Cancel</button>
        <button type="button" class="btn btn-primary" data-fin-confirm-create-tx ${dis}>
          ${m.submitting ? 'Saving…' : 'Save transaction'}
        </button>
      </footer>
    </div>
  </div>`;
}

function renderCreateCatModal(fin) {
  const m = fin.createUi?.catModal;
  if (!m?.open) return '';
  const d = m.draft;
  const dis = m.submitting ? 'disabled' : '';
  const kindOpts = CAT_KINDS.map(
    (k) => `<option value="${k.value}" ${d.kind === k.value ? 'selected' : ''}>${escapeHtml(k.label)}</option>`
  ).join('');
  return `
  <div class="fin-overlay fin-overlay--modal" data-fin-overlay="create-cat">
    <div class="fin-modal fin-modal--compact fin-modal--create" role="dialog" aria-labelledby="fin-create-cat-title" aria-modal="true">
      <header class="fin-modal-head">
        <h2 id="fin-create-cat-title">Add category</h2>
        <button type="button" class="fin-modal-close" data-fin-close-create-cat aria-label="Close" ${dis}><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="fin-modal-body">
        ${renderErrors(m.errors)}
        <div class="fin-form-grid fin-form-grid--create">
          <label class="fin-field fin-field-wide"><span>Name</span>
            <input class="fin-input" type="text" data-fin-create-cat-name
              value="${escapeHtml(d.name)}" ${dis} aria-required="true" autofocus />
          </label>
          <label class="fin-field"><span>Kind</span>
            <select class="fin-select fin-input" data-fin-create-cat-kind ${dis} aria-required="true">${kindOpts}</select>
          </label>
        </div>
      </div>
      <footer class="fin-modal-foot">
        <button type="button" class="btn btn-secondary" data-fin-close-create-cat ${dis}>Cancel</button>
        <button type="button" class="btn btn-primary" data-fin-confirm-create-cat ${dis}>
          ${m.submitting ? 'Saving…' : 'Save category'}
        </button>
      </footer>
    </div>
  </div>`;
}

export function renderCreateUiOverlays(fin) {
  let html = '';
  if (fin.createUi?.txModal?.open) html += renderCreateTxModal(fin);
  if (fin.createUi?.catModal?.open) html += renderCreateCatModal(fin);
  return html;
}

function focusFirstField(overlay, selector) {
  requestAnimationFrame(() => {
    const el = overlay?.querySelector(selector);
    el?.focus();
  });
}

export function bindCreateUi(container, fin, ctx) {
  const { companyId, canCreate, onRefresh, onRepaint } = ctx;
  if (!canCreate) return;

  const txOverlay = container.querySelector('[data-fin-overlay="create-tx"]');
  if (txOverlay) {
    focusFirstField(txOverlay, '[data-fin-create-tx-amount]');
    const syncDraft = () => {
      fin.createUi.txModal.draft = readTxDraftFromDom(txOverlay);
    };
    txOverlay.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', syncDraft);
      el.addEventListener('change', syncDraft);
    });

    const closeTx = () => {
      closeCreateTxModal(fin);
      onRepaint();
    };
    txOverlay.querySelectorAll('[data-fin-close-create-tx]').forEach((b) => b.addEventListener('click', closeTx));
    txOverlay.addEventListener('click', (e) => {
      if (e.target === txOverlay && !fin.createUi.txModal.submitting) closeTx();
    });

    txOverlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !fin.createUi.txModal.submitting) {
        e.preventDefault();
        closeTx();
      }
    });

    txOverlay.querySelector('[data-fin-confirm-create-tx]')?.addEventListener('click', async () => {
      if (fin.createUi.txModal.submitting) return;
      fin.createUi.txModal.draft = readTxDraftFromDom(txOverlay);
      const draft = fin.createUi.txModal.draft;
      const errors = validateTxDraft(draft);
      if (errors.length) {
        fin.createUi.txModal.errors = errors;
        onRepaint();
        return;
      }
      fin.createUi.txModal.errors = [];
      fin.createUi.txModal.submitting = true;
      onRepaint();
      try {
        await createFinanceTransaction(companyId(), {
          recordType: String(draft.recordType).trim().toLowerCase(),
          amount: Number(draft.amount),
          currency: String(draft.currency).trim().toUpperCase(),
          occurredAt: new Date().toISOString(),
          category: String(draft.category).trim(),
          description: String(draft.description || '').trim(),
        });
        showToast('Transaction created', 'success');
        fin.createUi.txModal = defaultTxDraftState(false);
        await onRefresh();
        onRepaint();
      } catch (e) {
        fin.createUi.txModal.submitting = false;
        fin.createUi.txModal.errors = [e?.message || 'Create failed'];
        onRepaint();
      }
    });
  }

  const catOverlay = container.querySelector('[data-fin-overlay="create-cat"]');
  if (catOverlay) {
    focusFirstField(catOverlay, '[data-fin-create-cat-name]');
    const syncCat = () => {
      fin.createUi.catModal.draft = readCatDraftFromDom(catOverlay);
    };
    catOverlay.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', syncCat);
      el.addEventListener('change', syncCat);
    });

    const closeCat = () => {
      closeCreateCatModal(fin);
      onRepaint();
    };
    catOverlay.querySelectorAll('[data-fin-close-create-cat]').forEach((b) => b.addEventListener('click', closeCat));
    catOverlay.addEventListener('click', (e) => {
      if (e.target === catOverlay && !fin.createUi.catModal.submitting) closeCat();
    });
    catOverlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !fin.createUi.catModal.submitting) {
        e.preventDefault();
        closeCat();
      }
    });

    catOverlay.querySelector('[data-fin-confirm-create-cat]')?.addEventListener('click', async () => {
      if (fin.createUi.catModal.submitting) return;
      fin.createUi.catModal.draft = readCatDraftFromDom(catOverlay);
      const draft = fin.createUi.catModal.draft;
      const errors = validateCatDraft(draft);
      if (errors.length) {
        fin.createUi.catModal.errors = errors;
        onRepaint();
        return;
      }
      fin.createUi.catModal.errors = [];
      fin.createUi.catModal.submitting = true;
      onRepaint();
      try {
        await createFinanceCategory(companyId(), {
          name: String(draft.name).trim(),
          kind: String(draft.kind).trim().toLowerCase(),
        });
        showToast('Category created', 'success');
        fin.createUi.catModal = defaultCatDraftState(false);
        await onRefresh();
        onRepaint();
      } catch (e) {
        fin.createUi.catModal.submitting = false;
        fin.createUi.catModal.errors = [e?.message || 'Create failed'];
        onRepaint();
      }
    });
  }
}
