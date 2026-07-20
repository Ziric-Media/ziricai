import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, emptyState, loadingState, statusBadge } from '../../admin/ui.js';
import { can } from '../permissions.js';
import { fetchTenantConversations, fetchConversationDetail, sendConversationReply } from '../api.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { invalidateHub } from '../core/dataService.js';

const CHANNEL_BADGE = {
  whatsapp: { icon: 'fa-brands fa-whatsapp', cls: 'green', label: 'WhatsApp' },
  facebook: { icon: 'fa-brands fa-facebook', cls: 'blue', label: 'Facebook' },
  instagram: { icon: 'fa-brands fa-instagram', cls: 'purple', label: 'Instagram' },
  telegram: { icon: 'fa-brands fa-telegram', cls: 'blue', label: 'Telegram' },
  webchat: { icon: 'fa-comments', cls: 'purple', label: 'Web' },
  email: { icon: 'fa-envelope', cls: 'yellow', label: 'Email' },
  sms: { icon: 'fa-mobile-screen', cls: 'grey', label: 'SMS' },
};

function channelBadge(channel) {
  const meta = CHANNEL_BADGE[channel] || CHANNEL_BADGE.whatsapp;
  return `<span class="channel-badge ${meta.cls}"><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>`;
}

export async function renderConversations(container) {
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = emptyState('You do not have permission to view the inbox.');
    return;
  }

  container.innerHTML = loadingState('Loading unified inbox...');
  const companyId = state.companyId;
  const canReply = state.permissions.canReply;

  const apiRes = await fetchTenantConversations(companyId);
  let conversations = apiRes.data?.items || [];
  const useDemo = shouldUseDemoFallback({ companyId, isDemo: state.hubData?.isDemo, isProvisioned: state.hubData?.isProvisioned });

  if (!conversations.length && useDemo && state.hubData?.recentConversations?.length) {
    conversations = state.hubData.recentConversations;
  }

  if (apiRes.error && !conversations.length && !useDemo) {
    container.innerHTML = `${pageHeader('Unified Inbox', 'All channels in one place.')}
      ${renderEmptyState({ message: apiRes.error, actionHtml: '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>' })}`;
    return;
  }

  container.innerHTML = `
    ${pageHeader(
      'Unified Inbox',
      `All channels in one place — ${escapeHtml(state.company?.name || 'your company')}.`,
      apiRes.data?.unreadCount
        ? `<span class="ops-tag">${apiRes.data.unreadCount} unread</span>`
        : `<span class="demo-badge muted">All channels</span>`
    )}
    <div class="inbox-layout portal-inbox">
      <div class="inbox-list">
        ${conversations.length
          ? conversations.map((c, i) => inboxItem(c, i === 0)).join('')
          : renderEmptyState({ message: 'No conversations yet.', actionHtml: '<button class="btn btn-primary btn-sm" type="button" data-nav="integrations">Connect WhatsApp</button>' })}
      </div>
      <div class="inbox-thread" id="inboxThread">
        ${conversations[0] ? threadView(conversations[0], canReply, []) : emptyState('Select a conversation')}
      </div>
    </div>
  `;

  let activeId = conversations[0]?.id;

  async function loadThread(conv) {
    const thread = container.querySelector('#inboxThread');
    if (!thread || !conv) return;
    thread.innerHTML = loadingState('Loading messages...');
    const detail = await fetchConversationDetail(companyId, conv.id || conv.phone);
    const messages = detail.data?.messages || [];
    thread.innerHTML = threadView(conv, canReply, messages);
    bindThreadActions(conv);
  }

  function bindThreadActions(conv) {
    const form = container.querySelector('#replyForm');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name="text"]');
      const text = input?.value?.trim();
      if (!text) return;
      await sendConversationReply(companyId, conv.id || conv.phone, { text, channel: conv.channel });
      input.value = '';
      invalidateHub();
      loadThread(conv);
    });
    container.querySelector('#takeoverBtn')?.addEventListener('click', async () => {
      await fetch(`/api/companies/${encodeURIComponent(companyId)}/conversations/${encodeURIComponent(conv.id || conv.phone)}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      loadThread(conv);
    });
  }

  container.querySelectorAll('.inbox-item').forEach((el) => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.inbox-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      activeId = el.dataset.id;
      const conv = conversations.find((c) => (c.id || c.phone) === activeId);
      loadThread(conv);
    });
  });

  if (conversations[0]) loadThread(conversations[0]);
}

function inboxItem(c, active) {
  const ch = c.channel || 'whatsapp';
  return `
    <div class="inbox-item ${active ? 'active' : ''} ${c.unread ? 'unread' : ''}" data-id="${escapeHtml(c.id || c.phone)}">
      <div class="inbox-item-top">
        <span class="inbox-name">${escapeHtml(c.customerName || c.name)}</span>
        <span class="inbox-time">${escapeHtml(c.time || '—')}</span>
      </div>
      <div class="inbox-preview">${escapeHtml(c.lastMessage || c.preview || '')}</div>
      <div class="inbox-meta">${channelBadge(ch)} ${statusBadge(c.status)}</div>
    </div>`;
}

function threadView(conv, canReply, messages) {
  const msgHtml = messages.length
    ? messages.map((m) => `
        <div class="message ${m.role === 'customer' || m.role === 'user' ? 'customer' : 'agent'}">
          ${escapeHtml(m.content || m.message || '')}
        </div>`).join('')
    : `<div class="message customer">${escapeHtml(conv.lastMessage || conv.preview || 'No messages yet.')}</div>`;

  return `
    <div class="thread-header">
      <h3>${escapeHtml(conv.customerName || conv.name)}</h3>
      ${channelBadge(conv.channel || 'whatsapp')}
      ${statusBadge(conv.status)}
      ${conv.humanTakeover ? '<span class="ops-tag">Human takeover</span>' : ''}
    </div>
    <div class="thread-messages">${msgHtml}</div>
    ${canReply ? `
      <div class="thread-compose">
        <form id="replyForm">
          <input type="text" name="text" placeholder="Type a reply…" />
          <button class="btn btn-primary btn-sm" type="submit">Send</button>
          <button class="btn btn-secondary btn-sm" type="button" id="takeoverBtn">Take over</button>
        </form>
      </div>` : ''}
  `;
}
