import { escapeHtml, formatNumber, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchPlatformAnalyticsOverview } from '../services/platformConsole.js';

export async function renderPlatformAnalytics(container) {
  container.innerHTML = loadingState('Loading ZiricAI Analytics…');
  const { data, error } = await fetchPlatformAnalyticsOverview();
  if (!data) {
    container.innerHTML = pageHeader('ZiricAI Analytics', 'How ZiricAI is performing as a platform.') + emptyState(error || 'Unable to load platform analytics.');
    return;
  }

  const c = data.overview || {};
  const t = data.tenants || {};
  const d = data.deployed || {};

  container.innerHTML = `
    ${pageHeader(
      'ZiricAI Analytics',
      'Operator / CEO view — platform performance, not tenant Central Motors analytics.',
      '<span class="ops-tag">Read-only</span>'
    )}
    <div class="kpi-grid kpi-grid-ops">
      ${kpi('Total tenants', c.total)}
      ${kpi('Real customers', c.productionCustomer)}
      ${kpi('Trials', t.trial)}
      ${kpi('Paying', t.paying)}
      ${kpi('Pilot', c.pilot)}
      ${kpi('WhatsApp connected', data.integrations?.whatsapp?.connected)}
      ${kpi('AI Employees (sampled)', d.aiEmployees, d.partial ? 'Sampled 25 tenants' : '')}
      ${kpi('Knowledge bases', d.knowledgeBaseTenants, d.partial ? 'Sampled' : '')}
      ${kpi('MRR (sampled)', data.billing?.mrr != null ? `R${formatNumber(data.billing.mrr)}` : '—')}
      ${kpi('New this month', t.newThisMonth)}
    </div>
    <div class="ops-grid ops-row-2">
      ${chartPlaceholder('Tenant Growth', data.charts?.tenantGrowth?.note)}
      ${chartPlaceholder('Revenue Growth', data.charts?.revenueGrowth?.note)}
      ${chartPlaceholder('Platform Usage', data.charts?.platformUsage?.note)}
    </div>
    <p class="panel-hint">Tenant-scoped charts remain under CRM scope or the legacy Analytics module when a single company is selected.</p>
  `;
}

function kpi(label, value, note = '') {
  const display = value == null || value === '' ? '—' : escapeHtml(String(value));
  return `<div class="kpi-card"><div class="label">${escapeHtml(label)}</div><div class="value">${display}</div>${note ? `<div class="panel-hint">${escapeHtml(note)}</div>` : ''}</div>`;
}

function chartPlaceholder(title, note) {
  return `
    <div class="panel-card">
      <div class="panel-header"><h3>${escapeHtml(title)}</h3><span class="ops-tag">Planned</span></div>
      <div class="empty-panel">${escapeHtml(note || 'Time-series charts will attach to platform rollup stores.')}</div>
    </div>`;
}
