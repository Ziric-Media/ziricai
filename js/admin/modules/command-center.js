import { state } from '../state.js';
import {
  escapeHtml,
  formatNumber,
  loadingState,
  trendHtml,
} from '../ui.js';

const API = '/api/operations/command-center';

export async function renderCommandCenter(container) {
  container.innerHTML = loadingState('Loading AI Command Center...');

  let data;
  try {
    const res = await fetch(API);
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch (err) {
    container.innerHTML = loadingState(`Failed to load: ${err.message}`);
    return;
  }

  const { workforce, business, health, mapDots, activity, isDemo } = data;
  const demoNote = isDemo
    ? '<span class="demo-badge"><i class="fa-solid fa-flask"></i> Demo data</span>'
    : '';

  container.innerHTML = `
    <div class="dashboard-header ops-header command-center-header">
      <div class="dashboard-header-left">
        <h1><i class="fa-solid fa-globe"></i> AI Command Center</h1>
        <p class="welcome-text ops-subtitle">Strategic platform overview ${demoNote}</p>
      </div>
      <div class="dashboard-header-actions">
        <button class="btn btn-secondary btn-sm" type="button" id="refreshCommandCenter">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    <div class="command-status-row">
      ${statusPill(health.whatsapp)}
      ${statusPill(health.openai)}
      ${statusPill(health.platform)}
    </div>

    <div class="kpi-grid kpi-grid-ops">
      ${kpiCard('AI Workforce', formatNumber(workforce.totalEmployees), 'fa-robot', 'green')}
      ${kpiCard('Active Conversations', formatNumber(workforce.activeConversations), 'fa-comments', 'purple')}
      ${kpiCard('Human Takeovers', formatNumber(workforce.humanTakeovers), 'fa-user-shield', 'red')}
      ${kpiCard('AI Accuracy', `${workforce.accuracyPct}%`, 'fa-bullseye', 'blue')}
      ${kpiCard("Today's Revenue", formatCurrency(business.revenueToday), 'fa-money-bill', 'green')}
      ${kpiCard("Today's Leads", formatNumber(business.leadsToday), 'fa-user-plus', 'purple')}
      ${kpiCard('Customers Waiting', formatNumber(business.customersWaiting), 'fa-hourglass-half', 'yellow')}
      ${kpiCard('Priority Complaints', formatNumber(business.highPriorityComplaints), 'fa-triangle-exclamation', 'red')}
    </div>

    <div class="ops-grid ops-row-1 command-center-grid">
      <div class="chart-card command-map-card">
        <div class="chart-card-header">
          <h3><i class="fa-solid fa-earth-africa"></i> Global Conversations</h3>
          <span class="live-indicator"><span class="pulse"></span> Live</span>
        </div>
        <div class="command-map-wrap">
          ${renderWorldMap(mapDots)}
          <div class="map-legend">
            <span class="map-legend-item"><span class="map-legend-dot active"></span> Active</span>
            <span class="map-legend-item"><span class="map-legend-dot waiting"></span> Waiting</span>
            <span class="map-legend-item"><span class="map-legend-dot escalation"></span> Escalation</span>
          </div>
        </div>
      </div>

      <div class="activity-section ops-activity">
        <div class="header">
          <h3><i class="fa-solid fa-satellite-dish"></i> Live Activity</h3>
        </div>
        <div class="activity-feed ops-activity-scroll">
          ${renderActivity(activity)}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#refreshCommandCenter')?.addEventListener('click', () => {
    renderCommandCenter(container);
  });
}

function statusPill(service) {
  const ok = service.status === 'operational';
  const icon = ok ? '🟢' : service.status === 'simulated' ? '🟡' : '🔴';
  return `
    <div class="command-status-pill ${ok ? 'ok' : 'warn'}">
      <span>${icon}</span>
      <strong>${escapeHtml(service.label)}</strong>
      <span>${service.uptime || 99.9}% uptime</span>
    </div>`;
}

function kpiCard(label, value, icon, color) {
  return `
    <div class="kpi-card">
      <div class="header">
        <div>
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(String(value))}</div>
        </div>
        <div class="icon-wrapper ${color}"><i class="fa-solid ${icon}"></i></div>
      </div>
    </div>`;
}

function formatCurrency(n) {
  return `R${formatNumber(n)}`;
}

function renderWorldMap(dots) {
  const dotEls = (dots || [])
    .map((d, i) => {
      const type = d.type || 'active';
      const delay = ((i * 0.37) % 2.4).toFixed(2);
      const size = d.intensity >= 0.75 ? ' map-dot-lg' : '';
      return `<span class="map-dot map-dot-${type}${size}" style="left:${d.x}%;top:${d.y}%;animation-delay:${delay}s" title="${escapeHtml(d.label)}"><span class="map-dot-core"></span><span class="map-dot-ring"></span></span>`;
    })
    .join('');

  return `
    <svg class="world-map-svg" viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="ccMapBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="55%" stop-color="#1e1b4b"/>
          <stop offset="100%" stop-color="#0c4a6e"/>
        </linearGradient>
        <linearGradient id="ccMapGlow" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="ccMapVignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.55"/>
        </radialGradient>
        <filter id="ccMapBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2"/>
        </filter>
      </defs>
      <rect width="1000" height="500" fill="url(#ccMapBg)"/>
      <rect width="1000" height="500" fill="url(#ccMapGlow)" opacity="0.6"/>
      <g class="map-grid" stroke="#6366f1" stroke-opacity="0.08" stroke-width="1">
        ${Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * 100}" y1="0" x2="${(i + 1) * 100}" y2="500"/>`).join('')}
        ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${(i + 1) * 100}" x2="1000" y2="${(i + 1) * 100}"/>`).join('')}
      </g>
      <ellipse cx="500" cy="250" rx="470" ry="210" fill="none" stroke="#818cf8" stroke-opacity="0.12" stroke-width="1.5" stroke-dasharray="6 8"/>
      <g class="map-continents" fill="#94a3b8" fill-opacity="0.22" stroke="#cbd5e1" stroke-opacity="0.18" stroke-width="1">
        <path d="M118,72 C165,58 228,62 278,88 C318,108 332,138 298,168 C262,188 210,182 168,162 C128,142 108,108 118,72Z"/>
        <path d="M145,188 C178,178 205,198 212,238 C218,288 198,348 168,382 C148,362 132,318 128,268 C124,228 132,200 145,188Z"/>
        <path d="M468,78 C512,68 558,78 588,102 C608,118 598,148 568,168 C538,178 498,172 472,152 C458,132 458,98 468,78Z"/>
        <path d="M478,168 C528,158 568,182 578,228 C588,288 558,352 518,378 C488,362 468,318 462,268 C458,218 462,182 478,168Z"/>
        <path d="M568,62 C658,48 768,58 858,88 C912,108 928,148 898,188 C848,218 748,228 638,208 C588,188 552,148 558,108 C562,82 568,62Z"/>
        <path d="M688,248 C738,242 788,258 812,288 C828,318 808,358 762,378 C722,368 692,338 682,298 C678,268 682,258 688,248Z"/>
        <path d="M778,318 C828,308 878,322 902,352 C918,378 898,402 852,408 C812,402 778,378 772,348 C768,328 772,318 778,318Z"/>
      </g>
      <g class="map-continents-glow" fill="#a78bfa" fill-opacity="0.08" filter="url(#ccMapBlur)">
        <path d="M118,72 C165,58 228,62 278,88 C318,108 332,138 298,168 C262,188 210,182 168,162 C128,142 108,108 118,72Z"/>
        <path d="M478,168 C528,158 568,182 578,228 C588,288 558,352 518,378 C488,362 468,318 462,268 C458,218 462,182 478,168Z"/>
        <path d="M568,62 C658,48 768,58 858,88 C912,108 928,148 898,188 C848,218 748,228 638,208 C588,188 552,148 558,108 C562,82 568,62Z"/>
      </g>
      <rect width="1000" height="500" fill="url(#ccMapVignette)"/>
      <rect class="map-scan-line" x="0" y="0" width="1000" height="60" fill="url(#ccMapGlow)" opacity="0.25"/>
    </svg>
    <div class="map-dots-layer">${dotEls}</div>`;
}

function renderActivity(items) {
  if (!items?.length) {
    return '<div class="empty-panel">No recent activity</div>';
  }
  return items
    .slice(0, 10)
    .map(
      (item) => `
    <div class="activity-item">
      <div class="activity-icon ${item.color || 'grey'}"><i class="fa-solid ${item.icon || 'fa-bolt'}"></i></div>
      <div class="activity-content">
        <div class="activity-text">${item.text || item.detail || '—'}</div>
        <div class="activity-time">${escapeHtml(item.time || item.ago || '')}</div>
      </div>
    </div>`
    )
    .join('');
}
