/**
 * Shared Sarah workforce UI — horizontal nav, KPI grids, lightweight charts (no chart libs).
 */
import { escapeHtml } from '../admin/ui.js';
import { sarahNavIconMarkup } from '../shared/sarahAvatar.js';

/**
 * @param {Array<{ id: string, label: string, icon?: string, badge?: string, sarah?: boolean }>} items
 * @param {string} activeId
 * @param {string} dataAttr e.g. data-sales-section
 */
export function renderSarahHorizontalNav(items, activeId, dataAttr) {
  const buttons = items
    .map((item) => {
      const active = item.id === activeId;
      const iconClass =
        item.icon && (item.icon.includes('fa-brands') || item.icon.includes('fa-regular'))
          ? item.icon
          : item.icon
            ? item.icon.startsWith('fa-')
              ? `fa-solid ${item.icon}`
              : `fa-solid fa-${item.icon}`
            : '';
      const icon =
        item.sarah === true
          ? sarahNavIconMarkup()
          : iconClass
            ? `<i class="${escapeHtml(iconClass)}" aria-hidden="true"></i>`
            : '';
      const badge = item.badge
        ? `<span class="sw-nav-badge">${escapeHtml(String(item.badge))}</span>`
        : '';
      return `<button type="button" class="sw-nav-btn ${active ? 'is-active' : ''} ${item.sarah ? 'sw-nav-btn--sarah' : ''}" ${dataAttr}="${escapeHtml(item.id)}" aria-current="${active ? 'page' : 'false'}">
        ${icon}
        <span class="sw-nav-label">${escapeHtml(item.label)}</span>
        ${badge}
      </button>`;
    })
    .join('');

  const mobileOptions = items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}" ${item.id === activeId ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    )
    .join('');

  return `<nav class="sw-horizontal-nav" aria-label="Workspace sections">
    <div class="sw-horizontal-nav-scroll">${buttons}</div>
    <label class="sw-horizontal-nav-mobile fin-field">
      <span class="fin-sr-only">Section</span>
      <select class="fin-select sw-horizontal-select" data-sw-nav-select aria-label="Section">${mobileOptions}</select>
    </label>
  </nav>`;
}

/**
 * @param {Array<{ label: string, value: string|number, icon?: string, tone?: string, hint?: string }>} items
 */
export function renderSwKpiGrid(items) {
  return `<div class="sw-kpi-grid">
    ${items
      .map(
        (k) => `<article class="sw-kpi-card sw-kpi-card--${escapeHtml(k.tone || 'default')}">
      <div class="sw-kpi-icon" aria-hidden="true">${k.icon ? `<i class="fa-solid ${escapeHtml(k.icon)}"></i>` : ''}</div>
      <div class="sw-kpi-body">
        <span class="sw-kpi-label">${escapeHtml(k.label)}</span>
        <span class="sw-kpi-value">${escapeHtml(String(k.value))}</span>
        ${k.hint ? `<span class="sw-kpi-hint">${escapeHtml(k.hint)}</span>` : ''}
      </div>
    </article>`
      )
      .join('')}
  </div>`;
}

/**
 * @param {Array<{ label: string, value: number, color: string }>} segments
 */
function shortenCenterLabel(label) {
  const s = String(label || 'Total');
  if (s.length <= 12) return s;
  const words = s.split(/\s+/);
  if (words.length > 1 && words[0].length <= 10) return words[0];
  return `${s.slice(0, 9)}…`;
}

export function renderDonutChart(
  segments,
  { centerLabel = 'Total', centerValue, compact = false, showLegend = true } = {}
) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const safeTotal = total || 1;
  let acc = 0;
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = (acc / safeTotal) * 100;
      acc += s.value;
      const end = (acc / safeTotal) * 100;
      return `${s.color} ${start}% ${end}%`;
    })
    .join(', ');
  const gradient = stops ? `conic-gradient(${stops})` : 'conic-gradient(#e2e8f0 0 100%)';
  const center = centerValue != null ? centerValue : total;
  const labelShort = shortenCenterLabel(centerLabel);
  const labelFull = String(centerLabel || 'Total');
  const sizeClass = compact ? ' sw-donut--compact' : '';

  return `<div class="sw-chart-panel${compact ? ' sw-chart-panel--compact' : ''}">
    <div class="sw-donut${sizeClass}" style="background:${gradient}" role="img" aria-label="${escapeHtml(labelFull)} ${center}">
      <div class="sw-donut-hole">
        <span class="sw-donut-center-value">${escapeHtml(String(center))}</span>
        <span class="sw-donut-center-label" title="${escapeHtml(labelFull)}">${escapeHtml(labelShort)}</span>
      </div>
    </div>
    ${
      showLegend
        ? `<ul class="sw-chart-legend">
      ${segments
        .map(
          (s) => `<li><span class="sw-legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.label)} <strong>${s.value}</strong></li>`
        )
        .join('')}
    </ul>`
        : ''
    }
  </div>`;
}

/** Mini spark bars for overview cards (values 0–100-ish). */
export function renderSparkBars(values, { color = 'var(--brand-primary, #1e40af)' } = {}) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));
  return `<div class="sw-spark-bars" aria-hidden="true">
    ${values
      .map((v) => {
        const h = Math.max(8, Math.round(((Number(v) || 0) / max) * 100));
        return `<span class="sw-spark-bar" style="height:${h}%;background:${color}"></span>`;
      })
      .join('')}
  </div>`;
}

export function renderSwChartCard(title, subtitle, bodyHtml) {
  return `<article class="sw-chart-card">
    <header class="sw-chart-card-head">
      <h4>${escapeHtml(title)}</h4>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
    </header>
    <div class="sw-chart-card-body">${bodyHtml}</div>
  </article>`;
}

export function renderSwOverviewQuad(cardsHtml) {
  return `<div class="sw-overview-quad">${cardsHtml}</div>`;
}

/**
 * @param {Array<{ label: string, value: number, color?: string }>} rows
 */
export function renderBarChart(rows, { title = '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  return `<div class="sw-bar-chart">
    ${title ? `<h4 class="sw-chart-title">${escapeHtml(title)}</h4>` : ''}
    <ul class="sw-bar-rows">
      ${rows
        .map((r) => {
          const pct = Math.round(((r.value || 0) / max) * 100);
          const color = r.color || 'var(--brand-primary, #1e40af)';
          return `<li class="sw-bar-row">
            <span class="sw-bar-label">${escapeHtml(r.label)}</span>
            <div class="sw-bar-track"><span class="sw-bar-fill" style="width:${pct}%;background:${color}"></span></div>
            <span class="sw-bar-value">${r.value}</span>
          </li>`;
        })
        .join('')}
    </ul>
  </div>`;
}

export function renderSwOverviewGrid(title, childrenHtml) {
  return `<section class="sw-overview-dashboard card">
    <header class="sw-overview-head"><h3>${escapeHtml(title)}</h3></header>
    <div class="sw-overview-body">${childrenHtml}</div>
  </section>`;
}

/** Sarah full-page chat shell (Finance / HR / Operations pattern). */
export function renderSarahWorkspaceChatShell({
  title,
  subtitle,
  intro,
  capabilities = [],
  suggestions = [],
  chatMountId,
  accent = 'brand',
}) {
  return `<div class="portal-sarah-page sw-sarah-page sw-sarah-page--${escapeHtml(accent)}">
    <aside class="portal-sarah-page-aside" aria-label="${escapeHtml(title)}">
      <div class="portal-sarah-page-brand">
        ${sarahNavIconMarkup()}
        <div>
          <h2 class="portal-sarah-page-title">${escapeHtml(title)}</h2>
          <p class="portal-sarah-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <p class="portal-sarah-page-intro">${escapeHtml(intro)}</p>
      ${
        capabilities.length
          ? `<h3 class="portal-sarah-page-aside-heading">Can help with</h3>
      <ul class="portal-sarah-cap-list">
        ${capabilities.map((c) => `<li><i class="fa-solid ${escapeHtml(c.icon)}"></i><span>${escapeHtml(c.label)}</span></li>`).join('')}
      </ul>`
          : ''
      }
      ${
        suggestions.length
          ? `<h3 class="portal-sarah-page-aside-heading">Try asking</h3>
      <ul class="portal-sarah-try-list">${suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
          : ''
      }
    </aside>
    <section class="portal-sarah-page-main" aria-label="Chat with Sarah">
      <header class="portal-sarah-page-main-header">
        <div><strong>Conversation</strong><span class="text-muted">Enter to send · Shift+Enter for new line</span></div>
      </header>
      <div class="bos-instruction-panel-host" data-workforce-instructions-host></div>
      <div class="portal-sarah-page-chat" id="${escapeHtml(chatMountId)}" data-sw-sarah-chat></div>
    </section>
  </div>`;
}
