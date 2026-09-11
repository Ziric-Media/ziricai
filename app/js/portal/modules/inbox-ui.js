import { escapeHtml } from '../../admin/ui.js';

const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  webchat: 'Website Chat',
  email: 'Email',
  sms: 'SMS',
};

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'ai', label: 'AI' },
  { id: 'human', label: 'Human' },
  { id: 'unread', label: 'Unread' },
];

export function computeInboxMetrics(conversations = []) {
  const active = conversations.filter((c) => !['closed', 'resolved'].includes(c.status)).length;
  const waiting = conversations.filter((c) => c.status === 'waiting').length;
  const aiChats = conversations.filter((c) => (c.mode || 'ai') === 'ai' && !c.humanTakeover).length;
  const humanChats = conversations.filter((c) => (c.mode || 'ai') === 'human' || c.humanTakeover).length;
  const unread = conversations.filter((c) => c.unread).length;
  return { active, waiting, aiChats, humanChats, unread };
}

export function filterInboxConversations(conversations, { filter = 'all', search = '' } = {}) {
  let rows = [...conversations];

  if (filter === 'waiting') rows = rows.filter((c) => c.status === 'waiting');
  else if (filter === 'ai') rows = rows.filter((c) => (c.mode || 'ai') === 'ai' && !c.humanTakeover);
  else if (filter === 'human') rows = rows.filter((c) => (c.mode || 'ai') === 'human' || c.humanTakeover);
  else if (filter === 'unread') rows = rows.filter((c) => c.unread);

  const term = search.trim().toLowerCase();
  if (term) {
    rows = rows.filter(
      (c) =>
        (c.customerName || c.name || '').toLowerCase().includes(term) ||
        (c.preview || c.lastMessage || '').toLowerCase().includes(term) ||
        (c.phone || c.id || '').toLowerCase().includes(term)
    );
  }

  return rows;
}

export function maskPhone(phone) {
  if (!phone) return '—';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `${digits.slice(0, 2)}…${digits.slice(-4)}`;
}

export function formatMessageTime(createdAt) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function channelLabel(channel) {
  return CHANNEL_LABELS[channel] || CHANNEL_LABELS.whatsapp;
}

function listSubtitle(conversation) {
  return conversation.preview || conversation.lastMessage || '';
}

function resolveBubbleRole(message) {
  if (message.role === 'customer' || message.role === 'user') return 'customer';
  if (message.role === 'human' || message.source === 'human') return 'human';
  if (message.role === 'ai' || message.source === 'ai') return 'ai';
  return 'customer';
}

export function renderInboxMetrics(metrics) {
  const items = [
    { label: 'Active', value: metrics.active, icon: 'fa-comments', color: 'green' },
    { label: 'Waiting', value: metrics.waiting, icon: 'fa-hourglass-half', color: 'yellow' },
    { label: 'AI', value: metrics.aiChats, icon: 'fa-robot', color: 'green' },
    { label: 'Human', value: metrics.humanChats, icon: 'fa-user-check', color: 'blue' },
    { label: 'Unread', value: metrics.unread, icon: 'fa-envelope', color: 'purple' },
  ].filter((item) => item.value > 0 || ['Active', 'Unread'].includes(item.label));

  if (!items.length) return '';

  return `
    <div class="inbox-metrics-row">
      ${items.map((item) => `
        <div class="inbox-metric-card">
          <div class="inbox-metric-icon ${item.color}"><i class="fa-solid ${item.icon}"></i></div>
          <div class="inbox-metric-body">
            <div class="inbox-metric-label">${item.label}</div>
            <div class="inbox-metric-value">${item.value}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderInboxListItem(conversation, active) {
  const name = conversation.customerName || conversation.name || 'Visitor';
  const subtitle = listSubtitle(conversation);
  const modeLabel = (conversation.mode || 'ai') === 'human' || conversation.humanTakeover ? 'Human' : 'AI';
  const unreadDot = conversation.unread ? '<span class="inbox-unread-dot"></span>' : '';

  return `
    <button class="inbox-item ${active ? 'active' : ''} ${conversation.unread ? 'unread' : ''}" type="button" data-id="${escapeHtml(conversation.id || conversation.phone)}">
      <div class="inbox-item-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>
      <div class="inbox-item-body">
        <div class="inbox-item-top">
          <span class="name">${escapeHtml(name)}${unreadDot}</span>
          <span class="time">${escapeHtml(conversation.time || '—')}</span>
        </div>
        <div class="inbox-item-preview">${escapeHtml(subtitle)}</div>
        <div class="inbox-item-meta">
          <span class="inbox-mode-tag ${modeLabel.toLowerCase()}">${modeLabel}</span>
        </div>
      </div>
    </button>
  `;
}

export function renderMessageBubble(message, aiEmployeeName) {
  const role = resolveBubbleRole(message);
  const cls = role;
  let label = 'Customer';
  if (role === 'ai') label = aiEmployeeName || 'AI Assistant';
  else if (role === 'human') label = message.senderName || 'Staff';

  const text = message.content || message.message || '';
  const timeLabel = formatMessageTime(message.createdAt);

  return `
    <div class="thread-bubble ${cls}" data-role="${escapeHtml(role)}" data-source="${escapeHtml(message.source || role)}">
      <div class="bubble-label">${escapeHtml(label)}</div>
      <div class="bubble-text">${escapeHtml(text)}</div>
      ${timeLabel ? `<div class="bubble-time">${escapeHtml(timeLabel)}</div>` : ''}
    </div>
  `;
}

export function renderInboxThread(conversation, messages, { canReply, aiEmployeeName, threadError, threadLoading }) {
  if (threadLoading) {
    return `
      <div class="inbox-thread" id="inboxThread">
        <div class="inbox-col-header">Conversation</div>
        <div class="empty-panel">Loading messages…</div>
      </div>
    `;
  }

  if (!conversation) {
    return `
      <div class="inbox-thread inbox-thread-empty" id="inboxThread">
        <div class="inbox-col-header">Conversation</div>
        <div class="empty-panel">Select a conversation to view messages.</div>
      </div>
    `;
  }

  const name = conversation.customerName || conversation.name || 'Visitor';
  const channel = channelLabel(conversation.channel || 'whatsapp');
  const human = (conversation.mode || 'ai') === 'human' || conversation.humanTakeover;
  const modeLabel = human ? 'Human' : `AI · ${aiEmployeeName || 'Assistant'}`;
  const channelIcon = conversation.channel === 'whatsapp'
    ? '<i class="fa-brands fa-whatsapp" style="color:#25D366"></i>'
    : '<i class="fa-solid fa-globe"></i>';

  const msgHtml = threadError
    ? `<div class="inbox-thread-error">${escapeHtml(threadError)}</div>`
    : messages.length
      ? messages.map((m) => renderMessageBubble(m, aiEmployeeName)).join('')
      : `<div class="thread-bubble customer"><div class="bubble-text">${escapeHtml(conversation.lastMessage || conversation.preview || 'No messages yet.')}</div></div>`;

  return `
    <div class="inbox-thread" id="inboxThread">
      <div class="inbox-col-header">Conversation</div>
      <div class="thread-header">
        <div class="thread-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>
        <div class="thread-header-info">
          <div class="thread-name">${escapeHtml(name)}</div>
          <div class="thread-sub">${channelIcon} ${escapeHtml(channel)} · ${escapeHtml(modeLabel)}</div>
        </div>
        <div class="thread-header-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="mobileShowProfileBtn" title="Customer context">
            <i class="fa-solid fa-user"></i>
          </button>
        </div>
      </div>
      <div class="thread-messages" id="threadMessages">${msgHtml}</div>
      ${canReply ? `
        <div class="thread-compose portal-inbox-compose">
          <input type="text" id="replyInput" placeholder="Type a message..." autocomplete="off" />
          <button class="btn btn-secondary btn-sm" type="button" id="takeoverBtn">${human ? 'Release to AI' : 'Take over'}</button>
          <button class="btn btn-primary btn-sm" type="button" id="sendReplyBtn">
            <i class="fa-solid fa-paper-plane"></i> Send
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function formatAppointmentLabel(appointment) {
  if (!appointment) return null;
  const when = appointment.scheduledAt
    ? appointment.scheduledAt.slice(0, 16).replace('T', ' ')
    : null;
  const parts = [when, appointment.service, appointment.vehicleLabel].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Scheduled';
}

function renderTimelineEntries(timeline = []) {
  if (!timeline.length) {
    return `<div class="customer-info-value muted">No recent activity</div>`;
  }
  return `
    <ul class="inbox-timeline-list">
      ${timeline.map((entry) => `
        <li class="inbox-timeline-item">
          <div class="inbox-timeline-summary">${escapeHtml(entry.summary || entry.type || 'Activity')}</div>
          ${entry.createdAt ? `<div class="inbox-timeline-time">${escapeHtml(formatMessageTime(entry.createdAt))}</div>` : ''}
        </li>
      `).join('')}
    </ul>
  `;
}

export function renderCustomerContextPanel(conversation, context, { contextError } = {}) {
  if (!conversation) {
    return `
      <aside class="inbox-panel portal-right-panel" id="inboxCustomerPanel">
        <div class="inbox-col-header">Customer</div>
        <div class="customer-info-empty">Select a conversation to view customer details.</div>
      </aside>
    `;
  }

  if (contextError) {
    return `
      <aside class="inbox-panel portal-right-panel" id="inboxCustomerPanel">
        <div class="inbox-col-header">Customer</div>
        <div class="inbox-context-error">
          <p>Customer context unavailable.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="retryContextBtn">Retry</button>
        </div>
      </aside>
    `;
  }

  const customer = context?.customer || null;
  const aiEmployee = context?.aiEmployee || null;
  const appointment = context?.nextUpcomingAppointment || null;
  const timeline = context?.timeline || [];

  const name = customer?.name || conversation.customerName || conversation.name || 'Visitor';
  const phone = customer?.phoneDisplay || customer?.phone || conversation.phone || '—';
  const leadScore = customer?.leadScore ?? null;
  const tags = customer?.tags || [];
  const vehicle = customer?.vehicleInterest || null;
  const aiName = aiEmployee?.name || null;
  const aiRole = aiEmployee?.role || null;
  const appointmentText = formatAppointmentLabel(appointment);

  return `
    <aside class="inbox-panel portal-right-panel" id="inboxCustomerPanel">
      <div class="inbox-col-header">Customer</div>
      <div class="portal-customer-panel">
        <div class="customer-info-card">
          <h3 class="customer-info-name">${escapeHtml(name)}</h3>
          <div class="customer-info-phone">${escapeHtml(maskPhone(phone))}</div>
        </div>

        <div class="customer-info-section">
          <div class="customer-info-label">Lead Score</div>
          <div class="customer-info-row">
            <span class="lead-score">${leadScore ?? '—'}</span>
          </div>
        </div>

        ${tags.length ? `
          <div class="customer-info-section">
            <div class="customer-info-label">Tags</div>
            <div class="customer-info-value">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ') || '—'}</div>
          </div>
        ` : ''}

        <div class="customer-info-section">
          <div class="customer-info-label">Vehicle Interest</div>
          <div class="customer-info-value">${vehicle ? escapeHtml(vehicle) : '—'}</div>
        </div>

        <div class="customer-info-section">
          <div class="customer-info-label">AI Employee</div>
          <div class="customer-info-value">${aiName ? escapeHtml(aiName) : '—'}${aiRole ? ` <span class="muted">(${escapeHtml(aiRole)})</span>` : ''}</div>
        </div>

        <div class="customer-info-section">
          <div class="customer-info-label">Next Appointment</div>
          <div class="customer-info-value">${appointmentText ? escapeHtml(appointmentText) : '—'}</div>
        </div>

        <div class="customer-info-section">
          <div class="customer-info-label">Timeline</div>
          ${renderTimelineEntries(timeline)}
        </div>

        <button type="button" class="btn btn-primary btn-sm btn-block" id="openInCrmBtn" style="margin-top:12px;">
          <i class="fa-solid fa-address-book"></i> Open in CRM
        </button>
      </div>
    </aside>
  `;
}

export function renderInboxLayout({
  conversations,
  selected,
  messages,
  context,
  contextError,
  filter,
  search,
  canReply,
  aiEmployeeName,
  threadError,
  threadLoading,
}) {
  const listHtml = conversations.length
    ? conversations.map((c) => renderInboxListItem(c, (c.id || c.phone) === (selected?.id || selected?.phone))).join('')
    : '<div class="empty-panel">No conversations match your filters.</div>';

  return `
    <div class="inbox-layout inbox-layout-3col portal-inbox-layout" id="inboxLayout">
      <div class="inbox-list-col">
        <div class="inbox-col-header">Conversations</div>
        <div class="portal-inbox-list-toolbar">
          <div class="search-wrapper inbox-search">
            <span class="search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="text" placeholder="Search..." id="inboxSearch" value="${escapeHtml(search || '')}" />
          </div>
          <div class="inbox-filters portal-inbox-filters" id="inboxFilters">
            ${FILTER_OPTIONS.map((f) => `
              <button type="button" class="inbox-filter-btn ${filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="inbox-list" id="inboxList">${listHtml}</div>
      </div>
      ${renderInboxThread(selected, messages, { canReply, aiEmployeeName, threadError, threadLoading })}
      ${renderCustomerContextPanel(selected, context, { contextError })}
    </div>
  `;
}

export function renderInboxPage({ metrics, layoutHtml, unreadCount }) {
  return `
    <div class="portal-inbox-page">
      <div class="page-header portal-inbox-header">
        <div class="title-section">
          <h1><i class="fa-solid fa-inbox" style="color:#25D366;margin-right:8px;"></i> Inbox</h1>
          <div class="subtitle">AI + human customer communications</div>
        </div>
        ${unreadCount ? `<div class="actions"><span class="ops-tag">${unreadCount} unread</span></div>` : ''}
      </div>
      ${renderInboxMetrics(metrics)}
      ${layoutHtml}
    </div>
  `;
}

export function scrollThreadToBottom(container) {
  const el = container.querySelector('#threadMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

export function setActiveFilterButton(container, filter) {
  container.querySelectorAll('.inbox-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
}

export function conversationPhone(conversation) {
  if (!conversation) return null;
  if (conversation.phone) return conversation.phone;
  const id = String(conversation.id || conversation.customerId || '');
  if (id.includes('::')) return id.split('::').slice(1).join('::');
  return id || null;
}

export { FILTER_OPTIONS };
