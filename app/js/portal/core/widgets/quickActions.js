import { escapeHtml } from '../../../admin/ui.js';

/**
 * @param {Array<{ label: string, icon: string, nav?: string, action?: string, color?: string }>} actions
 */
export function renderQuickActions(actions = []) {
  if (!actions.length) return '';

  return `
    <div class="bos-quick-actions">
      ${actions
        .map(
          (a) => `
        <button type="button" class="bos-quick-action ${escapeHtml(a.color || 'brand')}"
          ${a.nav ? `data-nav="${escapeHtml(a.nav)}"` : ''}
          ${a.action ? `data-action="${escapeHtml(a.action)}"` : ''}>
          <i class="fa-solid ${escapeHtml(a.icon)}"></i>
          <span>${escapeHtml(a.label)}</span>
        </button>`
        )
        .join('')}
    </div>
  `;
}

export const DEFAULT_OVERVIEW_ACTIONS = [
  { label: 'Create AI Employee', icon: 'fa-robot', nav: 'agents', color: 'purple' },
  { label: 'Upload Knowledge', icon: 'fa-book', nav: 'knowledge', color: 'yellow' },
  { label: 'Connect WhatsApp', icon: 'fa-brands fa-whatsapp', nav: 'integrations', color: 'green' },
  { label: 'View Analytics', icon: 'fa-chart-line', nav: 'analytics', color: 'blue' },
];
