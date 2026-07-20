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



let analyticsChart = null;



export async function renderAnalytics(container) {

  container.innerHTML = loadingState('Loading analytics...');



  const companyId = state.selectedCompanyId || state.companies[0]?.id;

  const result = await withTimeout(listAnalytics(companyId));

  const rows = result.items?.length ? result.items : DEMO_ANALYTICS_ROWS;

  const series = rows.length >= 3

    ? {

        labels: rows.slice(0, 7).reverse().map((r) => r.date?.slice(5) || '—'),

        messages: rows.slice(0, 7).reverse().map((r) => r.whatsappMessages || 0),

      }

    : { labels: DEMO_ANALYTICS_SERIES.labels, messages: DEMO_ANALYTICS_SERIES.whatsappMessages };



  const totalConversations = rows.reduce((s, r) => s + (r.conversations || 0), 0);

  const totalTokens = rows.reduce((s, r) => s + (r.tokensUsed || 0), 0);

  const avgResponse =

    rows.length > 0

      ? Math.round(rows.reduce((s, r) => s + (r.avgResponseTimeMs || 0), 0) / rows.length)

      : 0;

  const avgSatisfaction =

    rows.length > 0

      ? (rows.reduce((s, r) => s + (r.satisfaction || 4.5), 0) / rows.length).toFixed(1)

      : '4.5';

  const activeCompanies = rows[0]?.activeCompanies || state.companies.length || 3;



  container.innerHTML = `

    ${pageHeader('Analytics', 'Messages per day, active companies, satisfaction, and AI response time.')}

    <div class="kpi-grid">

      <div class="kpi-card">

        <div class="header"><div><div class="label">Messages / Day (avg)</div><div class="value">${formatNumber(Math.round(series.messages.reduce((a, b) => a + b, 0) / series.messages.length))}</div>${trendHtml(9.8)}</div><div class="icon-wrapper blue"><i class="fa-brands fa-whatsapp"></i></div></div>

      </div>

      <div class="kpi-card">

        <div class="header"><div><div class="label">Active Companies</div><div class="value">${activeCompanies}</div>${trendHtml(8.2)}</div><div class="icon-wrapper purple"><i class="fa-solid fa-building"></i></div></div>

      </div>

      <div class="kpi-card">

        <div class="header"><div><div class="label">Customer Satisfaction</div><div class="value">${avgSatisfaction}<span style="font-size:16px;color:var(--text-muted);">/5</span></div>${trendHtml(2.1)}</div><div class="icon-wrapper green"><i class="fa-solid fa-star"></i></div></div>

      </div>

      <div class="kpi-card">

        <div class="header"><div><div class="label">AI Response Time</div><div class="value">${avgResponse ? `${avgResponse}ms` : '—'}</div>${trendHtml(-5.3)}</div><div class="icon-wrapper yellow"><i class="fa-solid fa-bolt"></i></div></div>

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

