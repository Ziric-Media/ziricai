import { fetchDiscoverCompanies } from '../companyChat.js';
import { openCompanyChatFromDiscover } from './chats.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function renderDiscover(host) {
  host.innerHTML = `
    <div class="sarah-discover">
      <h2>Discover</h2>
      <p class="sarah-module-hint">Pilot businesses you can chat with on Sarah App (full directory in U6).</p>
      <div id="discoverList"><p>Loading…</p></div>
    </div>`;

  const list = host.querySelector('#discoverList');
  try {
    const { companies } = await fetchDiscoverCompanies();
    if (!companies?.length) {
      list.innerHTML = '<p class="sarah-empty">No businesses listed yet.</p>';
      return;
    }
    list.innerHTML = companies
      .map(
        (c) => `
      <article class="sarah-discover-card">
        <div class="sarah-discover-card-head">
          <strong>${escapeHtml(c.displayName)}</strong>
          ${c.verified ? '<span class="sarah-badge-verified">Verified</span>' : ''}
        </div>
        <p class="sarah-discover-meta">${escapeHtml(c.industry || '')} · ${escapeHtml(c.location || '')}</p>
        <p class="sarah-discover-desc">${escapeHtml(c.shortDescription || '')}</p>
        <button type="button" class="btn btn-primary" data-chat-company="${escapeHtml(c.companyId)}" data-chat-name="${escapeHtml(c.displayName)}">
          Chat with Sarah
        </button>
      </article>`
      )
      .join('');

    list.querySelectorAll('[data-chat-company]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const companyId = btn.getAttribute('data-chat-company');
        const name = btn.getAttribute('data-chat-name');
        const viewHost = document.getElementById('viewHost');
        if (viewHost) {
          viewHost.dataset.keepChatThread = '1';
          openCompanyChatFromDiscover(viewHost, companyId, name);
        }
        location.hash = 'chats';
        document.querySelectorAll('.sarah-bottom-nav [data-route]').forEach((btn) => {
          btn.classList.toggle('is-active', btn.dataset.route === 'chats');
        });
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="sarah-error">${escapeHtml(err.message)}</p>`;
  }
}
