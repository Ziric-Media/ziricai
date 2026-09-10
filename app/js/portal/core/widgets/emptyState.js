import { emptyState as adminEmptyState } from '../../../admin/ui.js';

/**
 * @param {{ title?: string, message?: string, actionHtml?: string }} [opts]
 */
export function renderEmptyState(opts = {}) {
  const msg = opts.message || opts.title || 'Nothing here yet.';
  return adminEmptyState(msg, opts.actionHtml || '');
}
