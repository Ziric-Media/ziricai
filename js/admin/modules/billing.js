import { state } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  emptyState,
  loadingState,
  planBadge,
  statusBadge,
  showToast,
} from '../ui.js';
import {
  listBilling,
  createBillingRecord,
  updateBillingRecord,
} from '../services/billing.js';

export async function renderBilling(container) {
  if (!state.companies.length) {
    container.innerHTML = emptyState('Create a company to manage billing.');
    return;
  }

  container.innerHTML = loadingState('Loading billing...');
  const companyId = state.selectedCompanyId || state.companies[0]?.id;
  const result = await listBilling(companyId);
  const records = result.items || [];

  container.innerHTML = `
    ${pageHeader(
      'Billing',
      'Subscriptions, payment status, and invoices.',
      `<button class="btn btn-primary btn-sm" type="button" id="openBillingModal">+ Billing Record</button>`
    )}
    <div class="table-container">
      <table class="org-table">
        <thead>
          <tr><th>Company</th><th>Plan</th><th>Amount</th><th>Cycle</th><th>Payment</th><th>Renewal</th><th></th></tr>
        </thead>
        <tbody>
          ${records.length
            ? records.map((r) => renderBillingRow(r)).join('')
            : `<tr><td colspan="7">${emptyState('No billing records yet. Connect payment provider or add records manually.')}</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="wizard-overlay" id="billingModal">
      <div class="wizard-modal" style="max-width:560px;">
        <div class="wizard-header"><div><h2>Billing Record</h2></div><button class="btn btn-secondary btn-sm" type="button" id="closeBillingModal">✕</button></div>
        <div class="wizard-body">
          <input type="hidden" id="billingEditId" />
          <div class="form-group"><label>Company</label>
            <select id="billingCompanyId">${state.companies.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === companyId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Plan</label><select id="billingPlan"><option value="starter">Starter</option><option value="professional">Professional</option><option value="business">Business</option><option value="enterprise">Enterprise</option></select></div>
            <div class="form-group"><label>Amount</label><input type="number" id="billingAmount" value="4999" step="0.01" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Cycle</label><select id="billingCycle"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div>
            <div class="form-group"><label>Payment Status</label><select id="billingPaymentStatus"><option value="paid">Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select></div>
          </div>
          <div class="form-group"><label>Renewal Date</label><input type="date" id="billingRenewal" /></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" type="button" id="cancelBillingModal">Cancel</button>
          <button class="btn btn-primary" type="button" id="saveBillingBtn">Save</button>
        </div>
      </div>
    </div>
  `;

  bindBillingEvents(container, records);
}

function renderBillingRow(record) {
  const company = state.companies.find((c) => c.id === record.companyId);
  return `
    <tr>
      <td>${escapeHtml(company?.name || record.companyId)}</td>
      <td>${planBadge(record.plan)}</td>
      <td>${escapeHtml(record.currency || 'ZAR')} ${escapeHtml(record.amount ?? 0)}</td>
      <td>${escapeHtml(record.cycle || 'monthly')}</td>
      <td>${statusBadge(record.paymentStatus)}</td>
      <td>${escapeHtml(record.renewalDate || '—')}</td>
      <td><button class="btn btn-secondary btn-sm edit-billing" data-id="${escapeHtml(record.id)}" type="button">Edit</button></td>
    </tr>
  `;
}

function bindBillingEvents(container, records) {
  const modal = container.querySelector('#billingModal');
  const backdrop = document.getElementById('overlay');
  const open = () => { modal.classList.add('open'); backdrop?.classList.add('open'); };
  const close = () => { modal.classList.remove('open'); backdrop?.classList.remove('open'); };

  container.querySelector('#openBillingModal')?.addEventListener('click', () => {
    container.querySelector('#billingEditId').value = '';
    open();
  });
  container.querySelector('#closeBillingModal')?.addEventListener('click', close);
  container.querySelector('#cancelBillingModal')?.addEventListener('click', close);

  container.querySelector('#saveBillingBtn')?.addEventListener('click', async () => {
    const id = container.querySelector('#billingEditId').value;
    const payload = {
      companyId: container.querySelector('#billingCompanyId').value,
      plan: container.querySelector('#billingPlan').value,
      amount: Number(container.querySelector('#billingAmount').value),
      cycle: container.querySelector('#billingCycle').value,
      paymentStatus: container.querySelector('#billingPaymentStatus').value,
      renewalDate: container.querySelector('#billingRenewal').value,
      currency: 'ZAR',
      status: 'active',
    };
    const result = id ? await updateBillingRecord(id, payload) : await createBillingRecord(payload);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    showToast('Billing saved', 'success');
    close();
    renderBilling(container);
  });

  container.querySelectorAll('.edit-billing').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = records.find((r) => r.id === btn.dataset.id);
      if (!record) return;
      container.querySelector('#billingEditId').value = record.id;
      container.querySelector('#billingCompanyId').value = record.companyId;
      container.querySelector('#billingPlan').value = record.plan || 'business';
      container.querySelector('#billingAmount').value = record.amount ?? 4999;
      container.querySelector('#billingCycle').value = record.cycle || 'monthly';
      container.querySelector('#billingPaymentStatus').value = record.paymentStatus || 'pending';
      container.querySelector('#billingRenewal').value = record.renewalDate || '';
      open();
    });
  });
}
