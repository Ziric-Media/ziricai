import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, formatNumber, trendHtml, errorState } from '../../admin/ui.js';
import { fetchPortalAnalytics, fetchPopularQuestions, downloadReport } from '../api.js';
import { demoAnalyticsData } from '../demo-data.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { can } from '../permissions.js';

let charts = {};

export async function renderAnalytics(container) {
  if (!can(state.profile?.role, 'canExportData')) {
    container.innerHTML = errorState('You do not have permission to view analytics.');
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

  if (res.error && !useDemo) {
    container.innerHTML = `${pageHeader('Analytics', 'Live BI for your company.')}
      ${errorState(res.error)}
      <div style="text-align:center;margin-top:12px;"><button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button></div>`;
    return;
  }

  const data = res.error && useDemo
    ? demoAnalyticsData(companyId)
    : (apiData?.series ? apiData : { series: { labels: [] }, rows: [], summary: {}, kpis: apiData?.kpis || {} });
  const showingDemo = Boolean(res.error && useDemo);
  const { series, rows, summary } = data;
  const kpis = data.kpis || apiData?.kpis || {};
  const hasSeries = Boolean(series?.labels?.length);
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

    ${showingDemo ? `<div class="portal-module-notice" style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:rgba(59,130,246,0.12);color:#1e40af;">
      <i class="fa-solid fa-flask"></i> Demo analytics — sample data for the showcase tenant.
    </div>` : ''}

    <div class="kpi-grid kpi-grid-ops">
      ${kpiCard('Conversations', formatMetric(kpis.conversations ?? summary.conversations7d), 'fa-comments', 'purple', summary.trends?.conversations)}
      ${kpiCard('Leads', formatMetric(kpis.leads ?? summary.leads7d), 'fa-user-plus', 'blue', summary.trends?.leads)}
      ${kpiCard('Appointments', formatMetric(kpis.appointments ?? summary.appointments7d), 'fa-calendar-check', 'green', summary.trends?.appointments)}
      ${kpiCard('Revenue', formatMetric(kpis.revenue ?? summary.revenue7d), 'fa-coins', 'yellow', summary.trends?.revenue)}
      ${kpiCard('Conversions', formatMetric(kpis.conversions ?? summary.conversions7d), 'fa-chart-line', 'orange', null)}
      ${kpiCard('AI Accuracy', formatPercentMetric(kpis.aiAccuracy ?? summary.aiResolutionRate), 'fa-robot', 'purple', null)}
      ${kpiCard('Response Time', formatSecondsMetric(kpis.responseTimeSec ?? summary.avgResponseSec), 'fa-bolt', 'yellow', summary.trends?.avgResponseSec, true)}
      ${kpiCard('Satisfaction', formatMetric(kpis.customerSatisfaction ?? summary.avgSatisfaction), 'fa-face-smile', 'blue', summary.trends?.satisfaction)}
      ${kpiCard('Missed Opps', formatMetric(kpis.missedOpportunities ?? summary.missedOpportunities), 'fa-triangle-exclamation', 'red', null)}
      ${kpiCard('Automation', formatPercentMetric(kpis.automationSuccessRate ?? summary.automationSuccessRate), 'fa-diagram-project', 'green', null)}
    </div>

    ${!hasSeries && !showingDemo ? `<div class="empty-panel" style="padding:24px;margin-bottom:16px;">No analytics data yet for this period.</div>` : ''}

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
                <td><span class="score-badge">${r.satisfaction ?? '—'}</span></td>
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

function formatMetric(value) {
  if (value == null || value === '') return '—';
  return formatNumber(value);
}

function formatPercentMetric(value) {
  if (value == null || value === '') return '—';
  return `${value}%`;
}

function formatSecondsMetric(value) {
  if (value == null || value === '') return '—';
  return `${value}s`;
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
