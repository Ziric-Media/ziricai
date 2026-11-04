import { state } from '../core/state.js';
import { fetchUserConversations, fetchCompanyMessages, sendCompanyMessage } from '../companyChat.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderThread(host, companyId, companyName, messages) {
  host.innerHTML = `
    <div class="sarah-chat-module">
      <button type="button" class="sarah-back-link" id="chatsBack">← All chats</button>
      <h2>${escapeHtml(companyName)}</h2>
      <p class="sarah-module-hint">Company Sarah · ${escapeHtml(companyId)}</p>
      <div class="sarah-chat-messages" role="log" aria-live="polite"></div>
      <form class="sarah-chat-compose" id="companyChatForm">
        <input type="text" id="companyChatInput" placeholder="Message ${escapeHtml(companyName)}…" autocomplete="off" />
        <button type="submit" class="btn btn-primary">Send</button>
      </form>
    </div>`;

  const inner = host.querySelector('.sarah-chat-messages');
  inner.innerHTML = messages
    .map(
      (m) => `
    <div class="sarah-chat-bubble ${m.role === 'user' ? 'is-user' : 'is-assistant'}">
      ${escapeHtml(m.content)}
    </div>`
    )
    .join('');
  inner.scrollTop = inner.scrollHeight;

  host.querySelector('#chatsBack')?.addEventListener('click', () => {
    host.dataset.activeCompany = '';
    renderChats(host);
  });

  const form = host.querySelector('#companyChatForm');
  const input = host.querySelector('#companyChatInput');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    try {
      const res = await sendCompanyMessage(companyId, text);
      renderThread(host, companyId, companyName, res.messages || []);
    } catch (err) {
      alert(err.message || 'Send failed');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}

export async function renderChats(host) {
  const active = host.dataset.activeCompany;
  if (active) {
    const name = host.dataset.activeCompanyName || active;
    try {
      const data = await fetchCompanyMessages(active);
      renderThread(host, active, data.conversation?.companyName || name, data.messages || []);
    } catch (err) {
      host.innerHTML = `<p class="sarah-error">${escapeHtml(err.message)}</p>`;
    }
    return;
  }

  host.innerHTML = `
    <div class="sarah-chats-list">
      <h2>Chats</h2>
      <p class="sarah-module-hint">Conversations with businesses on Sarah App.</p>
      <div id="chatsListHost"><p>Loading…</p></div>
    </div>`;

  const listHost = host.querySelector('#chatsListHost');
  try {
    const { conversations } = await fetchUserConversations();
    if (!conversations?.length) {
      listHost.innerHTML =
        '<p class="sarah-empty">No chats yet. Open <strong>Discover</strong> and start a conversation with SmileMore Dentists.</p>';
      return;
    }
    listHost.innerHTML = conversations
      .map(
        (c) => `
      <button type="button" class="sarah-chat-list-item" data-company-id="${escapeHtml(c.companyId)}" data-company-name="${escapeHtml(c.companyName)}">
        <span class="sarah-chat-list-title">${escapeHtml(c.companyName)}</span>
        <span class="sarah-chat-list-preview">${escapeHtml(c.preview || 'Tap to open')}</span>
      </button>`
      )
      .join('');
    listHost.querySelectorAll('[data-company-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        host.dataset.activeCompany = btn.dataset.companyId;
        host.dataset.activeCompanyName = btn.dataset.companyName;
        renderChats(host);
      });
    });
  } catch (err) {
    listHost.innerHTML = `<p class="sarah-error">${escapeHtml(err.message)}</p>`;
  }
}

/** Open a company thread from Discover. */
export function openCompanyChatFromDiscover(host, companyId, companyName) {
  host.dataset.activeCompany = companyId;
  host.dataset.activeCompanyName = companyName || companyId;
  renderChats(host);
}
