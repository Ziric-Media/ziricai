import { escapeHtml, conversationBadge } from '../ui.js';
import { DEMO_INBOX_TAG_OPTIONS } from '../demo-data.js';

export function renderInboxToolbar(search = '') {
  return `
    <div class="inbox-toolbar">
      <div class="search-wrapper inbox-search">
        <span class="search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="text" placeholder="Search conversations..." id="inboxSearch" value="${escapeHtml(search)}" />
      </div>
      <div class="inbox-filters" id="inboxFilters">
        <button type="button" class="inbox-filter-btn" data-filter="all">All</button>
        <button type="button" class="inbox-filter-btn" data-filter="unread">Unread</button>
        <button type="button" class="inbox-filter-btn" data-filter="ai">AI Only</button>
        <button type="button" class="inbox-filter-btn" data-filter="human">Human</button>
        <button type="button" class="inbox-filter-btn" data-filter="assigned">Assigned</button>
      </div>
    </div>
  `;
}

export function renderPresence(conversation) {
  if (conversation.online) {
    return '<span class="presence online"><span class="dot"></span> Online</span>';
  }
  const mins = conversation.lastSeenMinutes;
  if (mins != null) {
    return `<span class="presence offline">Last seen ${mins} min ago</span>`;
  }
  return `<span class="presence offline">${escapeHtml(conversation.time || '—')}</span>`;
}

export function renderInboxListItem(conversation, active) {
  const unreadDot = conversation.unread ? '<span class="inbox-unread-dot"></span>' : '';
  return `
    <button class="inbox-item ${active ? 'active' : ''} ${conversation.unread ? 'unread' : ''}" type="button" data-id="${escapeHtml(conversation.id)}">
      <div class="inbox-item-avatar">${escapeHtml((conversation.customerName || '?').charAt(0))}</div>
      <div class="inbox-item-body">
        <div class="inbox-item-top">
          <span class="name">${escapeHtml(conversation.customerName || 'Customer')}${unreadDot}</span>
          <span class="time">${escapeHtml(conversation.time || '—')}</span>
        </div>
        <div class="inbox-item-presence">${renderPresence(conversation)}</div>
        <div class="inbox-item-preview">${escapeHtml(conversation.preview || conversation.lastMessage || '')}</div>
        <div class="inbox-item-meta">${conversationBadge(conversation.status)}</div>
      </div>
    </button>
  `;
}

export function renderMessageBubble(message) {
  const role = message.role || 'customer';
  const cls = role === 'ai' ? 'ai' : role === 'human' ? 'human' : 'customer';
  let label = 'Customer';
  if (role === 'ai') label = 'AI';
  else if (role === 'human') label = message.senderName || 'Agent';

  return `
    <div class="thread-bubble ${cls}" data-msg-id="${escapeHtml(message.id || '')}">
      <div class="bubble-label">${escapeHtml(label)}</div>
      <div class="bubble-text">${escapeHtml(message.message)}</div>
      <div class="bubble-time">${escapeHtml(message.time || '')}</div>
    </div>
  `;
}

export function renderThread(conversation, messages) {
  if (!conversation) {
    return `
      <div class="inbox-thread inbox-thread-empty">
        <div class="empty-panel">Select a conversation to view messages.</div>
      </div>
    `;
  }

  const mode = conversation.mode || 'ai';
  const channelIcon = conversation.channel === 'whatsapp'
    ? '<i class="fa-brands fa-whatsapp" style="color:#25D366"></i>'
    : '<i class="fa-solid fa-comment"></i>';

  return `
    <div class="inbox-thread" id="inboxThread">
      <div class="thread-header">
        <div class="thread-avatar">${escapeHtml((conversation.customerName || '?').charAt(0))}</div>
        <div class="thread-header-info">
          <div class="thread-name">${escapeHtml(conversation.customerName || 'Customer')}</div>
          <div class="thread-sub">${channelIcon} WhatsApp · ${conversationBadge(conversation.status)} · <span class="mode-pill ${mode}">${mode === 'human' ? 'Human' : 'AI'} mode</span></div>
        </div>
        <div class="thread-header-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="mobileShowProfileBtn" title="Customer profile">
            <i class="fa-solid fa-user"></i>
          </button>
        </div>
      </div>
      <div class="thread-messages" id="threadMessages">
        ${(messages || []).map(renderMessageBubble).join('')}
      </div>
      <div class="thread-compose">
        <input type="text" id="replyInput" placeholder="${mode === 'human' ? 'Reply as agent...' : 'Type a message (AI will respond)...'}" autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="button" id="sendReplyBtn" title="Send">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `;
}

export function renderProfilePanel(conversation) {
  if (!conversation) {
    return `
      <aside class="inbox-panel inbox-panel-empty">
        <div class="empty-panel">Select a conversation to view customer details.</div>
      </aside>
    `;
  }

  const tags = conversation.tags || [];

  return `
    <aside class="inbox-panel" id="inboxProfilePanel">
      <div class="panel-section">
        <h3><i class="fa-solid fa-user"></i> Customer Profile</h3>
        <button type="button" class="btn btn-primary btn-sm btn-block" id="openCrmProfileBtn" style="margin-bottom:12px;">
          <i class="fa-solid fa-address-card"></i> View Full CRM Profile
        </button>
        <dl class="profile-dl">
          <dt>Name</dt><dd>${escapeHtml(conversation.customerName)}</dd>
          <dt>Phone</dt><dd>${escapeHtml(conversation.phone || '—')}</dd>
          <dt>Company</dt><dd>${escapeHtml(conversation.companyName || '—')}</dd>
          <dt>Tags</dt><dd>${tags.length ? tags.map((t) => `<span class="tag-chip active">${escapeHtml(t)}</span>`).join(' ') : '—'}</dd>
          <dt>Lead Score</dt><dd><span class="lead-score">${conversation.leadScore ?? '—'}</span></dd>
          <dt>Last Order</dt><dd>${escapeHtml(conversation.lastOrder || '—')}</dd>
          <dt>Conversations</dt><dd>${conversation.conversationCount ?? '—'}</dd>
          <dt>Last Purchase</dt><dd>${escapeHtml(conversation.lastPurchase || '—')}</dd>
        </dl>
      </div>

      <div class="panel-section ai-panel">
        <h3><i class="fa-solid fa-wand-magic-sparkles"></i> AI Assistant</h3>
        <div class="ai-stat-row">
          <span>AI Confidence</span>
          <strong id="aiConfidenceVal">${conversation.aiConfidence ?? 90}%</strong>
        </div>
        <div class="ai-stat-row">
          <span>Knowledge Used</span>
          <strong id="knowledgeUsedVal">${escapeHtml(conversation.knowledgeUsed || '—')}</strong>
        </div>
        <div class="suggested-reply-box">
          <label>Suggested Reply</label>
          <p id="suggestedReplyText">${escapeHtml(conversation.suggestedReply || '—')}</p>
          <button type="button" class="btn btn-secondary btn-sm btn-block" id="useSuggestedBtn">
            <i class="fa-solid fa-reply"></i> Use Suggested Reply
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-block" id="generateReplyBtn">
            <i class="fa-solid fa-arrows-rotate"></i> Generate Better Reply
          </button>
        </div>
        <div class="mode-toggle-row">
          <span>Mode</span>
          <div class="segmented-control" id="modeControl">
            <button type="button" class="segment ${(conversation.mode || 'ai') === 'ai' ? 'active' : ''}" data-mode="ai">AI</button>
            <button type="button" class="segment ${conversation.mode === 'human' ? 'active' : ''}" data-mode="human">Human</button>
          </div>
        </div>
        <button type="button" class="btn ${conversation.mode === 'human' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block" id="takeoverToggleBtn">
          <i class="fa-solid ${conversation.mode === 'human' ? 'fa-robot' : 'fa-user'}"></i>
          ${conversation.mode === 'human' ? 'Resume AI' : 'Take Over'}
        </button>
      </div>

      <div class="panel-section">
        <h3><i class="fa-solid fa-note-sticky"></i> Internal Notes</h3>
        <p class="panel-hint">Invisible to customer</p>
        <textarea id="internalNotes" rows="3" placeholder="Customer wants financing. Call tomorrow.">${escapeHtml(conversation.notes || '')}</textarea>
      </div>

      <div class="panel-section">
        <h3><i class="fa-solid fa-tags"></i> Tags</h3>
        <div class="tag-chip-row" id="tagChipRow">
          ${DEMO_INBOX_TAG_OPTIONS.map((tag) => `
            <button type="button" class="tag-chip ${tags.includes(tag) ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
          `).join('')}
        </div>
      </div>

      <div class="panel-section">
        <h3><i class="fa-solid fa-paperclip"></i> Attachments</h3>
        <div class="attachment-grid">
          <div class="attachment-placeholder"><i class="fa-solid fa-file-pdf"></i> PDF</div>
          <div class="attachment-placeholder"><i class="fa-solid fa-image"></i> Images</div>
          <div class="attachment-placeholder"><i class="fa-solid fa-video"></i> Videos</div>
          <div class="attachment-placeholder"><i class="fa-solid fa-microphone"></i> Voice Notes</div>
          <div class="attachment-placeholder"><i class="fa-solid fa-file-lines"></i> Documents</div>
          <div class="attachment-placeholder"><i class="fa-solid fa-location-dot"></i> Location</div>
        </div>
      </div>
    </aside>
  `;
}

export function renderInboxLayout({ conversations, selected, messages, search, activeFilter }) {
  const listHtml = conversations.length
    ? conversations.map((c) => renderInboxListItem(c, c.id === selected?.id)).join('')
    : '<div class="empty-panel">No conversations match your filters.</div>';

  return `
    <div class="inbox-page">
      ${renderInboxToolbar(search)}
      <div class="inbox-layout inbox-layout-3col" id="inboxLayout">
        <div class="inbox-list-col">
          <div class="inbox-list" id="inboxList">${listHtml}</div>
        </div>
        ${renderThread(selected, messages)}
        ${renderProfilePanel(selected)}
      </div>
    </div>
  `;
}

export function setActiveFilterButton(container, filter) {
  container.querySelectorAll('.inbox-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
}

export function scrollThreadToBottom(container) {
  const el = container.querySelector('#threadMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

export function appendMessageToThread(container, message) {
  const el = container.querySelector('#threadMessages');
  if (!el) return;
  el.insertAdjacentHTML('beforeend', renderMessageBubble(message));
  scrollThreadToBottom(container);
}

export function updateAiPanel(container, { aiConfidence, knowledgeUsed, suggestedReply }) {
  const conf = container.querySelector('#aiConfidenceVal');
  const know = container.querySelector('#knowledgeUsedVal');
  const sug = container.querySelector('#suggestedReplyText');
  if (conf && aiConfidence != null) conf.textContent = `${aiConfidence}%`;
  if (know && knowledgeUsed) know.textContent = knowledgeUsed;
  if (sug && suggestedReply) sug.textContent = suggestedReply;
}

export function updateModeUI(container, mode) {
  container.querySelectorAll('#modeControl .segment').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const takeoverBtn = container.querySelector('#takeoverToggleBtn');
  const input = container.querySelector('#replyInput');
  if (takeoverBtn) {
    takeoverBtn.className = `btn ${mode === 'human' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block`;
    takeoverBtn.innerHTML = `<i class="fa-solid ${mode === 'human' ? 'fa-robot' : 'fa-user'}"></i> ${mode === 'human' ? 'Resume AI' : 'Take Over'}`;
  }
  if (input) {
    input.placeholder = mode === 'human' ? 'Reply as agent...' : 'Type a message (AI will respond)...';
  }
  const modePill = container.querySelector('.mode-pill');
  if (modePill) {
    modePill.className = `mode-pill ${mode}`;
    modePill.textContent = mode === 'human' ? 'Human mode' : 'AI mode';
  }
}
