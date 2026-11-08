import {
  fetchChatConversations,
  fetchCompanyMessages,
  sendCompanyMessage,
  requestHumanHandover,
  fetchPersonMessages,
  sendPersonMessage,
  fetchGroupMessages,
  sendGroupMessage,
  fetchNetworkMessages,
} from '../companyChat.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeConversationKind(kind) {
  return String(kind || 'person_to_business')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function isBusinessKind(kind) {
  return normalizeConversationKind(kind) === 'person_to_business';
}

function clearActiveThread(host) {
  host.dataset.activeThreadKind = '';
  host.dataset.activeConvId = '';
  host.dataset.activeThreadTitle = '';
  host.dataset.activeCompany = '';
  host.dataset.activeCompanyName = '';
}

function activeThreadKind(host) {
  if (host.dataset.activeThreadKind) return normalizeConversationKind(host.dataset.activeThreadKind);
  if (host.dataset.activeCompany) return 'person_to_business';
  return '';
}

function hasActiveThread(host) {
  const kind = activeThreadKind(host);
  if (!kind) return false;
  if (isBusinessKind(kind)) return Boolean(host.dataset.activeCompany);
  return Boolean(host.dataset.activeConvId);
}

function handoverBadge(state) {
  if (!state || state === 'ai_active' || state === 'ai_active_again') return 'Company Sarah';
  if (state === 'human_requested') return 'Human requested';
  if (state === 'human_active' || state === 'human_assigned') return 'Human team';
  return state.replace(/_/g, ' ');
}

function threadHint(kind, conversation = {}) {
  const k = normalizeConversationKind(kind);
  if (isBusinessKind(k)) {
    return `${handoverBadge(conversation.ownershipState || 'ai_active')} · ${escapeHtml(conversation.companyId || '')}`;
  }
  if (k === 'person_to_person') return 'Direct message';
  if (k === 'group_personal') return 'Group chat';
  if (k === 'ai_to_ai') return 'Sarah Network · read-only transcript';
  return k.replace(/_/g, ' ');
}

async function loadActiveThread(host) {
  const kind = activeThreadKind(host);
  const title = host.dataset.activeThreadTitle || host.dataset.activeCompanyName || '';

  if (isBusinessKind(kind)) {
    const companyId = host.dataset.activeCompany || '';
    const data = await fetchCompanyMessages(companyId);
    return {
      kind,
      threadId: companyId,
      title: data.conversation?.companyName || title || companyId,
      messages: data.messages || [],
      conversation: data.conversation || {},
    };
  }

  const convId = host.dataset.activeConvId || '';
  if (kind === 'person_to_person') {
    const data = await fetchPersonMessages(convId);
    return {
      kind,
      threadId: convId,
      title: data.conversation?.peerDisplayName || data.conversation?.peerPersonId || title || convId,
      messages: data.messages || [],
      conversation: data.conversation || {},
    };
  }
  if (kind === 'group_personal') {
    const data = await fetchGroupMessages(convId);
    return {
      kind,
      threadId: convId,
      title: data.conversation?.title || title || 'Group',
      messages: data.messages || [],
      conversation: data.conversation || {},
    };
  }
  if (kind === 'ai_to_ai') {
    const data = await fetchNetworkMessages(convId);
    return {
      kind,
      threadId: convId,
      title: data.conversation?.companyName || data.conversation?.companyId || title || 'Sarah Network',
      messages: data.messages || [],
      conversation: data.conversation || {},
    };
  }

  throw new Error('Unsupported conversation type.');
}

async function sendActiveThreadMessage(host, text) {
  const kind = activeThreadKind(host);
  if (isBusinessKind(kind)) {
    return sendCompanyMessage(host.dataset.activeCompany, text);
  }
  const convId = host.dataset.activeConvId || '';
  if (kind === 'person_to_person') return sendPersonMessage(convId, text);
  if (kind === 'group_personal') return sendGroupMessage(convId, text);
  throw new Error('This thread cannot accept messages yet.');
}

function renderThread(host, kind, title, messages, conversation = {}) {
  const business = isBusinessKind(kind);
  const readOnly = normalizeConversationKind(kind) === 'ai_to_ai';
  host.innerHTML = `
    <div class="sarah-chat-module">
      <button type="button" class="sarah-back-link" id="chatsBack">← All chats</button>
      <h2>${escapeHtml(title)}</h2>
      <p class="sarah-module-hint">${threadHint(kind, conversation)}</p>
      ${business ? '<button type="button" class="btn btn-secondary btn-sm" id="requestHumanBtn">Request a human</button>' : ''}
      <div class="sarah-chat-messages" role="log" aria-live="polite"></div>
      ${
        readOnly
          ? '<p class="sarah-module-hint">Sarah Network enquiry transcript. Follow-up arrives after network requests complete.</p>'
          : `<form class="sarah-chat-compose" id="companyChatForm">
        <input type="text" id="companyChatInput" placeholder="Message ${escapeHtml(title)}…" autocomplete="off" />
        <button type="submit" class="btn btn-primary">Send</button>
      </form>`
      }
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
    clearActiveThread(host);
    renderChats(host);
  });

  if (business) {
    host.querySelector('#requestHumanBtn')?.addEventListener('click', async () => {
      try {
        await requestHumanHandover(conversation.companyId || host.dataset.activeCompany);
        const data = await loadActiveThread(host);
        renderThread(host, data.kind, data.title, data.messages, data.conversation);
      } catch (err) {
        alert(err.message || 'Request failed');
      }
    });
  }

  const form = host.querySelector('#companyChatForm');
  const input = host.querySelector('#companyChatInput');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    try {
      const res = await sendActiveThreadMessage(host, text);
      const data = await loadActiveThread(host);
      renderThread(
        host,
        data.kind,
        data.title,
        res.messages || data.messages,
        res.conversation || data.conversation
      );
    } catch (err) {
      alert(err.message || 'Send failed');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}

function openThreadFromIndex(host, { kind, convId, companyId, title }) {
  const normalized = normalizeConversationKind(kind);
  host.dataset.activeThreadKind = normalized;
  host.dataset.activeThreadTitle = title || '';
  if (isBusinessKind(normalized)) {
    host.dataset.activeCompany = companyId || '';
    host.dataset.activeCompanyName = title || companyId || '';
    host.dataset.activeConvId = '';
  } else {
    host.dataset.activeCompany = '';
    host.dataset.activeCompanyName = '';
    host.dataset.activeConvId = convId || '';
  }
  renderChats(host);
}

export async function renderChats(host) {
  if (hasActiveThread(host)) {
    try {
      const data = await loadActiveThread(host);
      renderThread(host, data.kind, data.title, data.messages, data.conversation);
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
        const kind = normalizeConversationKind(c.conversationKind || c.type || 'person_to_business');
        const companyId = c.companyId || '';
        const convId = c.id || '';
        const title = c.displayLabel || c.companyName || c.title || companyId || convId;
        return `
      <button type="button" class="sarah-chat-list-item" data-company-id="${escapeHtml(companyId)}" data-conv-id="${escapeHtml(convId)}" data-kind="${escapeHtml(kind)}" data-company-name="${escapeHtml(title)}">
        <span class="sarah-chat-list-title">${escapeHtml(title)}</span>
        <span class="sarah-chat-list-kind">${escapeHtml(kind.replace(/_/g, ' '))}</span>
        <span class="sarah-chat-list-preview">${escapeHtml(c.preview || 'Tap to open')}</span>
      </button>`;
      })
      .join('');
    listHost.querySelectorAll('.sarah-chat-list-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        openThreadFromIndex(host, {
          kind: btn.dataset.kind,
          convId: btn.dataset.convId,
          companyId: btn.dataset.companyId,
          title: btn.dataset.companyName,
        });
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
  openThreadFromIndex(host, {
    kind: 'person_to_business',
    companyId,
    title: companyName || companyId,
  });
}
