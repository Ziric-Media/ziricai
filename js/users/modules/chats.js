import { state } from '../core/state.js';
import {
  fetchChatConversations,
  fetchCompanyMessages,
  sendCompanyMessage,
  requestHumanHandover,
} from '../companyChat.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function handoverBadge(state) {
  if (!state || state === 'ai_active' || state === 'ai_active_again') return 'Company Sarah';
  if (state === 'human_requested') return 'Human requested';
  if (state === 'human_active' || state === 'human_assigned') return 'Human team';
  return state.replace(/_/g, ' ');
}

function renderThread(host, companyId, companyName, messages, conversation = {}) {
  const ownership = conversation.ownershipState || 'ai_active';
  host.innerHTML = `
    <div class="sarah-chat-module">
      <button type="button" class="sarah-back-link" id="chatsBack">← All chats</button>
      <h2>${escapeHtml(companyName)}</h2>
      <p class="sarah-module-hint">${escapeHtml(handoverBadge(ownership))} · ${escapeHtml(companyId)}</p>
      <button type="button" class="btn btn-secondary btn-sm" id="requestHumanBtn">Request a human</button>
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
  host.querySelector('#requestHumanBtn')?.addEventListener('click', async () => {
    try {
      await requestHumanHandover(companyId);
      const data = await fetchCompanyMessages(companyId);
      renderThread(host, companyId, companyName, data.messages || [], data.conversation || {});
    } catch (err) {
      alert(err.message || 'Request failed');
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    try {
      const res = await sendCompanyMessage(companyId, text);
      renderThread(host, companyId, companyName, res.messages || [], res.conversation || {});
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
      renderThread(host, active, data.conversation?.companyName || name, data.messages || [], data.conversation || {});
    } catch (err) {
      host.innerHTML = `<p class="sarah-error">${escapeHtml(err.message)}</p>`;
    }
    return;
  }

  host.innerHTML = `
    <div class="sarah-chats-list">
      <h2>Chats</h2>
      <p class="sarah-module-hint">People, businesses, groups, and Sarah Network threads.</p>
      <div class="sarah-chat-filters" role="tablist">
        ${['all', 'businesses', 'people', 'groups', 'sarahs']
          .map(
            (f) =>
              `<button type="button" class="btn btn-secondary btn-sm sarah-chat-filter" data-filter="${f}">${f}</button>`
          )
          .join('')}
      </div>
      <div id="chatsListHost"><p>Loading…</p></div>
    </div>`;

  const listHost = host.querySelector('#chatsListHost');
  let activeFilter = 'all';

  async function loadList() {
    const { conversations } = await fetchChatConversations(activeFilter);
    if (!conversations?.length) {
      listHost.innerHTML =
        '<p class="sarah-empty">No chats yet. Open <strong>Discover</strong> and start a conversation, or message someone on Sarah App.</p>';
      return;
    }
    listHost.innerHTML = conversations
      .map((c) => {
        const kind = c.conversationKind || c.type || 'person_to_business';
        const companyId = c.companyId || '';
        const openKey = companyId || c.id;
        return `
      <button type="button" class="sarah-chat-list-item" data-company-id="${escapeHtml(companyId)}" data-conv-id="${escapeHtml(c.id)}" data-kind="${escapeHtml(kind)}" data-company-name="${escapeHtml(c.displayLabel || c.companyName || openKey)}">
        <span class="sarah-chat-list-title">${escapeHtml(c.displayLabel || c.companyName || openKey)}</span>
        <span class="sarah-chat-list-kind">${escapeHtml(kind.replace(/_/g, ' '))}</span>
        <span class="sarah-chat-list-preview">${escapeHtml(c.preview || 'Tap to open')}</span>
      </button>`;
      })
      .join('');
    listHost.querySelectorAll('.sarah-chat-list-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.kind;
        if (kind !== 'person_to_business' && kind !== 'person to business') {
          listHost.insertAdjacentHTML('beforeend', '<p class="sarah-module-hint">Open this thread type in a future CH4+ slice (listed here for parity).</p>');
          return;
        }
        host.dataset.activeCompany = btn.dataset.companyId;
        host.dataset.activeCompanyName = btn.dataset.companyName;
        renderChats(host);
      });
    });
  }

  host.querySelectorAll('.sarah-chat-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter || 'all';
      host.querySelectorAll('.sarah-chat-filter').forEach((b) => b.classList.toggle('is-active', b === btn));
      loadList().catch((err) => {
        listHost.innerHTML = `<p class="sarah-error">${escapeHtml(err.message)}</p>`;
      });
    });
  });
  host.querySelector('.sarah-chat-filter[data-filter="all"]')?.classList.add('is-active');

  try {
    await loadList();
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
