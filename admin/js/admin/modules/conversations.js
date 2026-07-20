import { state } from '../state.js';
import { pageHeader, loadingState, showToast } from '../ui.js';
import { withTimeout } from '../utils.js';
import {
  inboxState,
  setInboxState,
  mergeConversation,
  filterConversations,
  getSelectedConversation,
} from '../inbox-state.js';
import {
  listConversations,
  getMessages,
  sendMessage,
  setTakeoverMode,
  setAssignedAgent,
  saveNotes,
  saveTags,
  markConversationRead,
  generateAiReply,
  regenerateSuggestedReply,
} from '../services/conversations.js';
import {
  renderInboxLayout,
  setActiveFilterButton,
  scrollThreadToBottom,
  appendMessageToThread,
  updateAiPanel,
  updateModeUI,
  renderInboxListItem,
  renderThread,
  renderProfilePanel,
} from './inbox-ui.js';

let rootContainer = null;
let aiReplyTimer = null;

export async function renderConversations(container) {
  rootContainer = container;
  container.innerHTML = loadingState('Loading conversations...');

  const companyId = state.selectedCompanyId || null;
  const result = await withTimeout(listConversations(companyId));
  const merged = (result.items || []).map(mergeConversation);

  setInboxState({ conversations: merged });

  if (!inboxState.selectedConversationId && merged.length) {
    setInboxState({ selectedConversationId: merged[0].id });
  } else if (
    inboxState.selectedConversationId &&
    !merged.some((c) => c.id === inboxState.selectedConversationId)
  ) {
    setInboxState({ selectedConversationId: merged[0]?.id || null });
  }

  await paintInbox(container);
}

async function paintInbox(container) {
  const filtered = filterConversations(inboxState.conversations, {
    filter: inboxState.filter,
    search: inboxState.search,
  });

  let selected = getSelectedConversation();
  if (selected && !filtered.some((c) => c.id === selected.id)) {
    selected = filtered[0] || null;
    if (selected) setInboxState({ selectedConversationId: selected.id });
  }

  const messagesRes = selected ? await getMessages(selected.id) : { items: [] };
  if (selected && messagesRes.items?.length) {
    selected = { ...selected, messages: messagesRes.items };
  }

  container.innerHTML = `
    ${pageHeader(
      'Live Conversations',
      'WhatsApp inbox with AI replies and human takeover.',
      `<span class="inbox-source-badge" title="Data source">${getSourceLabel()}</span>`
    )}
    ${renderInboxLayout({
      conversations: filtered,
      selected,
      messages: selected?.messages || [],
      search: inboxState.search,
      activeFilter: inboxState.filter,
    })}
  `;

  setActiveFilterButton(container, inboxState.filter);
  bindInboxEvents(container, filtered, selected);
  scrollThreadToBottom(container);

  if (selected?.unread) {
    await markConversationRead(selected.id);
  }
}

function getSourceLabel() {
  return inboxState.conversations.length ? 'Connected' : 'Demo';
}

function getAgentName() {
  const company = state.companies.find((c) => c.id === getSelectedConversation()?.companyId);
  return company?.agentName || state.profile?.displayName || 'Agent';
}

function bindInboxEvents(container, filtered, selected) {
  container.querySelector('#inboxSearch')?.addEventListener('input', (e) => {
    setInboxState({ search: e.target.value });
    refreshList(container);
  });

  container.querySelectorAll('.inbox-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setInboxState({ filter: btn.dataset.filter || 'all' });
      container.querySelectorAll('.inbox-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      refreshList(container);
    });
  });

  bindListClicks(container, filtered);
  bindThreadEvents(container, selected);
  bindPanelEvents(container, selected);
}

function refreshList(container) {
  const filtered = filterConversations(inboxState.conversations, {
    filter: inboxState.filter,
    search: inboxState.search,
  });
  const selected = getSelectedConversation();
  const list = container.querySelector('#inboxList');
  if (list) {
    list.innerHTML = filtered.length
      ? filtered.map((c) => renderInboxListItem(c, c.id === selected?.id)).join('')
      : '<div class="empty-panel">No conversations match your filters.</div>';
    bindListClicks(container, filtered);
  }
}

function bindListClicks(container, filtered) {
  container.querySelectorAll('.inbox-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      setInboxState({ selectedConversationId: id });
      container.querySelectorAll('.inbox-item').forEach((el) => el.classList.remove('active'));
      btn.classList.remove('unread');
      btn.classList.add('active');

      const conv = inboxState.conversations.find((c) => c.id === id);
      if (!conv) return;

      await markConversationRead(id);
      const messagesRes = await getMessages(id);
      const merged = { ...conv, messages: messagesRes.items || conv.messages || [] };

      const threadEl = container.querySelector('#inboxThread');
      const panelEl = container.querySelector('#inboxProfilePanel');
      if (threadEl) {
        threadEl.outerHTML = renderThread(merged, merged.messages).trim();
      }
      if (panelEl) {
        panelEl.outerHTML = renderProfilePanel(merged).trim();
      }

      bindThreadEvents(container, merged);
      bindPanelEvents(container, merged);
      scrollThreadToBottom(container);
    });
  });
}

function bindThreadEvents(container, conversation) {
  const send = () => handleSend(container, conversation);
  container.querySelector('#sendReplyBtn')?.addEventListener('click', send);
  container.querySelector('#replyInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });

  container.querySelector('#mobileShowProfileBtn')?.addEventListener('click', () => {
    container.querySelector('#inboxProfilePanel')?.classList.toggle('mobile-visible');
  });
}

function bindPanelEvents(container, conversation) {
  if (!conversation) return;

  setAssignedAgent(getAgentName());

  container.querySelector('#openCrmProfileBtn')?.addEventListener('click', () => {
    import('./customers.js').then(({ navigateToCustomer }) => {
      navigateToCustomer(conversation.phone || conversation.customerId || conversation.id);
    });
  });

  const applyMode = async (mode) => {
    await setTakeoverMode(conversation.id, mode);
    syncConversationLocal(conversation.id, { mode, status: mode === 'human' ? 'human_takeover' : 'in_progress' });
    updateModeUI(container, mode);
    showToast(mode === 'human' ? 'Human takeover — AI paused' : 'AI resumed for this conversation', 'info');
    refreshList(container);
  };

  container.querySelector('#takeoverToggleBtn')?.addEventListener('click', () => {
    const next = (getSelectedConversation()?.mode || 'ai') === 'human' ? 'ai' : 'human';
    applyMode(next);
  });

  container.querySelectorAll('#modeControl .segment').forEach((btn) => {
    btn.addEventListener('click', () => applyMode(btn.dataset.mode));
  });

  container.querySelector('#useSuggestedBtn')?.addEventListener('click', () => {
    const input = container.querySelector('#replyInput');
    const text = container.querySelector('#suggestedReplyText')?.textContent?.trim();
    if (input && text && text !== '—') {
      input.value = text;
      input.focus();
    }
  });

  container.querySelector('#generateReplyBtn')?.addEventListener('click', async () => {
    const conv = getSelectedConversation();
    if (!conv) return;
    const ai = await regenerateSuggestedReply(conv.id, conv);
    updateAiPanel(container, ai);
    showToast('Suggested reply regenerated from knowledge context', 'success');
    syncConversationLocal(conv.id, {
      suggestedReply: ai.suggestedReply,
      aiConfidence: ai.confidence,
      knowledgeUsed: ai.knowledgeUsed,
    });
  });

  let notesTimer;
  container.querySelector('#internalNotes')?.addEventListener('input', (e) => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      await saveNotes(conversation.id, e.target.value);
      syncConversationLocal(conversation.id, { notes: e.target.value });
    }, 400);
  });

  container.querySelectorAll('#tagChipRow .tag-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      chip.classList.toggle('active');
      const tags = [...container.querySelectorAll('#tagChipRow .tag-chip.active')].map((c) => c.dataset.tag);
      await saveTags(conversation.id, tags);
      syncConversationLocal(conversation.id, { tags });
      showToast('Tags updated', 'success');
    });
  });
}

function syncConversationLocal(id, patch) {
  const idx = inboxState.conversations.findIndex((c) => c.id === id);
  if (idx === -1) return;
  inboxState.conversations[idx] = { ...inboxState.conversations[idx], ...patch };
  setInboxState({ conversations: [...inboxState.conversations] });
}

async function handleSend(container, conversation) {
  if (!conversation) return;
  const input = container.querySelector('#replyInput');
  const text = input?.value?.trim();
  if (!text) return;

  input.value = '';
  const conv = getSelectedConversation();
  const mode = conv?.mode || 'ai';

  if (mode === 'human') {
    const agentName = getAgentName();
    const res = await sendMessage(conversation.id, text, 'human', { senderName: agentName });
    appendMessageToThread(container, res.message);
    syncConversationLocal(conversation.id, {
      lastMessage: text,
      preview: text.slice(0, 40),
      time: 'Just now',
      messages: [...(conv.messages || []), res.message],
    });
    refreshList(container);
    return;
  }

  const customerRes = await sendMessage(conversation.id, text, 'customer');
  appendMessageToThread(container, customerRes.message);
  syncConversationLocal(conversation.id, {
    lastMessage: text,
    preview: text.slice(0, 40),
    time: 'Just now',
    messages: [...(conv.messages || []), customerRes.message],
  });
  refreshList(container);

  clearTimeout(aiReplyTimer);
  aiReplyTimer = setTimeout(async () => {
    const current = getSelectedConversation();
    if (!current || current.mode === 'human') return;

    const ai = generateAiReply(current, text);
    const aiRes = await sendMessage(conversation.id, ai.message, 'ai');
    appendMessageToThread(container, aiRes.message);
    updateAiPanel(container, ai);
    syncConversationLocal(conversation.id, {
      lastMessage: ai.message,
      preview: ai.message.slice(0, 40),
      suggestedReply: ai.suggestedReply,
      aiConfidence: ai.confidence,
      knowledgeUsed: ai.knowledgeUsed,
      messages: [...(current.messages || []), aiRes.message],
    });
    refreshList(container);
  }, 1200 + Math.random() * 800);
}
