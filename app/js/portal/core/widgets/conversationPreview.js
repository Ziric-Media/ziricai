import { escapeHtml, conversationBadge } from '../../../admin/ui.js';

/**
 * @param {Array<object>} conversations
 * @param {{ limit?: number, emptyMessage?: string }} [opts]
 */
export function renderConversationPreview(conversations = [], opts = {}) {
  const limit = opts.limit ?? 5;
  const rows = conversations.slice(0, limit);

  if (!rows.length) {
    return `<div class="bos-empty-inline">${escapeHtml(opts.emptyMessage || 'No recent conversations.')}</div>`;
  }

  return `
    <div class="bos-conversation-list">
      ${rows
        .map(
          (c) => `
        <div class="bos-conversation-item" data-nav="conversations" data-conv-id="${escapeHtml(c.id || '')}" role="button" tabindex="0">
          <div class="bos-conversation-avatar ${c.unread ? 'unread' : ''}">
            ${escapeHtml((c.customerName || '?').charAt(0).toUpperCase())}
          </div>
          <div class="bos-conversation-body">
            <div class="bos-conversation-top">
              <span class="bos-conversation-name">${escapeHtml(c.customerName || 'Unknown')}</span>
              <span class="bos-conversation-time">${escapeHtml(c.time || '—')}</span>
            </div>
            <div class="bos-conversation-preview">${escapeHtml(c.preview || c.lastMessage || '')}</div>
            <div class="bos-conversation-meta">
              ${conversationBadge(c.status || 'in_progress')}
              <span class="bos-channel-tag"><i class="fa-brands fa-${escapeHtml(c.channel === 'whatsapp' ? 'whatsapp' : 'comment')}"></i> ${escapeHtml(c.channel || 'chat')}</span>
            </div>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;
}
