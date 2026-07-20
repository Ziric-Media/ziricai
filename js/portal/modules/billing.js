import { state } from '../state.js';
import {
  escapeHtml,
  pageHeader,
  loadingState,
  planBadge,
  statusBadge,
  formatNumber,
  emptyState,
} from '../../admin/ui.js';
import { fetchPortalUsage } from '../api.js';
import { DEMO_INVOICES, DEMO_USAGE } from '../demo-data.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { getAllPlans, getPlan, formatPrice } from '../../shared/billingPlans.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can } from '../permissions.js';

let billingChart = null;
let storageChart = null;

export async function renderBilling(container) {
  if (!can(state.profile?.role, 'canViewBilling')) {
    container.innerHTML = emptyState('Billing is restricted to Owner and Finance roles.');
    return;
  }

  container.innerHTML = loadingState('Loading billing...');
  const companyId = state.companyId;

  const res = await fetchPortalUsage(companyId);
  const useDemo = shouldUseDemoFallback({ companyId, isDemo: state.hubData?.isDemo, isProvisioned: state.hubData?.isProvisioned });
  const usage = res.data?.usage || state.usage || (useDemo ? DEMO_USAGE : { plan: 'trial', planLabel: 'Trial', messagesUsed: 0, messagesLimit: 500, tokensUsed: 0, tokensLimit: 100000, storageUsedMb: 0, storageLimitMb: 512, renewalDate: '—', billingCycle: 'monthly', amount: 0, currency: 'ZAR' });
  const invoices = res.data?.invoices || (useDemo ? DEMO_INVOICES : []);

  if (res.error && !useDemo && !res.data?.usage) {
    container.innerHTML = `${pageHeader('Billing & Usage', 'Subscription and consumption.')}
      ${renderEmptyState({ message: res.error, actionHtml: '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>' })}`;
    return;
  }
  const chartSeries = res.data?.chartSeries || null;
  const plans = res.data?.plans || [];

  const msgPct = usage.messagesLimit ? Math.round((usage.messagesUsed / usage.messagesLimit) * 100) : 0;
  const tokenPct = usage.tokensLimit ? Math.round((usage.tokensUsed / usage.tokensLimit) * 100) : 0;
  const storagePct = usage.storageLimitMb ? Math.round((usage.storageUsedMb / usage.storageLimitMb) * 100) : 0;

  const monthTitle = chartSeries?.monthLabel
    ? `${chartSeries.monthLabel} ${chartSeries.year || new Date().getFullYear()}`
    : 'This Month';

  container.innerHTML = `
    ${pageHeader(
      'Billing & Usage',
      `Subscription and consumption for ${escapeHtml(state.company?.name || 'your company')}.`,
      `<button class="btn btn-secondary btn-sm" type="button" id="refreshBilling"><i class="fa-solid fa-rotate"></i> Refresh</button>`
    )}

    <div class="portal-billing-hero">
      <div class="portal-billing-hero-left">
        ${planBadge(usage.plan)}
        <h2>${escapeHtml(usage.planLabel || 'Business')} Plan</h2>
        <p>${formatPrice(usage.amount ?? getPlan(usage.plan || 'trial').price)}/${usage.billingCycle === 'annual' ? 'year' : 'month'} · Renews ${escapeHtml(usage.renewalDate || '—')}</p>
      </div>
      <div class="portal-billing-hero-stats">
        <div class="portal-billing-stat">
          <div class="value">${msgPct}%</div>
          <div class="label">Messages used</div>
        </div>
        <div class="portal-billing-stat">
          <div class="value">${tokenPct}%</div>
          <div class="label">Tokens used</div>
        </div>
        <div class="portal-billing-stat">
          <div class="value">${storagePct}%</div>
          <div class="label">Storage used</div>
        </div>
      </div>
      <div class="billing-plan-actions">
        <button class="btn btn-secondary btn-sm" type="button" disabled>Change Plan (demo)</button>
        <button class="btn btn-primary btn-sm" type="button" disabled><i class="fa-solid fa-arrow-up"></i> Upgrade (demo)</button>
      </div>
    </div>

    <div class="portal-billing-extended-meters portal-billing-meters" style="margin-bottom:24px;">
      ${meterCard('AI Employees', usage.aiEmployeesUsed ?? 1, usage.aiEmployeesLimit ?? 1, pct(usage.aiEmployeesUsed, usage.aiEmployeesLimit), 'fa-robot', 'purple')}
      ${meterCard('Conversations', usage.conversationsUsed ?? 0, usage.conversationsLimit ?? 100, pct(usage.conversationsUsed, usage.conversationsLimit), 'fa-comments', 'brand')}
      ${meterCard('Workflow Runs', usage.workflowRunsUsed ?? 0, usage.workflowRunsLimit ?? 50, pct(usage.workflowRunsUsed, usage.workflowRunsLimit), 'fa-diagram-project', 'green')}
      ${meterCard('API Calls', usage.apiCallsUsed ?? 0, usage.apiCallsLimit ?? 1000, pct(usage.apiCallsUsed, usage.apiCallsLimit), 'fa-plug', 'purple')}
      ${meterCard('Knowledge Size', usage.knowledgeSizeMbUsed ?? 0, usage.knowledgeSizeMbLimit ?? 50, pct(usage.knowledgeSizeMbUsed, usage.knowledgeSizeMbLimit), 'fa-book', 'green', 'MB')}
    </div>

    <div class="portal-billing-grid">
      <div class="chart-card chart-card-line portal-chart-card">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-chart-column"></i> Plan Usage — ${escapeHtml(monthTitle)}</h3>
          <div class="chart-legend">
            <span class="legend-item"><span class="dot purple"></span> Messages</span>
            <span class="legend-item"><span class="dot orange"></span> Tokens (÷100)</span>
          </div>
        </div>
        <p class="portal-chart-subtitle">Daily breakdown · tenant-scoped demo data</p>
        <div class="chart-canvas-wrap portal-chart-wrap"><canvas id="portalBillingChart"></canvas></div>
      </div>

      <div class="portal-billing-meters">
        ${meterCard('Messages', usage.messagesUsed, usage.messagesLimit, msgPct, 'fa-envelope', 'brand')}
        ${meterCard('AI Tokens', usage.tokensUsed, usage.tokensLimit, tokenPct, 'fa-brain', 'purple')}
        ${meterCard('Storage', usage.storageUsedMb, usage.storageLimitMb, storagePct, 'fa-hard-drive', 'green', 'MB')}
        <div class="chart-card portal-analytics-chart">
          <div class="chart-card-header">
            <h3><i class="fa-solid fa-chart-pie"></i> Quota Overview</h3>
          </div>
          <div class="chart-canvas-wrap" style="height:160px;"><canvas id="portalStorageChart"></canvas></div>
        </div>
      </div>
    </div>

    <div class="portal-invoice-panel">
      <div class="panel-header">
        <h3><i class="fa-solid fa-file-invoice"></i> Invoice History</h3>
        <span class="ops-tag">${invoices.length} invoice${invoices.length === 1 ? '' : 's'}</span>
      </div>
      ${invoices.length
        ? invoices.map((inv) => invoiceRow(inv)).join('')
        : '<div class="empty-panel" style="padding:24px;">No invoices yet.</div>'}
    </div>

    <div class="card" style="margin-top:24px;">
      <div class="card-header"><h3><i class="fa-solid fa-layer-group"></i> Plan Comparison</h3></div>
      <div class="card-body plan-comparison">
        ${renderPlanCards(plans, usage.plan)}
      </div>
    </div>
  `;

  initBillingCharts(container, chartSeries, { msgPct, tokenPct, storagePct });
  container.querySelector('#refreshBilling')?.addEventListener('click', () => renderBilling(container));
}

function pct(used, limit) {
  if (!limit) return 0;
  return Math.round(((used || 0) / limit) * 100);
}

function renderPlanCards(plans, currentPlan) {
  const list = plans.length ? plans : getAllPlans();
  return list
    .filter((p) => p.id !== 'trial')
    .map((p) => planCard(
    p.label || p.id,
    p.price ?? 0,
    (p.features || []).join(' · ') || p.tagline || '',
    currentPlan === p.id,
    p.id === 'trial'
  )).join('');
}

function meterCard(label, used, limit, pct, icon, colorClass, unit = '') {
  const fillClass = colorClass === 'brand' ? 'progress-fill-brand' : colorClass === 'purple' ? 'progress-fill-purple' : 'progress-fill-green';
  return `
    <div class="portal-billing-meter-card">
      <div class="meter-header">
        <span><i class="fa-solid ${icon}"></i> ${escapeHtml(label)}</span>
        <span>${pct}%</span>
      </div>
      <div class="meter-value">${formatNumber(used)} <small>/ ${formatNumber(limit)}${unit ? ` ${unit}` : ''}</small></div>
      <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${Math.min(pct, 100)}%"></div></div>
    </div>
  `;
}

function invoiceRow(inv) {
  return `
    <div class="portal-invoice-row">
      <div class="portal-invoice-icon"><i class="fa-solid fa-receipt"></i></div>
      <div class="portal-invoice-details">
        <div class="inv-id">${escapeHtml(inv.id)}</div>
        <div class="inv-date">${escapeHtml(inv.date)} · ${escapeHtml(inv.plan)}</div>
      </div>
      <div class="portal-invoice-amount">R${formatNumber(inv.amount)}</div>
      ${statusBadge(inv.status)}
      <button class="btn btn-secondary btn-sm" type="button" disabled><i class="fa-solid fa-download"></i></button>
    </div>
  `;
}

function planCard(name, price, features, current, isTrial = false) {
  const priceLabel = price == null ? 'Custom' : price === 0 ? 'Free' : formatPrice(price);
  return `
    <div class="plan-card ${current ? 'current' : ''} ${isTrial ? 'trial' : ''}">
      <h4>${escapeHtml(name)}</h4>
      <div class="plan-price">${priceLabel}${price != null && price ? '<span>/mo</span>' : ''}</div>
      <p class="plan-features">${escapeHtml(features)}</p>
      ${current ? '<span class="current-badge">Current</span>' : '<button class="btn btn-secondary btn-sm" type="button" disabled style="margin-top:12px;">Upgrade (demo)</button>'}
    </div>
  `;
}

function getBrandColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#1e40af';
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(30, 64, 175, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function brandBarColors(values, brandHex) {
  const peak = Math.max(...values, 1);
  return values.map((v) => hexToRgba(brandHex, 0.25 + (v / peak) * 0.65));
}

function initBillingCharts(container, chartSeries, quotas) {
  if (typeof Chart === 'undefined') return;

  billingChart?.destroy();
  storageChart?.destroy();

  const brandColor = getBrandColor();
  const gridColor = 'rgba(148, 163, 184, 0.15)';
  const textColor = '#94a3b8';

  const usageCtx = container.querySelector('#portalBillingChart');
  if (usageCtx && chartSeries?.labels?.length) {
    const messages = chartSeries.messages || [];
    const tokens = (chartSeries.tokens || []).map((v) => Math.round(v / 100));

    billingChart = new Chart(usageCtx, {
      type: 'bar',
      data: {
        labels: chartSeries.labels,
        datasets: [
          {
            label: 'Messages',
            data: messages,
            backgroundColor: brandBarColors(messages, brandColor),
            borderColor: brandColor,
            borderWidth: 1,
            borderRadius: 4,
            order: 2,
          },
          {
            label: 'Tokens (÷100)',
            data: tokens,
            type: 'line',
            borderColor: '#F97316',
            backgroundColor: 'rgba(249, 115, 22, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: true,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                if (context.datasetIndex === 1) {
                  const raw = chartSeries.tokens?.[context.dataIndex] ?? context.parsed.y * 100;
                  return `Tokens: ${formatNumber(raw)}`;
                }
                return `Messages: ${formatNumber(context.parsed.y)}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 15 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#F97316' }, beginAtZero: true },
        },
      },
    });
  }

  const storageCtx = container.querySelector('#portalStorageChart');
  if (storageCtx) {
    storageChart = new Chart(storageCtx, {
      type: 'doughnut',
      data: {
        labels: ['Messages', 'Tokens', 'Storage'],
        datasets: [{
          data: [quotas.msgPct, quotas.tokenPct, quotas.storagePct],
          backgroundColor: [brandColor, '#8B5CF6', '#10B981'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        },
      },
    });
  }
}
