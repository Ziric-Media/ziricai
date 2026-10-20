/**
 * Sarah BOS — commercial cycle panel (quote → verified pay → mobilise).
 */
import { escapeHtml } from '../admin/ui.js';
import { state } from './core/dataStore.js';
import { fetchBosCommercialCycles, postBosCommercialCycleAction } from './api.js';
import { showToast } from '../admin/ui.js';

const STAGE_ACTIONS = {
  quotation_sent: [{ action: 'accept-quotation', label: 'Accept quotation (Sales)', tone: 'sales' }],
  quotation_accepted: [
    { action: 'submit-payment-proof', label: 'Submit payment proof', tone: 'sales' },
  ],
  payment_proof_submitted: [
    { action: 'verify-payment', label: 'Verify payment (Finance)', tone: 'finance' },
  ],
  payment_verified: [
    { action: 'authorise-work', label: 'Authorise work (Admin)', tone: 'admin' },
  ],
  work_authorised: [{ action: 'mobilise', label: 'Mobilise (Operations)', tone: 'ops' }],
  quotation_pending: [
    { action: 'prepare-quotation', label: 'Prepare quotation (Finance)', tone: 'finance' },
  ],
  quotation_ready: [{ action: 'send-quotation', label: 'Send quotation', tone: 'finance' }],
};

function actionsForStage(stage) {
  return STAGE_ACTIONS[stage] || [];
}

function renderCycleCard(cycle) {
  const actions = actionsForStage(cycle.stage);
  const delegations = (cycle.delegations || [])
    .slice(-3)
    .map(
      (d) =>
        `<li><span class="bos-del-from">${escapeHtml(d.fromRole)}</span> → <span class="bos-del-to">${escapeHtml(d.toRole)}</span> · ${escapeHtml(d.status)} ${d.resultSummary ? `— ${escapeHtml(d.resultSummary)}` : ''}</li>`
    )
    .join('');

  return `<article class="bos-cycle-card" data-cycle-id="${escapeHtml(cycle.id)}">
    <header class="bos-cycle-card-head">
      <div>
        <h4 class="bos-cycle-title">${escapeHtml(cycle.title || 'Commercial cycle')}</h4>
        <p class="bos-cycle-customer">${escapeHtml(cycle.customerName || '')}</p>
      </div>
      <span class="bos-cycle-stage">${escapeHtml(cycle.stageLabel || cycle.stage || '')}</span>
    </header>
    ${delegations ? `<ul class="bos-cycle-delegations">${delegations}</ul>` : ''}
    <div class="bos-cycle-actions">
      ${actions
        .map(
          (a) =>
            `<button type="button" class="btn btn-secondary btn-sm bos-cycle-action" data-bos-action="${escapeHtml(a.action)}" data-cycle-id="${escapeHtml(cycle.id)}">${escapeHtml(a.label)}</button>`
        )
        .join('')}
    </div>
  </article>`;
}

export async function mountBosCommercialCyclePanel(container) {
  if (!container) return;
  const companyId = state.companyId;
  container.innerHTML = `<div class="bos-cycle-panel loading"><p class="muted">Loading commercial cycles…</p></div>`;

  const res = await fetchBosCommercialCycles(companyId);
  if (res.error) {
    container.innerHTML = `<div class="bos-cycle-panel bos-cycle-panel--error"><p>${escapeHtml(res.error)}</p></div>`;
    return;
  }
  if (!res.data?.pilot) {
    container.innerHTML = '';
    return;
  }

  const items = res.data?.items || [];
  container.innerHTML = `
    <section class="bos-cycle-panel" aria-labelledby="bos-cycle-heading">
      <header class="bos-cycle-panel-head">
        <h3 id="bos-cycle-heading"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Commercial cycle</h3>
        <p class="muted">Quote → verified payment → mobilisation · shared business record (Central Motors pilot)</p>
      </header>
      <div class="bos-cycle-list">${items.length ? items.map(renderCycleCard).join('') : '<p class="muted">No cycles yet.</p>'}</div>
    </section>`;

  container.querySelectorAll('.bos-cycle-action').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-bos-action');
      const cycleId = btn.getAttribute('data-cycle-id');
      btn.disabled = true;
      const body =
        action === 'submit-payment-proof'
          ? { reference: `POP-${Date.now().toString(36).slice(2, 8)}`, note: 'Customer WhatsApp proof (demo)' }
          : action === 'prepare-quotation'
            ? {
                lineItems: [{ description: 'Vehicle deposit & delivery preparation', quantity: 1, unitPrice: 15000 }],
                currency: 'ZAR',
              }
            : {};
      const out = await postBosCommercialCycleAction(companyId, cycleId, action, body);
      btn.disabled = false;
      if (out.error) {
        showToast(out.error, 'error');
        return;
      }
      showToast('Cycle updated', 'success');
      await mountBosCommercialCyclePanel(container);
    });
  });
}
