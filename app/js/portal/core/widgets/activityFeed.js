import { escapeHtml } from '../../../admin/ui.js';

/**
 * @param {Array<object>} items
 * @param {{ limit?: number, viewAllNav?: string }} [opts]
 */
export function renderActivityFeed(items = [], opts = {}) {
  const rows = items.slice(0, opts.limit ?? 6);
  if (!rows.length) {
    return '<div class="empty-panel">No recent activity yet.</div>';
  }

  return rows
    .map(
      (item) => `
    <div class="activity-item bos-activity-item">
      <div class="icon-wrapper ${escapeHtml(item.color || 'grey')}">
        <i class="fa-solid ${escapeHtml(item.icon || 'fa-circle')}"></i>
      </div>
      <div class="content">
        <div class="text">${item.text || formatActivityText(item)}</div>
        <div class="time">${escapeHtml(item.ago || item.time?.slice?.(0, 16) || '—')}</div>
      </div>
    </div>`
    )
    .join('');
}

function formatActivityText(item) {
  return `<strong>${escapeHtml(item.actor || 'System')}</strong> ${escapeHtml(item.action || '')} <em>${escapeHtml(item.target || '')}</em>`;
}

/**
 * @param {Array<object>} items
 * @param {{ title?: string, viewAllNav?: string }} [opts]
 */
export function renderActivityPanel(items, opts = {}) {
  return `
    <div class="activity-section portal-activity-panel bos-activity-panel">
      <div class="header">
        <h3><i class="fa-solid fa-clock-rotate-left"></i> ${escapeHtml(opts.title || 'Recent Activity')}</h3>
        ${opts.viewAllNav ? `<a href="#" class="panel-link" data-nav="${escapeHtml(opts.viewAllNav)}">View all</a>` : ''}
      </div>
      <div class="activity-feed portal-activity-scroll">
        ${renderActivityFeed(items)}
      </div>
    </div>
  `;
}
