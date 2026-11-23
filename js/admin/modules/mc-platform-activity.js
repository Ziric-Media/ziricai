import { escapeHtml, formatNumber, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchGovernanceActivity } from '../services/platformGovernanceClient.js';

export async function renderMcPlatformActivity(container) {
  container.innerHTML = loadingState('Loading platform activity…');
  const { data, error } = await fetchGovernanceActivity();
  const overview = data?.data || data;
  if (!overview && error) {
    container.innerHTML = pageHeader('Platform Activity', 'Cross-product event analytics.') + emptyState(error);
    return;
  }
  const byType = overview.byType || {};
  container.innerHTML = `
    ${pageHeader('Platform Activity', 'Unified platform events (metadata only).', '<span class="ops-tag">MC-PO-03</span>')}
    <div class="kpi-grid kpi-grid-ops">
      <div class="kpi-card"><div class="label">Events (${overview.windowDays}d)</div><div class="value">${formatNumber(overview.totalEvents || 0)}</div></div>
    </div>
    <div class="table-container">
      <table class="org-table"><thead><tr><th>Event type</th><th>Count</th></tr></thead>
        <tbody>${Object.entries(byType).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${formatNumber(v)}</td></tr>`).join('') || '<tr><td colspan="2">No events recorded yet.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="panel-hint">${escapeHtml(overview.note || '')}</p>`;
}
