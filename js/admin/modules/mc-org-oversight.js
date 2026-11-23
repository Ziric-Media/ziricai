import { escapeHtml, formatNumber, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchGovernanceOrgs } from '../services/platformGovernanceClient.js';

export async function renderMcOrgOversight(container) {
  container.innerHTML = loadingState('Loading organisation oversight…');
  const { data, error } = await fetchGovernanceOrgs();
  const overview = data?.data || data;
  if (!overview && error) {
    container.innerHTML = pageHeader('Organisations', 'Company Portal and Network oversight.') + emptyState(error);
    return;
  }
  container.innerHTML = `
    ${pageHeader('Organisations', 'Registered tenants and network presence (read-only).', '<span class="ops-tag">MC-PO-09</span>')}
    <div class="kpi-grid kpi-grid-ops">
      <div class="kpi-card"><div class="label">Registered tenants</div><div class="value">${formatNumber(overview.totals?.registered || 0)}</div></div>
      <div class="kpi-card"><div class="label">Listed on Discover</div><div class="value">${formatNumber(overview.network?.entitiesListed ?? '—')}</div></div>
    </div>
    <p class="panel-hint">${escapeHtml(overview.privacy?.note || '')}</p>`;
}
