import { escapeHtml, trendHtml } from '../../../admin/ui.js';

/**
 * KPI card — matches Super Admin dashboard style.
 * @param {{ label: string, value: string, icon: string, color?: string, trend?: number | null, href?: string, dataNav?: string }} opts
 */
export function renderKpiCard({ label, value, icon, color = 'purple', trend = null, href, dataNav }) {
  const tag = href ? 'a' : 'div';
  const attrs = href
    ? ` href="${escapeHtml(href)}" class="kpi-card kpi-card-link bos-kpi-card"`
    : dataNav
      ? ` class="kpi-card kpi-card-link bos-kpi-card" data-nav="${escapeHtml(dataNav)}" role="button" tabindex="0"`
      : ' class="kpi-card bos-kpi-card"';

  return `
    <${tag}${attrs}>
      <div class="header">
        <div>
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(String(value))}</div>
          ${trend != null ? trendHtml(trend) : ''}
        </div>
        <div class="icon-wrapper ${escapeHtml(color)}"><i class="fa-solid ${escapeHtml(icon)}"></i></div>
      </div>
    </${tag}>
  `;
}
