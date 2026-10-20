/**
 * Sarah BOS — workforce instructions panel (Admin outbound + module inbound).
 */
import { escapeHtml } from '../admin/ui.js';
import { state } from './core/dataStore.js';
import {
  fetchWorkforceInstructions,
  createWorkforceInstruction,
  completeWorkforceInstructionApi,
} from './api.js';
import { showToast } from '../admin/ui.js';
import { persistenceScopeToSurface, surfaceToModuleKey } from './sarah/sarahModuleSurfaces.js';

function statusLabel(s) {
  const map = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return map[s] || s;
}

function renderInstructionCard(item, { moduleView = false } = {}) {
  const canComplete =
    moduleView && (item.status === 'pending' || item.status === 'in_progress');
  return `<article class="bos-instruction-card" data-instruction-id="${escapeHtml(item.id)}">
    <header class="bos-instruction-head">
      <span class="bos-instruction-target">${escapeHtml(item.targetModuleLabel || item.targetModule || '')}</span>
      <span class="bos-instruction-status">${escapeHtml(statusLabel(item.status))}</span>
    </header>
    <p class="bos-instruction-text">${escapeHtml(item.instruction || '')}</p>
    ${item.resultSummary ? `<p class="bos-instruction-result muted">${escapeHtml(item.resultSummary)}</p>` : ''}
    ${
      canComplete
        ? `<div class="bos-instruction-actions">
      <button type="button" class="btn btn-secondary btn-sm bos-instruction-complete" data-instruction-id="${escapeHtml(item.id)}">Mark completed (human)</button>
    </div>`
        : ''
    }
  </article>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ persistenceScope?: string, adminView?: boolean }} options
 */
export async function mountWorkforceInstructionsPanel(container, options = {}) {
  if (!container) return;
  const companyId = state.companyId;
  const scope = options.persistenceScope || 'admin';
  const adminView = options.adminView ?? scope === 'admin';
  const moduleKey = adminView ? null : surfaceToModuleKey(persistenceScopeToSurface(scope));

  container.innerHTML = `<div class="bos-instruction-panel loading"><p class="muted">Loading workforce instructions…</p></div>`;

  const res = await fetchWorkforceInstructions(companyId, {
    module: moduleKey || undefined,
    limit: 20,
  });
  if (res.error) {
    container.innerHTML = `<div class="bos-instruction-panel bos-instruction-panel--error"><p>${escapeHtml(res.error)}</p></div>`;
    return;
  }

  let items = res.data?.items || [];
  if (!adminView) {
    items = items.filter((i) => i.status === 'pending' || i.status === 'in_progress');
  } else {
    items = items.filter((i) => ['pending', 'in_progress'].includes(i.status)).slice(0, 8);
  }

  const title = adminView
    ? 'Workforce delegations'
    : 'Instructions from Sarah Admin';
  const subtitle = adminView
    ? 'Open instructions issued to Sales, Finance, Operations, and HR Sarah'
    : 'Execute these in chat (Sarah will use module tools), or mark done as a human';

  container.innerHTML = `
    <section class="bos-instruction-panel" aria-labelledby="bos-instruction-heading">
      <header class="bos-instruction-panel-head">
        <h3 id="bos-instruction-heading"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> ${escapeHtml(title)}</h3>
        <p class="muted">${escapeHtml(subtitle)}</p>
      </header>
      ${
        adminView
          ? `<form class="bos-instruction-quick-form" id="bosInstructionQuickForm">
        <label class="sr-only" for="bosInstructionTarget">Module</label>
        <select id="bosInstructionTarget" required>
          <option value="">Delegate to…</option>
          <option value="sales">Sarah Sales</option>
          <option value="finance">Sarah Finance</option>
          <option value="operations">Sarah Operations</option>
          <option value="hr">Sarah HR</option>
        </select>
        <input type="text" id="bosInstructionText" placeholder="Instruction for that Sarah module" required maxlength="500" />
        <button type="submit" class="btn btn-primary btn-sm">Issue</button>
      </form>`
          : ''
      }
      <div class="bos-instruction-list">${items.length ? items.map((i) => renderInstructionCard(i, { moduleView: !adminView })).join('') : '<p class="muted">No open instructions.</p>'}</div>
    </section>`;

  container.querySelector('#bosInstructionQuickForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetModule = container.querySelector('#bosInstructionTarget')?.value;
    const instruction = container.querySelector('#bosInstructionText')?.value?.trim();
    if (!targetModule || !instruction) return;
    const out = await createWorkforceInstruction(companyId, { targetModule, instruction, source: 'human' });
    if (out.error) {
      showToast(out.error, 'error');
      return;
    }
    showToast('Instruction sent to module Sarah.', 'success');
    await mountWorkforceInstructionsPanel(container, options);
  });

  container.querySelectorAll('.bos-instruction-complete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-instruction-id');
      const summary = window.prompt('Brief result summary (what was done):');
      if (!summary?.trim()) return;
      btn.disabled = true;
      const out = await completeWorkforceInstructionApi(companyId, id, { resultSummary: summary.trim() });
      if (out.error) showToast(out.error, 'error');
      else showToast('Instruction completed.', 'success');
      await mountWorkforceInstructionsPanel(container, options);
    });
  });
}
