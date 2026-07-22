/** UI helpers: toasts, theme, formatting, shared markup. */

export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
    <div class="toast-content">
      <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" type="button">✕</button>
  `;
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ziricai-theme', theme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.innerHTML = theme === 'dark'
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatNumber(value) {
  const n = Number(value) || 0;
  return n.toLocaleString();
}

export function formatDate(value) {
  if (!value) return '—';
  if (value?.toDate) return value.toDate().toLocaleDateString();
  if (value instanceof Date) return value.toLocaleDateString();
  return new Date(value).toLocaleDateString();
}

export function statusBadge(status) {
  const normalized = String(status || 'unknown').toLowerCase();
  let cls = 'pending';
  if (['active', 'paid', 'online'].includes(normalized)) cls = 'active';
  else if (['suspended', 'overdue'].includes(normalized)) cls = 'suspended';
  else if (['inactive', 'cancelled', 'offline'].includes(normalized)) cls = 'inactive';
  else if (normalized === 'trial') cls = 'trial';
  const label = normalized === 'trial' ? 'Trial' : (status || 'Unknown');
  return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

export function planBadge(plan) {
  const key = String(plan || 'starter').toLowerCase();
  const labels = { starter: 'Starter', professional: 'Professional', business: 'Business', enterprise: 'Enterprise' };
  return `<span class="plan-badge ${escapeHtml(key)}">${escapeHtml(labels[key] || plan || 'Starter')}</span>`;
}

export function maskApiKey(key) {
  if (!key) return '—';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
}

export function pageHeader(title, subtitle, actionsHtml = '') {
  return `
    <div class="page-header">
      <div class="title-section">
        <h1>${escapeHtml(title)}</h1>
        <div class="subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
    </div>
  `;
}

export function emptyState(message, actionHtml = '') {
  return `
    <div class="profile-card" style="text-align:center;padding:48px 24px;">
      <div style="font-size:40px;margin-bottom:12px;">📭</div>
      <div style="font-weight:600;margin-bottom:8px;">No data yet</div>
      <div style="color:var(--text-muted);font-size:14px;margin-bottom:16px;">${escapeHtml(message)}</div>
      ${actionHtml}
    </div>
  `;
}

export function loadingState(message = 'Loading...') {
  return `
    <div class="profile-card" style="text-align:center;padding:48px 24px;color:var(--text-muted);">
      <div style="font-size:24px;margin-bottom:8px;">⏳</div>
      ${escapeHtml(message)}
    </div>
  `;
}

export function errorState(message = 'Something went wrong.') {
  return `
    <div class="profile-card" style="text-align:center;padding:48px 24px;border-color:var(--danger);">
      <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
      <div style="font-weight:600;margin-bottom:8px;">Unable to load</div>
      <div style="color:var(--text-muted);font-size:14px;">${escapeHtml(message)}</div>
    </div>
  `;
}

export function trendHtml(value) {
  const n = Number(value) || 0;
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'neutral';
  const icon = n > 0 ? 'fa-arrow-trend-up' : n < 0 ? 'fa-arrow-trend-down' : 'fa-minus';
  const sign = n > 0 ? '+' : '';
  return `<div class="trend ${cls}"><i class="fa-solid ${icon}"></i> ${sign}${n}% vs last week</div>`;
}

export function conversationBadge(status) {
  const key = String(status || 'new').toLowerCase().replace(/\s+/g, '_');
  const labels = {
    new: 'New',
    in_progress: 'In Progress',
    human_takeover: 'Human Takeover',
    closed: 'Closed',
    open: 'In Progress',
  };
  return `<span class="conv-badge ${key}">${escapeHtml(labels[key] || status || 'New')}</span>`;
}

export function bindModal({ overlayId, closeBtnId, onClose }) {
  const overlay = document.getElementById(overlayId);
  const closeBtn = document.getElementById(closeBtnId);
  const backdrop = document.getElementById('overlay');
  const close = () => {
    overlay?.classList.remove('open');
    backdrop?.classList.remove('open');
    onClose?.();
  };
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  return { open: () => { overlay?.classList.add('open'); backdrop?.classList.add('open'); }, close };
}
