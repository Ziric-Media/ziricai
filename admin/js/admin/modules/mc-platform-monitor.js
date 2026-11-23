import { escapeHtml, formatNumber, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchGovernanceAppMonitor } from '../services/platformGovernanceClient.js';

export async function renderMcPlatformMonitor(container) {
  container.innerHTML = loadingState('Loading Sarah App monitor…');
  const { data, error } = await fetchGovernanceAppMonitor(14);
  const overview = data?.data || data;
  if (!overview && error) {
    container.innerHTML = pageHeader('Sarah App Monitor', 'Install funnel, sessions and client errors.') + emptyState(error);
    return;
  }
  const totals = overview.totals || {};
  container.innerHTML = `
    ${pageHeader('Sarah App Monitor', 'Operational health of the Sarah App on devices.', '<span class="ops-tag">MC-PO-06</span>')}
    <div class="kpi-grid kpi-grid-ops">
      ${Object.entries(totals)
        .map(([k, v]) => `<div class="kpi-card"><div class="label">${escapeHtml(k)}</div><div class="value">${formatNumber(v)}</div></div>`)
        .join('')}
    </div>
    <p class="panel-hint">${escapeHtml(overview.note || '')}</p>`;
}
