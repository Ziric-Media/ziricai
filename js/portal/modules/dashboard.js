import { state, setState } from '../core/dataStore.js';
import { escapeHtml, formatNumber, errorState } from '../../admin/ui.js';
import { getHubData, invalidateHub } from '../core/dataService.js';
import { navigateTo } from '../router.js';
import { renderKpiCard } from '../core/widgets/kpiCard.js';
import { renderLiveStatCard } from '../core/widgets/liveStatCard.js';
import { renderConversationPreview } from '../core/widgets/conversationPreview.js';
import { renderActivityPanel } from '../core/widgets/activityFeed.js';
import { renderQuickActions, DEFAULT_OVERVIEW_ACTIONS } from '../core/widgets/quickActions.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { openPortalSarah } from '../sarah/sarah-ui.js';

let usageChart = null;

function emptyMetrics() {
  return {
    conversationsToday: 0,
    appointmentsBooked: 0,
    leadsCaptured: 0,
    revenueGenerated: 0,
    aiAccuracy: 0,
    responseTimeSec: 0,
    customerSatisfaction: 0,
    missedChats: 0,
    activeConversations: 0,
    customersTotal: 0,
    knowledgeItems: 0,
    trends: {},
  };
}

function formatMetric(value, fallback = '0') {
  if (value == null || value === '') return fallback;
  return value;
}

function formatPercent(value) {
  const n = Number(value);
  if (!n) return '—';
  return `${n}%`;
}

function formatSeconds(value) {
  const n = Number(value);
  if (!n) return '—';
  return `${n}s`;
}

function hasTrend(trends, key) {
  const v = trends?.[key];
  return v != null && v !== 0 && !Number.isNaN(Number(v));
}

export async function renderDashboard(container) {
  container.innerHTML = renderLoadingSkeleton({ label: 'Loading overview…', cards: 8, rows: 2 });

  const companyId = state.companyId;
  const companyName = state.company?.name || 'Your Company';
  const userName = state.profile?.fullName || state.profile?.name || state.user?.email?.split('@')[0] || 'there';

  const hubRes = await getHubData(companyId, { force: false });
  if (hubRes.error) {
    container.innerHTML = errorState(hubRes.error);
    return;
  }

  const hub = hubRes.data || state.hubData || {};
  const metrics = hub.metrics || emptyMetrics();
  const trends = metrics.trends || {};
  const recentConversations = hub.recentConversations || [];
  const recentActivity = hub.recentActivity || [];
  const usage = hub.usage || state.usage || {};
  const liveAt = hub.generatedAt ? new Date(hub.generatedAt).toLocaleTimeString() : 'just now';
  const isEmptyTenant = !hub.isDemo && hub.isProvisioned !== false && metrics.conversationsToday === 0 && !recentConversations.length;

  container.innerHTML = `
    <div class="dashboard-header portal-header bos-overview-header">
      <div class="dashboard-header-left">
        <h1>Business Overview</h1>
        <p class="welcome-text">
          Welcome back, <strong>${escapeHtml(userName)}</strong>
          <span class="demo-badge"><i class="fa-solid fa-building"></i> ${escapeHtml(companyName)}</span>
          <span class="bos-live-tag"><span class="pulse"></span> Updated ${escapeHtml(liveAt)}</span>
        </p>
      </div>
      <div class="dashboard-header-actions">
        <button class="btn btn-secondary btn-sm" type="button" id="refreshPortalDashboard">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
        <button class="btn btn-primary btn-sm" type="button" id="openSarahFromOverview">
          <i class="fa-solid fa-sparkles"></i> Ask Sarah
        </button>
      </div>
    </div>

    ${renderQuickActions(DEFAULT_OVERVIEW_ACTIONS)}

    <div class="kpi-grid kpi-grid-ops bos-live-grid">
      ${renderLiveStatCard({ label: "Today's Conversations", value: formatNumber(metrics.conversationsToday ?? 0), icon: 'fa-comments', color: 'purple', trend: hasTrend(trends, 'conversations') ? trends.conversations : null, dataNav: 'conversations', live: metrics.conversationsToday > 0 })}
      ${renderLiveStatCard({ label: 'Appointments Booked', value: formatNumber(metrics.appointmentsBooked ?? 0), icon: 'fa-calendar-check', color: 'blue', trend: hasTrend(trends, 'appointments') ? trends.appointments : null, dataNav: 'appointments', live: metrics.appointmentsBooked > 0 })}
      ${renderLiveStatCard({ label: 'Leads Captured', value: formatNumber(metrics.leadsCaptured ?? 0), icon: 'fa-user-plus', color: 'green', trend: hasTrend(trends, 'leads') ? trends.leads : null, dataNav: 'customers', live: metrics.leadsCaptured > 0 })}
      ${renderLiveStatCard({ label: 'Revenue Generated', value: formatCurrency(metrics.revenueGenerated), icon: 'fa-coins', color: 'yellow', trend: hasTrend(trends, 'revenue') ? trends.revenue : null, dataNav: 'analytics', live: (metrics.revenueGenerated ?? 0) > 0 })}
      ${renderLiveStatCard({ label: 'AI Accuracy', value: formatPercent(metrics.aiAccuracy ?? metrics.aiHandledPct), icon: 'fa-robot', color: 'purple', trend: hasTrend(trends, 'aiResolutionRate') ? trends.aiResolutionRate : null, dataNav: 'agents', live: (metrics.aiAccuracy ?? metrics.aiHandledPct) > 0 })}
      ${renderLiveStatCard({ label: 'Response Time', value: formatSeconds(metrics.responseTimeSec ?? metrics.avgResponseSec), icon: 'fa-bolt', color: 'orange', trend: hasTrend(trends, 'responseTime') ? trends.responseTime : null, live: (metrics.responseTimeSec ?? metrics.avgResponseSec) > 0 })}
      ${renderLiveStatCard({ label: 'Customer Satisfaction', value: formatPercent(metrics.customerSatisfaction ?? metrics.satisfaction), icon: 'fa-face-smile', color: 'green', trend: hasTrend(trends, 'satisfaction') ? trends.satisfaction : null, dataNav: 'analytics', live: (metrics.customerSatisfaction ?? metrics.satisfaction) > 0 })}
      ${renderLiveStatCard({ label: 'Missed Chats', value: formatNumber(metrics.missedChats ?? 0), icon: 'fa-message-slash', color: 'red', trend: null, dataNav: 'conversations', live: metrics.missedChats > 0 })}
    </div>

    <div class="bos-overview-grid">
      <div class="panel-card bos-panel">
        <div class="panel-header">
          <h3><i class="fa-solid fa-inbox"></i> Recent Conversations</h3>
          <a href="#" class="panel-link" data-nav="conversations">Open inbox</a>
        </div>
        ${recentConversations.length
          ? renderConversationPreview(recentConversations, { limit: 5, emptyMessage: 'No conversations yet — connect WhatsApp to start.' })
          : renderEmptyState({
              message: isEmptyTenant
                ? 'No conversations yet — connect WhatsApp or install a marketplace pack to get started.'
                : 'No conversations yet — connect WhatsApp to start.',
              actionHtml: '<button type="button" class="btn btn-secondary btn-sm" data-nav="integrations">Connect channels</button>',
            })}
      </div>

      <div class="panel-card bos-panel">
        <div class="panel-header">
          <h3><i class="fa-solid fa-chart-pie"></i> Usage Snapshot</h3>
          <span class="ops-tag">${escapeHtml(usage.planLabel || usage.plan || 'Business')}</span>
        </div>
        <div class="bos-usage-snapshot">
          ${renderKpiCard({ label: 'Messages', value: `${formatNumber(usage.messagesUsed || 0)} / ${formatNumber(usage.messagesLimit || '∞')}`, icon: 'fa-envelope', color: 'brand' })}
          ${renderKpiCard({ label: 'Active Chats', value: formatNumber(metrics.activeConversations ?? 0), icon: 'fa-satellite-dish', color: 'green', dataNav: 'conversations' })}
          ${renderKpiCard({ label: 'CRM Contacts', value: formatNumber(metrics.customersTotal ?? 0), icon: 'fa-users', color: 'blue', dataNav: 'customers' })}
          ${renderKpiCard({ label: 'Knowledge Items', value: formatNumber(metrics.knowledgeItems ?? 0), icon: 'fa-book', color: 'yellow', dataNav: 'knowledge' })}
        </div>
        <div class="portal-usage-meters bos-compact-meters">
          ${usageMeter('Messages', usage.messagesUsed, usage.messagesLimit, 'fa-envelope', 'brand')}
          ${usageMeter('Tokens', usage.tokensUsed, usage.tokensLimit, 'fa-brain', 'purple')}
        </div>
      </div>
    </div>

    ${recentActivity.length
      ? renderActivityPanel(recentActivity, { title: 'Activity Feed', viewAllNav: 'activity' })
      : renderEmptyState({ message: 'No recent activity yet.', actionHtml: '<button type="button" class="btn btn-secondary btn-sm" data-nav="marketplace">Browse marketplace</button>' })}
  `;

  bindDashboardEvents(container);
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  if (!n) return 'R0';
  if (n >= 1000) return `R${Math.round(n / 1000)}k`;
  return `R${formatNumber(n)}`;
}

function usageMeter(label, used, limit, icon, color) {
  const u = used ?? 0;
  const l = limit ?? 0;
  const pct = l ? Math.min(Math.round((u / l) * 100), 100) : 0;
  const fillClass = color === 'purple' ? 'progress-fill-purple' : 'progress-fill-brand';
  return `
    <div class="portal-usage-meter">
      <div class="usage-meter-label"><span><i class="fa-solid ${icon}"></i> ${escapeHtml(label)}</span><span>${l ? `${pct}%` : '—'}</span></div>
      <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${l ? pct : 0}%"></div></div>
      <div class="portal-meter-meta">${formatNumber(u)} / ${l ? formatNumber(l) : 'Unlimited'}</div>
    </div>`;
}

function bindDashboardEvents(container) {
  container.querySelector('#refreshPortalDashboard')?.addEventListener('click', async () => {
    invalidateHub();
    await renderDashboard(container);
  });

  container.querySelector('#openSarahFromOverview')?.addEventListener('click', () => openPortalSarah());

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateTo(el.dataset.nav);
      }
    });
  });

  container.querySelectorAll('.bos-conversation-item[data-conv-id]').forEach((el) => {
    el.addEventListener('click', () => {
      navigateTo('conversations');
    });
  });
}

export function destroyDashboardChart() {
  if (usageChart) {
    usageChart.destroy?.();
    usageChart = null;
  }
}
