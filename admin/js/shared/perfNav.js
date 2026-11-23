/**
 * PERF-00 navigation instrumentation — opt-in via ?perf=1 or localStorage ziric-perf-nav=1.
 * Logs performance marks to console and a small on-page trace panel (no behaviour changes).
 */

const STORAGE_KEY = 'ziric-perf-nav';
let enabled = null;
let panelEl = null;
const MAX_LINES = 40;
const lines = [];

function queryEnabled() {
  if (enabled !== null) return enabled;
  try {
    const qs = typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf');
    if (qs === '1' || qs === 'true') {
      localStorage.setItem(STORAGE_KEY, '1');
      enabled = true;
      return true;
    }
    enabled = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

export function isPerfNavEnabled() {
  return queryEnabled();
}

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function appendLine(text) {
  lines.push(`[${stamp()}] ${text}`);
  if (lines.length > MAX_LINES) lines.shift();
  if (panelEl) {
    panelEl.textContent = lines.join('\n');
  }
}

function ensurePanel() {
  if (!queryEnabled() || panelEl || typeof document === 'undefined') return;
  panelEl = document.createElement('pre');
  panelEl.id = 'ziric-perf-nav-trace';
  panelEl.setAttribute('aria-live', 'polite');
  Object.assign(panelEl.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    maxHeight: '28vh',
    margin: '0',
    padding: '8px 10px',
    fontSize: '11px',
    lineHeight: '1.35',
    fontFamily: 'ui-monospace, Consolas, monospace',
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#e2e8f0',
    zIndex: '2147483646',
    overflow: 'auto',
    pointerEvents: 'none',
    borderTop: '1px solid rgba(148, 163, 184, 0.35)',
  });
  document.body?.appendChild(panelEl);
}

export function perfNavInit() {
  if (!queryEnabled()) return;
  ensurePanel();
  appendLine('perf-nav active (clear: localStorage.removeItem("ziric-perf-nav"))');
}

/**
 * @param {string} name stable label, e.g. portal.navigateTo.finance
 * @param {{ detail?: string }} [meta]
 */
export function perfMark(name, meta = {}) {
  if (!queryEnabled()) return;
  ensurePanel();
  const detail = meta.detail ? ` ${meta.detail}` : '';
  try {
    performance.mark(`ziric:${name}`);
  } catch {
    /* ignore */
  }
  appendLine(`${name}${detail}`);
}

/**
 * @param {string} name
 * @param {string} startMark
 * @param {string} [endMark]
 */
export function perfMeasure(name, startMark, endMark) {
  if (!queryEnabled()) return;
  try {
    const m = performance.measure(`ziric:${name}`, `ziric:${startMark}`, endMark ? `ziric:${endMark}` : undefined);
    appendLine(`${name} +${Math.round(m.duration)}ms`);
  } catch {
    /* ignore */
  }
}

/**
 * Wrap async work with start/end marks.
 * @param {string} name
 * @param {() => Promise<unknown>} fn
 */
export async function perfAsync(name, fn) {
  if (!queryEnabled()) return fn();
  perfMark(`${name}:start`);
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - t0);
    perfMark(`${name}:end`, { detail: `${ms}ms` });
  }
}

/** Call from sidebar / nav click handlers before navigateTo. */
export function perfNavClick(target) {
  if (!queryEnabled()) return;
  perfMark('nav.click', { detail: String(target || '') });
}