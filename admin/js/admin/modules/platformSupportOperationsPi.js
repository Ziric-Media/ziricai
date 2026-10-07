import { escapeHtml, formatNumber } from '../ui.js';

export function renderSarahSupportActivity(ops, periodLabel) {
  if (!ops || ops.error) {
    return `<section class="pi-panel pi-support-ops"><p class="pi-panel-hint">Sarah support activity unavailable.</p></section>`;
  }
  const a = ops.activity || {};
  const rate =
    a.automatedResolutionRatePercent != null
      ? `${a.automatedResolutionRatePercent}% automated resolution`
      : '—';
  return `
    <section class="pi-panel pi-support-ops" id="piSupportOps">
      <header class="pi-panel-header">
        <h3><i class="fa-solid fa-user-nurse"></i> Sarah Support Activity — ${escapeHtml(periodLabel || 'Today')}</h3>
        <button type="button" class="btn btn-ghost btn-sm" id="openSupportOperations">Operational actions</button>
      </header>
      <div class="pi-support-ops-grid">
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.casesInvestigated ?? 0)}</span><span class="pi-stat-lbl">Investigated</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.casesResolvedBySarah ?? 0)}</span><span class="pi-stat-lbl">Resolved by Sarah</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.successfulRemediations ?? 0)}</span><span class="pi-stat-lbl">Verified remediations</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.casesEscalated ?? 0)}</span><span class="pi-stat-lbl">Escalated</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${a.remediationSuccessRatePercent != null ? `${a.remediationSuccessRatePercent}%` : '—'}</span><span class="pi-stat-lbl">Remediation success</span></div>
        <div class="pi-stat"><span class="pi-stat-val">${formatNumber(a.organisationsRequiringAttention ?? 0)}</span><span class="pi-stat-lbl">Orgs need attention</span></div>
      </div>
      <p class="pi-panel-hint">${escapeHtml(rate)} · ${formatNumber(a.remediationAttempts ?? 0)} remediation attempts · from read models (same as Sarah)</p>
    </section>`;
}

export function bindSupportOpsDashboardEvents(container, { onOpenOperations }) {
  container.querySelector('#openSupportOperations')?.addEventListener('click', () => {
    if (onOpenOperations) onOpenOperations();
  });
}
