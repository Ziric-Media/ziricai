import { state } from '../core/state.js';

export function renderModulePlaceholder(host, meta) {
  const name =
    state.consumerProfile?.preferredName ||
    state.consumerProfile?.firstName ||
    state.consumerProfile?.fullName ||
    'there';
  host.innerHTML = `
    <div class="sarah-module">
      <h2>${meta.title}</h2>
      <p class="sarah-module-hint">${meta.hint}</p>
      ${
        meta.title === 'Profile' && state.consumerProfile
          ? `<dl class="sarah-profile-dl">
        <div><dt>Preferred name</dt><dd>${escapeHtml(name)}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(state.consumerProfile.email || '—')}</dd></div>
      </dl>`
          : `<p class="sarah-module-greeting">Hello ${escapeHtml(name)} — Sarah App U1 shell is live.</p>`
      }
    </div>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
