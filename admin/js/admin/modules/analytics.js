import { state } from '../state.js';
import {
  escapeHtml,
  formatNumber,
  pageHeader,
  emptyState,
  loadingState,
  errorState,
} from '../ui.js';
import { withTimeout } from '../utils.js';
import {
  loadTenantAnalytics,
  formatAnalyticsMetric,
} from '../services/analytics.js';

const PIPELINE_ROWS = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

function kpiCard(label, kpi, icon, colorClass) {
  const raw = formatAnalyticsMetric(kpi);
  const display = raw === '—' ? '—' : formatNumber(raw);
  return `
    <div class="kpi-card">
      <div class="header">
        <div>
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${display}</div>
        </div>
        <div class="icon-wrapper ${colorClass}"><i class="fa-solid ${icon}"></i></div>
      </div>
    </div>`;
}

function renderScopeRequired(container) {
  const companyHints = (state.companies || [])
    .slice(0, 5)
    .map((c) => escapeHtml(c.name))
    .join(', ');

  container.innerHTML = `
    ${pageHeader(
      'Analytics',
      'Tenant operational metrics from live CRM, conversations, and appointments.',
      '<span class="crm-source-badge">Live API</span>'
    )}
    <div class="profile-card" style="text-align:center;padding:48px 24px;">
      <div style="font-size:40px;margin-bottom:12px;">🏢</div>
      <div style="font-weight:600;margin-bottom:8px;">No data yet</div>
      <div style="color:var(--text-muted);font-size:14px;margin-bottom:16px;max-width:520px;margin-left:auto;margin-right:auto;">
        Select a company to view analytics.
        Use the <strong>Scope</strong> dropdown in the top bar
        ${companyHints ? ` (e.g. ${companyHints})` : ''}.
      </div>
      <button class="btn btn-primary" type="button" id="selectCompanyScopeAnalytics">
        <i class="fa-solid fa-building"></i> Open Scope selector
      </button>
    </div>
  `;

  container.querySelector('#selectCompanyScopeAnalytics')?.addEventListener('click', () => {
    const select = document.getElementById('companySelector');
    select?.focus();
    select?.click();
  });
}

export async function renderAnalytics(container) {
  container.innerHTML = loadingState('Loading analytics...');

  const companyId = state.selectedCompanyId || null;

  if (!companyId) {
    renderScopeRequired(container);
    return;
  }

  const result = await withTimeout(loadTenantAnalytics(companyId));

  if (result.loadState === 'scope_required') {
    renderScopeRequired(container);
    return;
  }

  if (result.loadState === 'error') {
    container.innerHTML = `
      ${pageHeader(
        'Analytics',
        'Tenant operational metrics from live CRM, conversations, and appointments.',
        '<span class="crm-source-badge">Live API</span>'
      )}
      ${errorState(result.error || 'Unable to load analytics. Please check your connection and try again.')}
      <div style="text-align:center;margin-top:-24px;padding-bottom:32px;">
        <button class="btn btn-primary" type="button" id="retryAnalytics">
          <i class="fa-solid fa-rotate"></i> Retry
        </button>
      </div>
    `;
    container.querySelector('#retryAnalytics')?.addEventListener('click', () => renderAnalytics(container));
    return;
  }

  const view = result.view;
  const kpis = view?.kpis || {};
  const companyLabel = escapeHtml(view?.companyName || companyId);
  const subtitle = view?.hasOperationalData
    ? `${companyLabel} — live tenant operational metrics.`
    : `${companyLabel} — no operational records yet for this tenant.`;

  container.innerHTML = `
    ${pageHeader('Analytics', subtitle, '<span class="crm-source-badge">Live API</span>')}

    <div class="kpi-grid">
      ${kpiCard('Conversations', kpis.conversations, 'fa-comments', 'purple')}
      ${kpiCard('Active Conversations', kpis.activeConversations, 'fa-comment-dots', 'purple')}
      ${kpiCard('CRM Leads', kpis.leads, 'fa-user-plus', 'blue')}
      ${kpiCard('Qualified Leads', kpis.qualifiedLeads, 'fa-filter', 'purple')}
      ${kpiCard('Test Drives', kpis.testDrives, 'fa-car', 'green')}
      ${kpiCard('Finance Enquiries', kpis.financeEnquiries, 'fa-coins', 'yellow')}
      ${kpiCard('Deals Won', kpis.dealsWon, 'fa-trophy', 'green')}
      ${kpiCard('Messages', kpis.messages, 'fa-fire', 'orange')}
      ${kpiCard('Human Takeovers', kpis.humanTakeovers, 'fa-user-shield', 'red')}
      ${kpiCard('AI Employees', kpis.aiEmployees, 'fa-robot', 'green')}
      ${kpiCard('Est. Revenue', kpis.revenue, 'fa-money-bill', 'green')}
      ${kpiCard('Customer Satisfaction', kpis.customerSatisfaction, 'fa-star', 'green')}
      ${kpiCard('AI Response Time', kpis.responseTime, 'fa-bolt', 'yellow')}
      ${kpiCard('Token Usage', kpis.tokens, 'fa-microchip', 'blue')}
    </div>

    <div class="chart-card chart-card-line" style="margin-bottom:28px;">
      <div class="chart-card-header">
        <h3><i class="fa-solid fa-chart-bar"></i> Messages Per Day</h3>
        <span class="ops-tag">Coming in B-MC-4b</span>
      </div>
      <div class="chart-canvas-wrap" style="min-height:120px;display:flex;align-items:center;justify-content:center;">
        ${emptyState('Daily message trends will be available once time-series aggregation is wired (B-MC-4b).')}
      </div>
    </div>

    <div class="table-container">
      <table class="org-table">
        <thead>
          <tr><th>Pipeline Stage</th><th>Count</th></tr>
        </thead>
        <tbody>
          ${
            view?.hasOperationalData
              ? PIPELINE_ROWS.map(
                  (row) => `
              <tr>
                <td>${escapeHtml(row.label)}</td>
                <td>${formatNumber(view.pipeline?.[row.key] ?? 0)}</td>
              </tr>`
                ).join('')
              : `<tr><td colspan="2">${emptyState('Pipeline counts will appear when CRM leads exist for this tenant.')}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}
