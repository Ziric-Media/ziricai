import { state, setState } from '../state.js';
import {
  escapeHtml,
  formatNumber,
  loadingState,
  trendHtml,
} from '../ui.js';
import {
  getMetrics,
  getActivityFeed,
  getSystemHealth,
} from '../services/operationsService.js';

let hourlyChart = null;

export async function renderDashboard(container) {
  container.innerHTML = loadingState('Loading Mission Control...');

  let ops;
  let activity;
  let health;

  try {
    [ops, activity, health] = await Promise.all([
      getMetrics(),
      getActivityFeed(),
      getSystemHealth(),
    ]);
  } catch (err) {
    console.error('Mission Control load error:', err);
    container.innerHTML = loadingState('Failed to load Mission Control. Retrying...');
    return;
  }

  setState({ operationsData: ops, backendHealth: health });

  const userName =
    state.profile?.fullName ||
    state.profile?.name ||
    state.user?.email?.split('@')[0] ||
    'Super Admin';

  const isLiveCrm =
    ops.dataSource === 'crm' ||
    (!ops.isDemo && (ops.tenantMetrics || ops.dataSources?.crm === 'tenant_crm_apis'));

  const demoNote = ops.authRequired
    ? '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-lock"></i> Sign in required for live CRM</span>'
    : ops.authForbidden
      ? '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-user-shield"></i> Super Admin authorization required</span>'
      : ops.apiError
        ? '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-triangle-exclamation"></i> Live CRM temporarily unavailable</span>'
        : isLiveCrm
          ? '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-database"></i> Live CRM · central-motors-rtb</span>'
          : ops.isDemo
            ? '<span class="demo-badge"><i class="fa-solid fa-flask"></i> Sample data</span>'
            : '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-database"></i> Live CRM · central-motors-rtb</span>';

  const { metrics, trends, metricAvailability = {}, tenantMetrics } = ops;

  container.innerHTML = `
    <div class="dashboard-header ops-header">
      <div class="dashboard-header-left">
        <h1>Mission Control</h1>
        <p class="welcome-text ops-subtitle">AI Operations Center — Welcome back, <strong>${escapeHtml(userName)}</strong> ${demoNote}</p>
      </div>
      <div class="dashboard-header-actions">
        <div class="date-range-picker">
          <i class="fa-solid fa-calendar"></i>
          <input type="date" id="dashDateFrom" value="${new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)}" />
          <span>to</span>
          <input type="date" id="dashDateTo" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
        <button class="btn btn-secondary btn-sm" type="button" id="refreshDashboard">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    ${renderCentralMotorsPanel(tenantMetrics, metricAvailability, ops)}

    <div class="kpi-grid kpi-grid-ops">
      ${kpiCard('Active Conversations', formatMetric(metrics.activeConversations, metricAvailability.activeConversations), 'fa-comments', 'purple', trends.activeConversations)}
      ${kpiCard('CRM Leads', formatMetric(metrics.crmLeads, metricAvailability.leads), 'fa-user-plus', 'blue', null)}
      ${kpiCard('Qualified Leads', formatMetric(metrics.crmQualifiedLeads, metricAvailability.pipeline), 'fa-filter', 'purple', null)}
      ${kpiCard('Test Drives Booked', formatMetric(metrics.crmTestDrivesBooked, metricAvailability.testDrivesBooked), 'fa-car', 'green', null)}
      ${kpiCard('Finance Enquiries', formatMetric(metrics.crmFinanceEnquiries, metricAvailability.financeEnquiries), 'fa-coins', 'yellow', null)}
      ${kpiCard('Deals Won', formatMetric(metrics.crmDealsWon, metricAvailability.pipeline), 'fa-trophy', 'green', null)}
      ${kpiCard('Messages (CRM total)', formatMetric(metrics.messagesTotal, metricAvailability.messagesTotal), 'fa-fire', 'orange', null)}
      ${kpiCard('Human Takeovers', formatMetric(metrics.humanTakeovers, metricAvailability.humanTakeovers), 'fa-user-shield', 'red', trends.humanTakeovers)}
      ${kpiCard('AI Employees Online', formatMetric(metrics.aiEmployeesOnline, 'derived'), 'fa-robot', 'green', trends.aiEmployeesOnline)}
      ${kpiCard('Est. Revenue', formatMetric(metrics.estimatedRevenue, metricAvailability.estimatedRevenue), 'fa-money-bill', 'green', trends.estimatedRevenue)}
    </div>

    <div class="ops-grid ops-row-1">
      <div class="activity-section ops-activity">
        <div class="header">
          <h3><i class="fa-solid fa-satellite-dish"></i> Live Activity Feed</h3>
          <span class="live-indicator"><span class="pulse"></span> Live</span>
        </div>
        <div class="activity-feed ops-activity-scroll">
          ${renderActivityFeed(activity.items)}
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-header">
          <h3><i class="fa-solid fa-user-shield"></i> Recent Human Takeovers</h3>
          <a href="#" class="panel-link" data-nav="conversations">View inbox</a>
        </div>
        <div class="takeover-list">
          ${renderTakeovers(ops.humanTakeovers)}
        </div>
      </div>
    </div>

    <div class="ops-grid ops-row-2">
      <div class="panel-card">
        <div class="panel-header">
          <h3><i class="fa-solid fa-circle-question"></i> Trending Questions</h3>
          <span class="ops-tag">Unavailable</span>
        </div>
        <div class="trending-list">
          ${renderTrendingQuestions(ops.trendingQuestions)}
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-header">
          <h3><i class="fa-solid fa-trophy"></i> AI Performance Leaderboard</h3>
          <a href="#" class="panel-link" data-nav="agents">Manage</a>
        </div>
        <div class="agent-rank-list">
          ${renderAgentLeaderboard(ops.leaderboards?.agents)}
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-header">
          <h3><i class="fa-solid fa-building"></i> Company Performance</h3>
          <a href="#" class="panel-link" data-nav="companies">View all</a>
        </div>
        <div class="company-rank-list">
          ${renderCompanyLeaderboard(ops.leaderboards?.companies)}
        </div>
      </div>
    </div>

    <div class="ops-grid ops-row-3">
      <div class="chart-card chart-card-line ops-heatmap">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-chart-bar"></i> Hourly Conversations (24h)</h3>
          <div class="chart-legend">
            <span class="legend-item"><span class="dot purple"></span> Unavailable</span>
          </div>
        </div>
        <div class="chart-canvas-wrap ops-chart-wrap"><canvas id="hourlyConversationsChart"></canvas></div>
      </div>

      <div class="panel-card">
        <div class="panel-header">
          <h3><i class="fa-solid fa-heart-pulse"></i> System Health</h3>
          <span class="live-indicator"><span class="pulse"></span> Live</span>
        </div>
        <div class="system-status-list">
          ${renderSystemHealth(health)}
        </div>
      </div>
    </div>

    <footer class="dashboard-footer">
      <span>&copy; 2026 ZiricAI Mission Control</span>
      <span class="version">v1.1.0</span>
    </footer>
  `;

  initHourlyChart(container, ops.hourlyConversations);
  bindDashboardEvents(container);
}

function formatCompact(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Million`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
}

function formatCurrency(value) {
  const n = Number(value) || 0;
  return `R${formatNumber(n)}`;
}

function formatMetric(value, availability, { currency = false } = {}) {
  if (availability === 'unavailable' || availability === 'demo' || value == null) {
    return '—';
  }
  if (currency) return formatCurrency(value);
  if (typeof value === 'number' && value >= 10000) return formatCompact(value);
  return formatNumber(value);
}

function renderCentralMotorsPanel(tenantMetrics, availability, ops = {}) {
  if (ops.authRequired) {
    return `
      <div class="panel-card" style="margin-bottom:1rem">
        <div class="panel-header">
          <h3><i class="fa-solid fa-building"></i> Central Motors (central-motors-rtb)</h3>
          <span class="ops-tag">Sign in required</span>
        </div>
        <p class="welcome-text ops-subtitle">Sign in with your Super Admin account to load live CRM metrics for central-motors-rtb.</p>
      </div>`;
  }

  if (ops.authForbidden) {
    return `
      <div class="panel-card" style="margin-bottom:1rem">
        <div class="panel-header">
          <h3><i class="fa-solid fa-building"></i> Central Motors (central-motors-rtb)</h3>
          <span class="ops-tag">Authorization required</span>
        </div>
        <p class="welcome-text ops-subtitle">Your account is signed in but does not have Super Admin access to Mission Control CRM data.</p>
      </div>`;
  }

  if (ops.apiError) {
    return `
      <div class="panel-card" style="margin-bottom:1rem">
        <div class="panel-header">
          <h3><i class="fa-solid fa-building"></i> Central Motors (central-motors-rtb)</h3>
          <span class="ops-tag">Temporarily unavailable</span>
        </div>
        <p class="welcome-text ops-subtitle">Live CRM is temporarily unavailable. Refresh in a moment or check platform API health.</p>
      </div>`;
  }

  if (!tenantMetrics) {
    return `
      <div class="panel-card" style="margin-bottom:1rem">
        <div class="panel-header">
          <h3><i class="fa-solid fa-building"></i> Central Motors (central-motors-rtb)</h3>
          <span class="ops-tag">No CRM data yet</span>
        </div>
        <p class="welcome-text ops-subtitle">Sarah → CRM metrics will appear here once WhatsApp sales activity is recorded for the production tenant.</p>
      </div>`;
  }

  const c = tenantMetrics.counts || {};
  const s = tenantMetrics.sarah || {};
  const p = tenantMetrics.pipeline || {};

  return `
    <div class="panel-card" style="margin-bottom:1rem">
      <div class="panel-header">
        <h3><i class="fa-solid fa-building"></i> ${escapeHtml(tenantMetrics.companyName || 'Central Motors')}</h3>
        <span class="ops-tag">${escapeHtml(tenantMetrics.companyId)} · Sarah 🟢</span>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem">
        ${miniStat('Conversations', c.conversations, availability.conversations)}
        ${miniStat('New Leads', c.newLeads, availability.leads)}
        ${miniStat('Qualified', c.qualifiedLeads, availability.pipeline)}
        ${miniStat('Test Drives', c.testDrivesBooked, availability.testDrivesBooked)}
        ${miniStat('Finance', c.financeEnquiries, availability.financeEnquiries)}
        ${miniStat('Deals Won', c.dealsWon, availability.pipeline)}
      </div>
      <p class="welcome-text ops-subtitle" style="margin-top:0.75rem">
        Pipeline: new ${p.new || 0} · contacted ${p.contacted || 0} · qualified ${p.qualified || 0} · proposal ${p.proposal || 0} · won ${p.won || 0}
        ${s.conversionPct != null ? ` · Sarah conversion ${s.conversionPct}%` : ''}
      </p>
    </div>`;
}

function miniStat(label, value, availability) {
  const display = formatMetric(value, availability);
  return `<div class="kpi-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(display))}</div></div>`;
}

function kpiCard(label, value, icon, color, trend, currency = false) {
  return `
    <div class="kpi-card">
      <div class="header">
        <div>
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(String(value))}</div>
          ${trendHtml(trend)}
        </div>
        <div class="icon-wrapper ${color}"><i class="fa-solid ${icon}"></i></div>
      </div>
    </div>
  `;
}

function renderActivityFeed(items) {
  const rows = items || [];
  if (!rows.length) return '<div class="empty-panel">No activity yet.</div>';

  return rows
    .map(
      (item) => `
    <div class="activity-item">
      <div class="icon-wrapper ${escapeHtml(item.color || 'grey')}">
        <i class="fa-solid ${escapeHtml(item.icon || 'fa-circle')}"></i>
      </div>
      <div class="content">
        <div class="text">${item.text}</div>
        <div class="time">
          ${escapeHtml(item.time || item.ago || '—')}
          ${item.detail ? `<span class="badge">${escapeHtml(item.detail)}</span>` : ''}
        </div>
      </div>
    </div>`
    )
    .join('');
}

function renderTakeovers(items) {
  const rows = items || [];
  if (!rows.length) return '<div class="empty-panel">No human takeovers today.</div>';

  return rows
    .map(
      (t) => `
    <div class="takeover-item">
      <div class="takeover-main">
        <div class="takeover-customer">${escapeHtml(t.customer)}</div>
        <div class="takeover-meta">${escapeHtml(t.company)} · Agent: ${escapeHtml(t.agent)}</div>
        <div class="takeover-reason">${escapeHtml(t.reason)}</div>
      </div>
      <div class="takeover-time">${escapeHtml(t.time)}</div>
    </div>`
    )
    .join('');
}

function renderTrendingQuestions(items) {
  const rows = items || [];
  if (!rows.length) return '<div class="empty-panel">No trending questions yet.</div>';

  return rows
    .map(
      (q, i) => `
    <div class="trending-item">
      <span class="trending-rank">${i + 1}</span>
      <div class="trending-body">
        <div class="trending-q">${escapeHtml(q.question)}</div>
        <div class="trending-meta">${formatNumber(q.count)} asks · ${escapeHtml(q.company)}</div>
      </div>
    </div>`
    )
    .join('');
}

function renderAgentLeaderboard(agents) {
  const ranked = [...(agents || [])].slice(0, 5);
  if (!ranked.length) return '<div class="empty-panel">No agents configured yet.</div>';

  return ranked
    .map(
      (a) => `
    <div class="agent-rank-item">
      <span class="rank-num">${a.rank}</span>
      <div class="rank-info">
        <div class="rank-name">${escapeHtml(a.name)}</div>
        <div class="rank-meta">${escapeHtml(a.company)} · ${formatNumber(a.messages)} msgs</div>
      </div>
      <div class="rank-stats">
        <span class="rank-stat">${a.satisfaction != null ? `${a.satisfaction}%` : '—'}<small>CSAT</small></span>
        <span class="rank-stat">${a.conversion != null ? `${a.conversion}%` : '—'}<small>Conv</small></span>
      </div>
    </div>`
    )
    .join('');
}

function renderCompanyLeaderboard(companies) {
  const ranked = [...(companies || [])].slice(0, 5);
  if (!ranked.length) return '<div class="empty-panel">No companies yet.</div>';

  return ranked
    .map(
      (c) => `
    <div class="agent-rank-item company-rank-item">
      <span class="rank-num">${c.rank}</span>
      <div class="rank-info">
        <div class="rank-name">${escapeHtml(c.name)}</div>
        <div class="rank-meta">${formatNumber(c.messages)} msgs · ${c.satisfaction}% CSAT</div>
      </div>
      <div class="rank-pct">${formatCurrency(c.revenue)}<span>est. revenue</span></div>
    </div>`
    )
    .join('');
}

function renderSystemHealth(health) {
  const firebaseLabel = {
    connected: 'Connected',
    demo: 'Demo mode',
    offline: 'Offline',
  }[health.firebase] || health.firebase;

  const checks = [
    {
      label: 'WhatsApp API',
      ok: health.whatsapp,
      icon: 'fa-brands fa-whatsapp',
      status: health.whatsapp ? 'Operational' : 'Check config',
    },
    {
      label: 'OpenAI API',
      ok: health.openai,
      icon: 'fa-solid fa-brain',
      status: health.openai ? 'Operational' : 'Check config',
    },
    {
      label: 'Firebase',
      ok: health.firebase === 'connected' || health.firebase === 'demo',
      icon: 'fa-solid fa-fire',
      status: firebaseLabel,
    },
    {
      label: 'Message Queue',
      ok: true,
      icon: 'fa-solid fa-layer-group',
      status: `${health.queue?.pending ?? 0} pending · ${health.queue?.active ?? 0} active`,
    },
  ];

  return checks
    .map(
      (c) => `
    <div class="status-row ${c.ok ? 'ok' : 'warn'}">
      <div class="status-left">
        <i class="${c.icon}"></i>
        <span>${escapeHtml(c.label)}</span>
      </div>
      <div class="status-right">
        <i class="fa-solid ${c.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
        <span>${escapeHtml(c.status)}</span>
      </div>
    </div>`
    )
    .join('');
}

function initHourlyChart(container, hourlyData) {
  if (typeof Chart === 'undefined') return;

  hourlyChart?.destroy();

  const labels = Array.from({ length: 24 }, (_, i) => {
    const h = i.toString().padStart(2, '0');
    return `${h}:00`;
  });

  const ctx = container.querySelector('#hourlyConversationsChart');
  if (!ctx) return;

  const data = (hourlyData && hourlyData.some((v) => v != null)) ? hourlyData : Array.from({ length: 24 }, () => 0);
  const gridColor = 'rgba(148, 163, 184, 0.15)';
  const textColor = '#94a3b8';

  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Conversations',
          data,
          backgroundColor: data.map((v, i) => {
            const peak = Math.max(...data);
            const intensity = peak ? v / peak : 0;
            return `rgba(139, 92, 246, ${0.25 + intensity * 0.65})`;
          }),
          borderColor: '#8B5CF6',
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
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

const DEMO_HOURLY_FALLBACK = Array.from({ length: 24 }, () => 0);

function bindDashboardEvents(container) {
  container.querySelector('#refreshDashboard')?.addEventListener('click', () => renderDashboard(container));
  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector(`[data-page="${el.dataset.nav}"]`)?.click();
    });
  });
}
