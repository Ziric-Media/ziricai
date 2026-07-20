import { escapeHtml } from '../../../admin/ui.js';

/**
 * Skeleton loader for lazy module transitions.
 * @param {{ label?: string, cards?: number, rows?: number }} [opts]
 */
export function renderLoadingSkeleton(opts = {}) {
  const cards = opts.cards ?? 4;
  const rows = opts.rows ?? 3;
  const label = opts.label || 'Loading…';

  const cardSkels = Array.from({ length: cards })
    .map(() => '<div class="bos-skeleton bos-skeleton-card"></div>')
    .join('');

  const rowSkels = Array.from({ length: rows })
    .map(() => '<div class="bos-skeleton bos-skeleton-row"></div>')
    .join('');

  return `
    <div class="bos-loading" aria-busy="true" aria-label="${escapeHtml(label)}">
      <div class="bos-loading-label">${escapeHtml(label)}</div>
      <div class="bos-skeleton-grid">${cardSkels}</div>
      <div class="bos-skeleton-rows">${rowSkels}</div>
    </div>
  `;
}

/** @param {string} [message] */
export function renderPageSkeleton(message = 'Loading module…') {
  return renderLoadingSkeleton({ label: message, cards: 4, rows: 2 });
}
