import { state, setState } from '../state.js';
import {
  escapeHtml,
  formatNumber,
  loadingState,
  trendHtml,
} from '../ui.js';
import {
  getPlatformDashboardView,
  healthFromPlatformSnapshot,
} from '../services/operationsService.js';
import { fetchPlatformExecutiveOverview } from '../services/platformConsole.js';

let hourlyChart = null;

export async function renderDashboard(container) {
  container.innerHTML = loadingState('Loading Mission Control...');

  const scopedId = state.selectedCompanyId || null;

  let view;
  try {
    view = await getPlatformDashboardView(scopedId);
  } catch (err) {
    console.error('Mission Control load error:', err);
    container.innerHTML = loadingState('Failed to load Mission Control. Retrying...');
    return;
  }

  const health =
    view.mode === 'platform'
      ? healthFromPlatformSnapshot(view.platformHealth) || {
          whatsapp: false,
          openai: false,
          firebase: 'offline',
          queue: { pending: 0, active: 0 },
          timestamp: new Date().toISOString(),
        }
      : null;

  setState({ operationsData: view, backendHealth: health });

  const userName =
    state.profile?.fullName ||
    state.profile?.name ||
    state.user?.email?.split('@')[0] ||
    'Super Admin';

  if (view.mode === 'platform') {
    await renderPlatformDashboard(container, view, userName, health);
  } else {
    renderTenantDashboard(container, view, userName);
  }
}

function scopeBadge(view) {
  if (view.authRequired) {
    return '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-lock"></i> Sign in required</span>';
  }
  if (view.authForbidden) {
    return '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-user-shield"></i> Super Admin authorization required</span>';
  }
  if (view.apiError) {
    return '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-triangle-exclamation"></i> Data temporarily unavailable</span>';
  }
  if (view.mode === 'platform') {
    return '<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-globe"></i> All tenants · tenant records (not production customers)</span>';
  }
  const name = escapeHtml(view.company?.name || view.companyId || 'Tenant');
  const cls = classificationBadgeClass(view.company?.classification);
  const classBadge = view.company?.classification
    ? `<span class="tenant-class-badge ${cls}">${escapeHtml(view.company.classification)}</span>`
    : '';
  const demo = view.isDemo
    ? ' <span class="demo-badge"><i class="fa-solid fa-flask"></i> Demo content</span>'
    : '';
  return `<span class="demo-badge" style="opacity:0.85"><i class="fa-solid fa-database"></i> Portal hub · ${name}</span> ${classBadge}${demo}`;
}

function dashboardHeader(userName, view) {
  return `
    <div class="dashboard-header ops-header">
      <div class="dashboard-header-left">
        <h1>Mission Control</h1>
        <p class="welcome-text ops-subtitle">AI Operations Center — Welcome back, <strong>${escapeHtml(userName)}</strong> ${scopeBadge(view)}</p>
      </div>
      <div class="dashboard-header-actions">
        <button class="btn btn-secondary btn-sm" type="button" id="refreshDashboard">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>`;
}

function classificationBadgeClass(classification) {
  const map = {
    'PRODUCTION CUSTOMER': 'production',
    PILOT: 'pilot',
    ACCEPTANCE: 'acceptance',
    'DEMO/SHOWCASE': 'demo',
    TEST: 'test',
    UNKNOWN: 'unknown',
  };
  return map[classification] || 'unknown';
}

function renderPlatformCensus(census) {
  if (!census?.byClass) return '';
  const b = census.byClass;
  const cells = [
    { label: 'Production', value: b.productionCustomer ?? 0 },
    { label: 'Pilot', value: b.pilot ?? 0 },
    { label: 'Acceptance', value: b.acceptance ?? 0 },
    { label: 'Demo', value: b.demoShowcase ?? 0 },
    { label: 'Test', value: b.test ?? 0 },
    { label: 'Unknown', value: b.unknown ?? 0 },
  ];
  return `
    <div class="tenant-summary-grid" aria-label="Tenant classification summary">
      <div class="tenant-summary-total">
        <span class="tenant-summary-total-value">${formatNumber(census.total ?? 0)}</span>
        <span class="tenant-summary-total-label">Tenant records</span>
      </div>
      ${cells
        .map(
          (c) => `
        <div class="tenant-summary-cell">
          <span class="tenant-summary-value">${formatNumber(c.value)}</span>
          <span class="tenant-summary-label">${escapeHtml(c.label)}</span>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function viewPartialNote() {
  return '<p class="welcome-text ops-subtitle">Cross-tenant operational KPI rollups are partial in this release — use tenant scope or pilot spotlight for hub-aligned metrics.</p>';
}

function renderPilotSpotlight(spotlight) {
  if (!spotlight?.companyId) return '';
  const kpis = spotlight.kpis || {};
  const ops = kpis.ops || {};
  const cls = classificationBadgeClass(spotlight.classification);
  const badge = spotlight.classification
    ? `<span class="tenant-class-badge ${cls}">${escapeHtml(spotlight.classification)}</span>`
    : '';
  return `
    <div class="panel-card" style="margin-bottom:1rem">
      <div class="panel-header">
        <h3><i class="fa-solid fa-star"></i> Pilot spotlight — ${escapeHtml(spotlight.name || spotlight.companyId)}</h3>
        <span class="ops-tag">${escapeHtml(spotlight.companyId)} ${badge}</span>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem">
        ${miniStat('Inbox total', ops.inbox?.total, availabilityForValue(ops.inbox?.total))}
        ${miniStat('Unread', ops.inbox?.unread, availabilityForValue(ops.inbox?.unread))}
        ${miniStat('CRM customers', ops.crm?.customers, availabilityForValue(ops.crm?.customers))}
        ${miniStat('Leads', ops.crm?.leads, availabilityForValue(ops.crm?.leads))}
        ${miniStat('Appts today', ops.appointments?.today, availabilityForValue(ops.appointments?.today))}
      </div>
      <p class="welcome-text ops-subtitle" style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary btn-sm" id="openPilotTenant" data-company-id="${escapeHtml(spotlight.companyId)}">
          <i class="fa-solid fa-crosshairs"></i> Open pilot tenant
        </button>
        <span style="margin-left:8px">Or pick the same row in the scope dropdown · <a href="#" data-nav="companies">Tenants</a></span>
      </p>
    </div>`;
}

function availabilityForValue(value) {
  if (value == null || Number.isNaN(Number(value))) return 'unavailable';
  return 'real';
}

async function renderPlatformDashboard(container, view, userName, health) {
  const partial = view.meta?.partial ? viewPartialNote() : '';
  const execRes = await fetchPlatformExecutiveOverview();
  const exec = execRes.data || {};
  const tenants = exec.tenants || {};
  const billing = exec.billing || {};
  const wa = exec.integrations?.whatsapp || {};

  container.innerHTML = `
    ${dashboardHeader(userName, view)}
    ${renderPlatformCensus(view.census)}
    ${partial}
    <div class="kpi-grid kpi-grid-ops">
      ${kpiCard('Total tenants', formatNumber(tenants.total ?? view.census?.total ?? 0), 'fa-building', 'blue', null)}
      ${kpiCard('Active tenants', formatNumber(tenants.activeOperational ?? 0), 'fa-circle-check', 'green', null)}
      ${kpiCard('Trial tenants', formatNumber(tenants.trial ?? 0), 'fa-hourglass-half', 'yellow', null)}
      ${kpiCard('Paying tenants', formatNumber(tenants.paying ?? 0), 'fa-coins', 'purple', null)}
      ${kpiCard('WhatsApp connected', formatNumber(wa.connected ?? 0), 'fa-brands fa-whatsapp', 'green', null)}
      ${kpiCard('MRR (sampled)', billing.mrr != null ? `R${formatNumber(billing.mrr)}` : '—', 'fa-money-bill', 'green', null)}
      ${kpiCard('New this month', formatNumber(tenants.newThisMonth ?? 0), 'fa-chart-line', 'blue', null)}
      ${kpiCard('Past due', formatNumber(tenants.pastDue ?? 0), 'fa-triangle-exclamation', 'red', null)}
    </div>
    <p class="panel-hint">${escapeHtml(billing.partialNote || exec.usage?.note || 'Usage and message rollups show — until platform rollup jobs are connected.')}</p>
    ${renderPilotSpotlight(view.pilotSpotlight)}
    <div class="ops-grid ops-row-1">
      <div class="activity-section ops-activity">
        <div class="header">
          <h3><i class="fa-solid fa-satellite-dish"></i> Platform activity</h3>
          <span class="live-indicator"><span class="pulse"></span> Live</span>
        </div>
        <div class="activity-feed ops-activity-scroll">
          ${renderActivityFeed(view.activity?.items)}
        </div>
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
      <span class="version">v1.1.0 · platform view</span>
    </footer>
  `;
  bindDashboardEvents(container);
}

function renderTenantDashboard(container, view, userName) {
  const { metrics, trends, metricAvailability = {}, tenantHub } = view;
  const ops = tenantHub?.ops || {};

  container.innerHTML = `
    ${dashboardHeader(userName, view)}
    ${renderTenantHubPanel(view, ops, metricAvailability)}

    <div class="kpi-grid kpi-grid-ops">
      ${kpiCard('Active Conversations', formatMetric(metrics.activeConversations, metricAvailability.activeConversations), 'fa-comments', 'purple', trends.activeConversations)}
      ${kpiCard('CRM Leads', formatMetric(metrics.crmLeads, metricAvailability.leads), 'fa-user-plus', 'blue', null)}
      ${kpiCard('Qualified Leads', formatMetric(metrics.crmQualifiedLeads, metricAvailability.pipeline), 'fa-filter', 'purple', null)}
      ${kpiCard('Test Drives Booked', formatMetric(metrics.crmTestDrivesBooked, metricAvailability.testDrivesBooked), 'fa-car', 'green', null)}
      ${kpiCard('Finance Enquiries', formatMetric(metrics.crmFinanceEnquiries, metricAvailability.financeEnquiries), 'fa-coins', 'yellow', null)}
      ${kpiCard('Deals Won', formatMetric(metrics.crmDealsWon, metricAvailability.pipeline), 'fa-trophy', 'green', null)}
      ${kpiCard('Messages (total)', formatMetric(metrics.messagesTotal, metricAvailability.messagesTotal), 'fa-fire', 'orange', null)}
      ${kpiCard('Human Takeovers', formatMetric(metrics.humanTakeovers, metricAvailability.humanTakeovers), 'fa-user-shield', 'red', trends.humanTakeovers)}
      ${kpiCard('AI Employees Online', formatMetric(metrics.aiEmployeesOnline, metricAvailability.aiEmployeesOnline), 'fa-robot', 'green', trends.aiEmployeesOnline)}
      ${kpiCard('Est. Revenue', formatMetric(metrics.estimatedRevenue, metricAvailability.estimatedRevenue), 'fa-money-bill', 'green', trends.estimatedRevenue)}
    </div>

    <div class="ops-grid ops-row-1">
      <div class="activity-section ops-activity">
        <div class="header">
          <h3><i class="fa-solid fa-satellite-dish"></i> Tenant activity</h3>
          <span class="live-indicator"><span class="pulse"></span> Live</span>
        </div>
        <div class="activity-feed ops-activity-scroll">
          ${renderActivityFeed(view.activity?.items)}
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-header">
          <h3><i class="fa-solid fa-inbox"></i> Inbox snapshot</h3>
          <a href="#" class="panel-link" data-nav="conversations">View inbox</a>
        </div>
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:0.75rem;padding:0.5rem">
          ${miniStat('Total threads', ops.inbox?.total, availabilityForValue(ops.inbox?.total))}
          ${miniStat('Unread', ops.inbox?.unread, availabilityForValue(ops.inbox?.unread))}
        </div>
      </div>
    </div>

    <footer class="dashboard-footer">
      <span>&copy; 2026 ZiricAI Mission Control</span>
      <span class="version">v1.1.0 · tenant hub</span>
    </footer>
  `;
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

function renderTenantHubPanel(view, ops = {}, availability = {}) {
  const companyId = view.companyId || view.company?.id || '—';
  const companyName = view.company?.name || companyId;
  const cls = classificationBadgeClass(view.company?.classification);
  const classBadge = view.company?.classification
    ? `<span class="tenant-class-badge ${cls}">${escapeHtml(view.company.classification)}</span>`
    : '';

  if (view.authRequired || view.authForbidden || view.apiError) {
    const msg = view.authRequired
      ? 'Sign in with your Super Admin account to load tenant hub metrics.'
      : view.authForbidden
        ? 'Your account does not have Super Admin access to this tenant hub.'
        : 'Tenant hub data is temporarily unavailable.';
    return `
      <div class="panel-card" style="margin-bottom:1rem">
        <div class="panel-header">
          <h3><i class="fa-solid fa-building"></i> ${escapeHtml(companyName)}</h3>
          <span class="ops-tag">${escapeHtml(companyId)}</span>
        </div>
        <p class="welcome-text ops-subtitle">${msg}</p>
      </div>`;
  }

  return `
    <div class="panel-card" style="margin-bottom:1rem">
      <div class="panel-header">
        <h3><i class="fa-solid fa-building"></i> ${escapeHtml(companyName)}</h3>
        <span class="ops-tag">${escapeHtml(companyId)} ${classBadge}</span>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem">
        ${miniStat('Customers', ops.crm?.customers, availabilityForValue(ops.crm?.customers))}
        ${miniStat('Leads', ops.crm?.leads, availability.leads || availabilityForValue(ops.crm?.leads))}
        ${miniStat('Inbox total', ops.inbox?.total, availabilityForValue(ops.inbox?.total))}
        ${miniStat('Unread', ops.inbox?.unread, availability.activeConversations || availabilityForValue(ops.inbox?.unread))}
        ${miniStat('Appts today', ops.appointments?.today, availability.testDrivesBooked || availabilityForValue(ops.appointments?.today))}
        ${miniStat('Upcoming appts', ops.appointments?.upcoming, availabilityForValue(ops.appointments?.upcoming))}
      </div>
      <p class="welcome-text ops-subtitle" style="margin-top:0.75rem">
        KPIs sourced from Portal hub read model (<code>portal_hub</code>). Switch to <strong>All Tenants</strong> for platform census and health.
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

function applyTenantScopeFromDashboard(companyId) {
  const select = document.getElementById('companySelector');
  if (!select) return;
  select.value = companyId || '';
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function bindDashboardEvents(container) {
  container.querySelector('#refreshDashboard')?.addEventListener('click', () => renderDashboard(container));
  container.querySelector('#openPilotTenant')?.addEventListener('click', (e) => {
    const id = e.currentTarget?.dataset?.companyId;
    if (id) applyTenantScopeFromDashboard(id);
  });
  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector(`[data-page="${el.dataset.nav}"]`)?.click();
    });
  });
}
