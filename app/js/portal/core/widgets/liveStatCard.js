import { escapeHtml, trendHtml } from '../../../admin/ui.js';

/**
 * Live stat card with pulse indicator for real-time metrics.
 * @param {{ label: string, value: string, icon: string, color?: string, trend?: number | null, live?: boolean, dataNav?: string }} opts
 */
export function renderLiveStatCard({
  label,
  value,
  icon,
  color = 'green',
  trend = null,
  live = true,
  dataNav,
}) {
  return `
    <div class="bos-live-stat ${dataNav ? 'bos-live-stat-link' : ''}" ${dataNav ? `data-nav="${escapeHtml(dataNav)}" role="button" tabindex="0"` : ''}>
      <div class="bos-live-stat-top">
        <div class="bos-live-stat-icon ${escapeHtml(color)}"><i class="fa-solid ${escapeHtml(icon)}"></i></div>
        ${live ? '<span class="bos-live-pulse" title="Live"><span class="pulse"></span> Live</span>' : ''}
      </div>
      <div class="bos-live-stat-value">${escapeHtml(String(value))}</div>
      <div class="bos-live-stat-label">${escapeHtml(label)}</div>
      ${trend != null ? `<div class="bos-live-stat-trend">${trendHtml(trend)}</div>` : ''}
    </div>
  `;
}
