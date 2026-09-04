import { state } from '../state.js';

import {

  escapeHtml,

  formatNumber,

  pageHeader,

  emptyState,

  loadingState,

  trendHtml,

} from '../ui.js';

import { listAnalytics } from '../services/dashboard.js';

import { withTimeout } from '../utils.js';

import { DEMO_ANALYTICS_ROWS, DEMO_ANALYTICS_SERIES } from '../demo-data.js';
import { isDemoDataAllowed, resolveListItems, emptyChartSeries } from '../services/dataMode.js';



let analyticsChart = null;



export async function renderAnalytics(container) {

  container.innerHTML = loadingState('Loading analytics...');



  const companyId = state.selectedCompanyId || state.companies[0]?.id;

  const result = await withTimeout(listAnalytics(companyId));

  const rows = resolveListItems(result, DEMO_ANALYTICS_ROWS);
  const hasRealRows = Boolean(result.items?.length);

  const series = hasRealRows && rows.length >= 3
    ? {
        labels: rows.slice(0, 7).reverse().map((r) => r.date?.slice(5) || '—'),
        messages: rows.slice(0, 7).reverse().map((r) => r.whatsappMessages || 0),
      }
    : (isDemoDataAllowed()
      ? { labels: DEMO_ANALYTICS_SERIES.labels, messages: DEMO_ANALYTICS_SERIES.whatsappMessages }
      : { labels: emptyChartSeries().labels, messages: emptyChartSeries().messages });

  const totalConversations = hasRealRows ? rows.reduce((s, r) => s + (r.conversations || 0), 0) : null;
  const totalTokens = hasRealRows ? rows.reduce((s, r) => s + (r.tokensUsed || 0), 0) : null;
  const avgResponse = hasRealRows && rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.avgResponseTimeMs || 0), 0) / rows.length)
    : null;
  const avgSatisfaction = hasRealRows && rows.length > 0
    ? (rows.reduce((s, r) => s + (r.satisfaction || 0), 0) / rows.length).toFixed(1)
    : null;
  const activeCompanies = hasRealRows
    ? (rows[0]?.activeCompanies ?? state.companies.length)
    : (state.companies.length || null);
  const avgMessages = hasRealRows && series.messages.length
    ? Math.round(series.messages.reduce((a, b) => a + b, 0) / series.messages.length)
    : null;



  container.innerHTML = `

    ${pageHeader('Analytics', 'Messages per day, active companies, satisfaction, and AI response time.')}

    <div class="kpi-grid">

      <div class="kpi-card">

        <div class="header"><div><div class="label">Messages / Day (avg)</div><div class="value">${avgMessages != null ? formatNumber(avgMessages) : '—'}</div>${hasRealRows ? trendHtml(9.8) : ''}</div><div class="icon-wrapper blue"><i class="fa-brands fa-whatsapp"></i></div></div>

      </div>

      <div class="kpi-card">

        <div class="header"><div><div class="label">Active Companies</div><div class="value">${activeCompanies ?? '—'}</div>${hasRealRows ? trendHtml(8.2) : ''}</div><div class="icon-wrapper purple"><i class="fa-solid fa-building"></i></div></div>

      </div>

      <div class="kpi-card">

        <div class="header"><div><div class="label">Customer Satisfaction</div><div class="value">${avgSatisfaction != null ? `${avgSatisfaction}<span style="font-size:16px;color:var(--text-muted);">/5</span>` : '—'}</div>${hasRealRows ? trendHtml(2.1) : ''}</div><div class="icon-wrapper green"><i class="fa-solid fa-star"></i></div></div>

      </div>

      <div class="kpi-card">

        <div class="header"><div><div class="label">AI Response Time</div><div class="value">${avgResponse != null ? `${avgResponse}ms` : '—'}</div>${hasRealRows ? trendHtml(-5.3) : ''}</div><div class="icon-wrapper yellow"><i class="fa-solid fa-bolt"></i></div></div>

      </div>

    </div>



    <div class="chart-card chart-card-line" style="margin-bottom:28px;">

      <div class="chart-card-header">

        <h3><i class="fa-solid fa-chart-bar"></i> Messages Per Day</h3>

      </div>

      <div class="chart-canvas-wrap"><canvas id="analyticsChart"></canvas></div>

    </div>



    <div class="table-container">

      <table class="org-table">

        <thead>

          <tr><th>Date</th><th>Conversations</th><th>WhatsApp Msgs</th><th>Tokens</th><th>Response Time</th><th>Satisfaction</th></tr>

        </thead>

        <tbody>

          ${rows.length

            ? rows

                .map(

                  (r) => `

              <tr>

                <td>${escapeHtml(r.date || '—')}</td>

                <td>${formatNumber(r.conversations || 0)}</td>

                <td>${formatNumber(r.whatsappMessages || 0)}</td>

                <td>${formatNumber(r.tokensUsed || 0)}</td>

                <td>${r.avgResponseTimeMs ? `${r.avgResponseTimeMs}ms` : '—'}</td>

                <td>${r.satisfaction ? `${r.satisfaction}/5` : '—'}</td>

              </tr>`

                )

                .join('')

            : `<tr><td colspan="6">${emptyState('Analytics records will populate as conversations are tracked.')}</td></tr>`}

        </tbody>

      </table>

    </div>

  `;



  if (typeof Chart !== 'undefined') {

    analyticsChart?.destroy();

    const ctx = container.querySelector('#analyticsChart');

    if (ctx) {

      analyticsChart = new Chart(ctx, {

        type: 'bar',

        data: {

          labels: series.labels,

          datasets: [{

            label: 'Messages',

            data: series.messages,

            backgroundColor: 'rgba(139, 92, 246, 0.7)',

            borderRadius: 6,

          }],

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: { legend: { display: false } },

          scales: {

            x: { grid: { display: false }, ticks: { color: '#94a3b8' } },

            y: { grid: { color: 'rgba(148,163,184,0.15)' }, ticks: { color: '#94a3b8' }, beginAtZero: true },

          },

        },

      });

    }

  }

}

