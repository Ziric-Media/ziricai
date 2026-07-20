import { state } from '../state.js';
import { escapeHtml, pageHeader, loadingState, formatNumber, emptyState, trendHtml } from '../../admin/ui.js';
import { fetchPortalAnalytics, fetchPopularQuestions, downloadReport } from '../api.js';
import { demoAnalyticsData } from '../demo-data.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can } from '../permissions.js';

let charts = {};

export async function renderAnalytics(container) {
  if (!can(state.profile?.role, 'canExportData')) {
    container.innerHTML = emptyState('You do not have permission to view analytics.');
    return;
  }

  container.innerHTML = loadingState('Loading analytics...');

  const companyId = state.companyId;
  const [res, popularRes] = await Promise.all([
    fetchPortalAnalytics(companyId),
    fetchPopularQuestions(companyId, 8),
  ]);

  const apiData = res.data;
  const useDemo = shouldUseDemoFallback({ companyId, isDemo: state.hubData?.isDemo, isProvisioned: state.hubData?.isProvisioned });
  const fallback = useDemo ? demoAnalyticsData(companyId) : { series: {}, rows: [], summary: {}, kpis: {} };
  const data = apiData?.series ? apiData : (res.error && useDemo ? fallback : apiData || fallback);
  const { series, rows, summary } = data;
  const kpis = apiData?.kpis || data.kpis || {};

  if (res.error && !useDemo && !apiData?.series) {
    container.innerHTML = `${pageHeader('Analytics', 'Live BI for your company.')}
      ${renderEmptyState({ message: res.error, actionHtml: '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>' })}`;
    return;
  }
  const popularQuestions = popularRes.data?.questions || [];
  const aiInsights = apiData?.aiInsights;
  const canExport = state.permissions.canExportData;

  container.innerHTML = `
    ${pageHeader(
      'Analytics',
      `Live BI for ${escapeHtml(state.company?.name || 'your company')}.`,
      canExport
        ? `<button class="btn btn-secondary btn-sm" type="button" id="downloadReportBtn"><i class="fa-solid fa-file-export"></i> Download Report</button>`
        : ''
    )}

    <div class="kpi-grid kpi-grid-ops">
      ${kpiCard('Conversations', formatNumber(kpis.conversations ?? summary.conversations7d), 'fa-comments', 'purple', summary.trends?.conversations)}
      ${kpiCard('Leads', formatNumber(kpis.leads ?? 0), 'fa-user-plus', 'blue', summary.trends?.leads)}
      ${kpiCard('Appointments', formatNumber(kpis.appointments ?? summary.appointments7d ?? 0), 'fa-calendar-check', 'green', summary.trends?.appointments)}
      ${kpiCard('Revenue', formatNumber(kpis.revenue ?? summary.revenue7d ?? 0), 'fa-coins', 'yellow', summary.trends?.revenue)}
      ${kpiCard('Conversions', formatNumber(kpis.conversions ?? 0), 'fa-chart-line', 'orange', null)}
      ${kpiCard('AI Accuracy', `${kpis.aiAccuracy ?? summary.aiResolutionRate ?? 85}%`, 'fa-robot', 'purple', null)}
      ${kpiCard('Response Time', `${kpis.responseTimeSec ?? summary.avgResponseSec ?? 1.8}s`, 'fa-bolt', 'yellow', summary.trends?.avgResponseSec, true)}
      ${kpiCard('Satisfaction', `${kpis.customerSatisfaction ?? summary.avgSatisfaction ?? 4.2}`, 'fa-face-smile', 'blue', summary.trends?.satisfaction)}
      ${kpiCard('Missed Opps', formatNumber(kpis.missedOpportunities ?? 0), 'fa-triangle-exclamation', 'red', null)}
      ${kpiCard('Automation', `${kpis.automationSuccessRate ?? 0}%`, 'fa-diagram-project', 'green', null)}
    </div>

    <div class="portal-analytics-grid">
      <div class="portal-analytics-chart">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-chart-line"></i> Conversations — Last 7 Days</h3>
        </div>
        <div class="chart-canvas-wrap portal-chart-wrap"><canvas id="portalAnalyticsConvChart"></canvas></div>
      </div>

      <div class="portal-analytics-chart">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-user-plus"></i> Leads & Appointments</h3>
        </div>
        <div class="chart-canvas-wrap portal-chart-wrap"><canvas id="portalAnalyticsLeadsChart"></canvas></div>
      </div>

      <div class="portal-analytics-chart">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-coins"></i> Revenue</h3>
        </div>
        <div class="chart-canvas-wrap portal-chart-wrap"><canvas id="portalAnalyticsRevChart"></canvas></div>
      </div>

      <div class="portal-analytics-chart">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-star"></i> Satisfaction</h3>
        </div>
        <div class="chart-canvas-wrap portal-chart-wrap"><canvas id="portalAnalyticsSatChart"></canvas></div>
      </div>
    </div>

    ${aiInsights ? `
    <div class="portal-analytics-table-wrap" style="margin-bottom:1.5rem;">
      <div class="table-header"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> AI Insights</h3></div>
      <div class="card-body" style="padding:16px;">
        <p><strong>Sentiment trend:</strong> ${escapeHtml(aiInsights.sentimentTrend || 'neutral')}</p>
        ${aiInsights.conversionFunnel ? `
        <p style="margin-top:8px;"><strong>Conversion funnel:</strong>
          ${aiInsights.conversionFunnel.conversations} conversations →
          ${aiInsights.conversionFunnel.leads} leads →
          ${aiInsights.conversionFunnel.qualified} qualified →
          ${aiInsights.conversionFunnel.appointments} appointments →
          ${aiInsights.conversionFunnel.conversions} conversions
        </p>` : ''}
        ${aiInsights.channelMix?.length ? `
        <p style="margin-top:8px;"><strong>Channel mix:</strong>
          ${aiInsights.channelMix.map((c) => `${escapeHtml(c.channel)} (${c.count})`).join(', ')}
        </p>` : ''}
      </div>
    </div>` : ''}

    ${popularQuestions.length ? `
    <div class="portal-analytics-table-wrap">
      <div class="table-header">
        <h3><i class="fa-solid fa-circle-question"></i> Popular Questions</h3>
      </div>
      <div class="table-container">
        <table class="org-table">
          <thead><tr><th>Question</th><th>Count</th></tr></thead>
          <tbody>
            ${popularQuestions.map((q) => `
              <tr>
                <td>${escapeHtml(q.question)}</td>
                <td>${formatNumber(q.count)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="portal-analytics-table-wrap">
      <div class="table-header">
        <h3><i class="fa-solid fa-table"></i> Daily Breakdown</h3>
        <span class="ops-tag">Last ${rows.length} days</span>
      </div>
      <div class="table-container">
        <table class="org-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Conversations</th>
              <th>Leads</th>
              <th>WhatsApp</th>
              <th>Revenue</th>
              <th>Satisfaction</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${escapeHtml(r.date)}</td>
                <td>${formatNumber(r.conversations)}</td>
                <td>${formatNumber(r.leads ?? 0)}</td>
                <td>${formatNumber(r.whatsappMessages)}</td>
                <td>${formatNumber(r.revenue ?? 0)}</td>
                <td><span class="score-badge">${r.satisfaction}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  initAnalyticsCharts(container, series);

  container.querySelector('#downloadReportBtn')?.addEventListener('click', () => {
    window.open(`/api/companies/${encodeURIComponent(companyId)}/reports/weekly?format=html`, '_blank');
  });
}

function kpiCard(label, value, icon, color, trend, invertTrend = false) {
  const trendVal = trend != null ? (invertTrend ? -trend : trend) : null;
  return `
    <div class="kpi-card">
      <div class="header">
        <div>
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(String(value))}</div>
          ${trendVal != null ? trendHtml(trendVal) : ''}
        </div>
        <div class="icon-wrapper ${color}"><i class="fa-solid ${icon}"></i></div>
      </div>
    </div>
  `;
}

function getBrandColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#1e40af';
}

function destroyCharts() {
  Object.values(charts).forEach((c) => c?.destroy());
  charts = {};
}

function initAnalyticsCharts(container, series) {
  if (typeof Chart === 'undefined' || !series?.labels?.length) return;
  destroyCharts();

  const brandColor = getBrandColor();
  const gridColor = 'rgba(148, 163, 184, 0.15)';
  const textColor = '#94a3b8';
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true },
    },
  };

  const convCtx = container.querySelector('#portalAnalyticsConvChart');
  if (convCtx) {
    charts.conv = new Chart(convCtx, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Conversations',
            data: series.conversations,
            borderColor: brandColor,
            backgroundColor: `${brandColor}18`,
            borderWidth: 2,
            tension: 0.35,
            fill: true,
          },
          {
            label: 'AI Handled',
            data: series.aiHandled || series.conversations,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: { ...baseOpts, interaction: { mode: 'index', intersect: false } },
    });
  }

  const leadsCtx = container.querySelector('#portalAnalyticsLeadsChart');
  if (leadsCtx) {
    charts.leads = new Chart(leadsCtx, {
      type: 'bar',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Leads',
            data: series.leads || [],
            backgroundColor: 'rgba(59, 130, 246, 0.65)',
            borderRadius: 4,
          },
          {
            label: 'Appointments',
            data: series.appointments || [],
            backgroundColor: 'rgba(16, 185, 129, 0.65)',
            borderRadius: 4,
          },
        ],
      },
      options: { ...baseOpts, plugins: { legend: { display: true, labels: { color: textColor, boxWidth: 10 } } } },
    });
  }

  const revCtx = container.querySelector('#portalAnalyticsRevChart');
  if (revCtx) {
    charts.rev = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [{
          label: 'Revenue',
          data: series.revenue || [],
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          tension: 0.35,
          fill: true,
        }],
      },
      options: baseOpts,
    });
  }

  const satCtx = container.querySelector('#portalAnalyticsSatChart');
  if (satCtx) {
    charts.sat = new Chart(satCtx, {
      type: 'bar',
      data: {
        labels: series.labels,
        datasets: [{
          label: 'Satisfaction',
          data: series.satisfaction,
          backgroundColor: `${brandColor}99`,
          borderRadius: 4,
        }],
      },
      options: {
        ...baseOpts,
        scales: {
          ...baseOpts.scales,
          y: { ...baseOpts.scales.y, max: 5, ticks: { ...baseOpts.scales.y.ticks, stepSize: 0.5 } },
        },
      },
    });
  }
}
