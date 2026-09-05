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
  loadTenantAnalyticsTimeSeries,
  formatAnalyticsMetric,
  chartLabelsFromSeries,
  chartValuesFromSeries,
  formatSeriesMetaNote,
} from '../services/analytics.js';

const PIPELINE_ROWS = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

/** @type {import('chart.js').Chart[]} */
let activeCharts = [];

function destroyActiveCharts() {
  activeCharts.forEach((chart) => chart?.destroy());
  activeCharts = [];
}

function kpiCard(label, kpi, icon, colorClass, note = '') {
  const raw = formatAnalyticsMetric(kpi);
  const display = raw === '—' ? '—' : formatNumber(raw);
  const noteHtml = note
    ? `<div class="label" style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:400;">${escapeHtml(note)}</div>`
    : '';
  return `
    <div class="kpi-card">
      <div class="header">
        <div>
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${display}</div>
          ${noteHtml}
        </div>
        <div class="icon-wrapper ${colorClass}"><i class="fa-solid ${icon}"></i></div>
      </div>
    </div>`;
}

function chartCard({ id, title, tag, note, emptyMessage }) {
  return `
    <div class="chart-card chart-card-line" style="margin-bottom:28px;">
      <div class="chart-card-header">
        <h3><i class="fa-solid fa-chart-bar"></i> ${escapeHtml(title)}</h3>
        <span class="ops-tag">${escapeHtml(tag)}</span>
      </div>
      ${note ? `<p style="font-size:12px;color:var(--text-muted);margin:0 0 12px 4px;">${escapeHtml(note)}</p>` : ''}
      <div class="chart-canvas-wrap ops-chart-wrap" style="min-height:220px;" data-chart-wrap="${escapeHtml(id)}">
        <canvas id="${escapeHtml(id)}"></canvas>
        ${emptyMessage ? `<div class="chart-empty-overlay" style="display:none;">${emptyMessage}</div>` : ''}
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

function initBarChart(canvasId, labels, values, { color, label }) {
  if (typeof Chart === 'undefined') return null;
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const peak = Math.max(...values, 0);
  const gridColor = 'rgba(148, 163, 184, 0.15)';
  const textColor = '#94a3b8';

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: values.map((v) => {
            const intensity = peak ? v / peak : 0;
            return color.replace('ALPHA', String(0.25 + intensity * 0.65));
          }),
          borderColor: color.replace('ALPHA', '1'),
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 14 },
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 }, precision: 0 },
        },
      },
    },
  });

  activeCharts.push(chart);
  return chart;
}

function initTimeSeriesCharts(container, timeSeries) {
  destroyActiveCharts();
  if (!timeSeries?.series) return;

  const rangeLabel = `${timeSeries.startDate} → ${timeSeries.endDate} UTC`;

  const charts = [
    {
      id: 'analyticsMessagesChart',
      points: timeSeries.series.messages,
      meta: timeSeries.meta?.messages,
      label: 'Message documents',
      color: 'rgba(249, 115, 22, ALPHA)',
      title: 'Message Documents Per Day',
    },
    {
      id: 'analyticsConversationsChart',
      points: timeSeries.series.conversationsCreated,
      meta: timeSeries.meta?.conversationsCreated,
      label: 'Conversations created',
      color: 'rgba(139, 92, 246, ALPHA)',
      title: 'Conversations Created Per Day',
    },
    {
      id: 'analyticsTestDrivesChart',
      points: timeSeries.series.testDrivesBooked,
      meta: timeSeries.meta?.testDrivesBooked,
      label: 'Test drives booked',
      color: 'rgba(34, 197, 94, ALPHA)',
      title: 'Test Drives Booked Per Day',
    },
  ];

  for (const spec of charts) {
    if (!spec.points) continue;
    const labels = chartLabelsFromSeries(spec.points);
    const values = chartValuesFromSeries(spec.points);
    initBarChart(spec.id, labels, values, { color: spec.color, label: spec.label });
  }

  const footnote = container.querySelector('#analyticsTimeseriesFootnote');
  if (footnote) {
    footnote.textContent = `Daily buckets · ${rangeLabel}`;
  }
}

export async function renderAnalytics(container) {
  destroyActiveCharts();
  container.innerHTML = loadingState('Loading analytics...');

  const companyId = state.selectedCompanyId || null;

  if (!companyId) {
    renderScopeRequired(container);
    return;
  }

  const [kpiResult, tsResult] = await Promise.all([
    withTimeout(loadTenantAnalytics(companyId)),
    withTimeout(loadTenantAnalyticsTimeSeries(companyId)),
  ]);

  if (kpiResult.loadState === 'scope_required') {
    renderScopeRequired(container);
    return;
  }

  if (kpiResult.loadState === 'error') {
    container.innerHTML = `
      ${pageHeader(
        'Analytics',
        'Tenant operational metrics from live CRM, conversations, and appointments.',
        '<span class="crm-source-badge">Live API</span>'
      )}
      ${errorState(kpiResult.error || 'Unable to load analytics. Please check your connection and try again.')}
      <div style="text-align:center;margin-top:-24px;padding-bottom:32px;">
        <button class="btn btn-primary" type="button" id="retryAnalytics">
          <i class="fa-solid fa-rotate"></i> Retry
        </button>
      </div>
    `;
    container.querySelector('#retryAnalytics')?.addEventListener('click', () => renderAnalytics(container));
    return;
  }

  const view = kpiResult.view;
  const kpis = view?.kpis || {};
  const companyLabel = escapeHtml(view?.companyName || companyId);
  const subtitle = view?.hasOperationalData
    ? `${companyLabel} — live tenant operational metrics.`
    : `${companyLabel} — no operational records yet for this tenant.`;

  const ts = tsResult.loadState === 'ok' ? tsResult.timeSeries : null;
  const messagesMetaNote = formatSeriesMetaNote(ts?.meta?.messages);
  const conversationsMetaNote = formatSeriesMetaNote(ts?.meta?.conversationsCreated);
  const testDrivesMetaNote = formatSeriesMetaNote(ts?.meta?.testDrivesBooked);

  const timeseriesSection = ts
    ? `
    <div style="margin-bottom:8px;">
      <p id="analyticsTimeseriesFootnote" style="font-size:12px;color:var(--text-muted);margin:0 0 16px 4px;"></p>
    </div>
    ${chartCard({
      id: 'analyticsMessagesChart',
      title: 'Message Documents Per Day',
      tag: 'Live API · UTC',
      note: messagesMetaNote || 'Tenant message documents — not the CRM Messages KPI.',
    })}
    ${chartCard({
      id: 'analyticsConversationsChart',
      title: 'Conversations Created Per Day',
      tag: ts.meta?.conversationsCreated?.complete === false ? 'Incomplete timestamps' : 'Live API · UTC',
      note: conversationsMetaNote || 'Based on conversation createdAt only.',
    })}
    ${chartCard({
      id: 'analyticsTestDrivesChart',
      title: 'Test Drives Booked Per Day',
      tag: 'Live API · UTC',
      note: testDrivesMetaNote || 'PostgreSQL bookings by created_at.',
    })}
  `
    : `
    <div class="chart-card chart-card-line" style="margin-bottom:28px;">
      <div class="chart-card-header">
        <h3><i class="fa-solid fa-chart-bar"></i> Daily Trends</h3>
        <span class="ops-tag">Unavailable</span>
      </div>
      <div class="chart-canvas-wrap" style="min-height:120px;display:flex;align-items:center;justify-content:center;">
        ${errorState(tsResult.error || 'Time-series data is unavailable for this tenant.')}
      </div>
    </div>
  `;

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
      ${kpiCard('Messages', kpis.messages, 'fa-fire', 'orange', 'CRM counter (totalMessages)')}
      ${kpiCard('Human Takeovers', kpis.humanTakeovers, 'fa-user-shield', 'red')}
      ${kpiCard('AI Employees', kpis.aiEmployees, 'fa-robot', 'green')}
      ${kpiCard('Est. Revenue', kpis.revenue, 'fa-money-bill', 'green')}
      ${kpiCard('Customer Satisfaction', kpis.customerSatisfaction, 'fa-star', 'green')}
      ${kpiCard('AI Response Time', kpis.responseTime, 'fa-bolt', 'yellow')}
      ${kpiCard('Token Usage', kpis.tokens, 'fa-microchip', 'blue')}
    </div>

    ${timeseriesSection}

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

  if (ts) {
    initTimeSeriesCharts(container, ts);
  }
}
