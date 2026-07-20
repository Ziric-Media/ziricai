/** Inbox state — persisted to localStorage until Firestore sync is live. */

const STORAGE_KEY = 'ziricai-inbox-state';

export const inboxState = {
  conversations: [],
  selectedConversationId: null,
  filter: 'all',
  search: '',
  loading: false,
  /** Per-conversation overrides merged onto server/demo seed */
  overrides: {},
};

export function loadInboxPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.selectedConversationId) inboxState.selectedConversationId = saved.selectedConversationId;
    if (saved.filter) inboxState.filter = saved.filter;
    if (saved.search) inboxState.search = saved.search;
    if (saved.overrides && typeof saved.overrides === 'object') {
      inboxState.overrides = saved.overrides;
    }
  } catch (err) {
    console.warn('[inbox-state] Failed to load persisted state:', err);
  }
}

export function persistInboxState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedConversationId: inboxState.selectedConversationId,
        filter: inboxState.filter,
        search: inboxState.search,
        overrides: inboxState.overrides,
      })
    );
  } catch (err) {
    console.warn('[inbox-state] Failed to persist state:', err);
  }
}

export function setInboxState(patch) {
  Object.assign(inboxState, patch);
  persistInboxState();
}

export function getConversationOverride(id) {
  return inboxState.overrides[id] || {};
}

export function patchConversationOverride(id, patch) {
  inboxState.overrides[id] = {
    ...getConversationOverride(id),
    ...patch,
  };
  persistInboxState();
}

export function mergeConversation(seed) {
  if (!seed) return null;
  const override = getConversationOverride(seed.id);
  const mergedMessages = [
    ...(seed.messages || []),
    ...(override.messages || []),
  ];
  return {
    ...seed,
    ...override,
    messages: mergedMessages,
    mode: override.mode ?? seed.mode ?? 'ai',
    tags: override.tags ?? seed.tags ?? [],
    notes: override.notes ?? seed.notes ?? '',
    unread: override.unread ?? seed.unread ?? false,
    suggestedReply: override.suggestedReply ?? seed.suggestedReply ?? '',
    aiConfidence: override.aiConfidence ?? seed.aiConfidence ?? 90,
    knowledgeUsed: override.knowledgeUsed ?? seed.knowledgeUsed ?? '',
  };
}

export function getSelectedConversation() {
  const id = inboxState.selectedConversationId;
  if (!id) return inboxState.conversations[0] || null;
  return inboxState.conversations.find((c) => c.id === id) || inboxState.conversations[0] || null;
}

export function filterConversations(conversations, { filter, search }) {
  let rows = [...conversations];

  if (filter === 'unread') rows = rows.filter((c) => c.unread);
  else if (filter === 'ai') rows = rows.filter((c) => (c.mode || 'ai') === 'ai' && c.status !== 'human_takeover');
  else if (filter === 'human') rows = rows.filter((c) => (c.mode || 'ai') === 'human' || c.status === 'human_takeover');
  else if (filter === 'assigned') rows = rows.filter((c) => c.assignedTo);

  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    rows = rows.filter(
      (c) =>
        (c.customerName || '').toLowerCase().includes(term) ||
        (c.preview || c.lastMessage || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term)
    );
  }

  return rows;
}

loadInboxPersistedState();
