/**
 * Collapsible auxiliary panels above Sarah chat (workforce instructions, BOS cycle, etc.).
 */
import { escapeHtml } from '../admin/ui.js';

/**
 * @param {{ panelKey: string, title: string, subtitle?: string, icon?: string, bodyHtml: string, defaultOpen?: boolean }} opts
 */
export function renderSarahCollapsiblePanel({
  panelKey,
  title,
  subtitle = '',
  icon = 'fa-layer-group',
  bodyHtml,
  defaultOpen = false,
}) {
  const key = escapeHtml(panelKey);
  return `<details class="sarah-aux-panel" data-sarah-aux-panel="${key}" ${
    defaultOpen ? 'open' : ''
  }>
    <summary class="sarah-aux-panel-summary">
      <span class="sarah-aux-panel-summary-main">
        <i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i>
        <span class="sarah-aux-panel-titles">
          <strong class="sarah-aux-panel-title">${escapeHtml(title)}</strong>
          ${
            subtitle
              ? `<span class="sarah-aux-panel-subtitle muted">${escapeHtml(subtitle)}</span>`
              : ''
          }
        </span>
      </span>
      <i class="fa-solid fa-chevron-down sarah-aux-panel-chevron" aria-hidden="true"></i>
    </summary>
    <div class="sarah-aux-panel-body">${bodyHtml}</div>
  </details>`;
}

/** Persist expand/collapse per panel key (portal-wide). */
export function bindSarahCollapsiblePanelPersistence(container) {
  if (!container || typeof localStorage === 'undefined') return;
  container.querySelectorAll('details.sarah-aux-panel[data-sarah-aux-panel]').forEach((el) => {
    const key = el.getAttribute('data-sarah-aux-panel');
    if (!key) return;
    const storageKey = `ziric-portal-sarah-aux-open-${key}`;
    const stored = localStorage.getItem(storageKey);
    if (stored === '1') el.open = true;
    else if (stored === '0') el.open = false;
    el.addEventListener('toggle', () => {
      localStorage.setItem(storageKey, el.open ? '1' : '0');
    });
  });
}
