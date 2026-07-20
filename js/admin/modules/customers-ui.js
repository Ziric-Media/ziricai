import { escapeHtml, formatDate, statusBadge } from '../ui.js';

export const CRM_FILTER_TAGS = ['All', 'VIP', 'Hot Lead', 'Finance', 'Sales', 'Support'];

export function sentimentDisplay(customer) {
  const s = customer.sentimentLabel || customer.averageSentiment || 'neutral';
  const emoji = s === 'positive' ? '😊' : s === 'negative' ? '😞' : '😐';
  return `${emoji} ${escapeHtml(String(s).charAt(0).toUpperCase() + String(s).slice(1))}`;
}

export function renderCustomerFilters(activeFilter = 'All') {
  return `
    <div class="crm-filters">
      ${CRM_FILTER_TAGS.map(
        (tag) => `
        <button type="button" class="crm-filter-btn ${activeFilter === tag ? 'active' : ''}" data-filter="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
      `
      ).join('')}
    </div>
  `;
}

export function renderCustomerTableRow(customer) {
  const tags = (customer.tags || [])
    .slice(0, 3)
    .map((t) => `<span class="tag-chip active">${escapeHtml(t)}</span>`)
    .join(' ');
  const presence = customer.online
    ? '<span class="presence online"><span class="dot"></span> Online</span>'
    : `<span class="presence offline">${formatDate(customer.lastSeen)}</span>`;

  return `
    <tr class="crm-row" data-phone="${escapeHtml(customer.phone || customer.id)}">
      <td>
        <button type="button" class="crm-name-link" data-phone="${escapeHtml(customer.phone || customer.id)}">
          <span class="crm-avatar">${escapeHtml((customer.name || '?').charAt(0))}</span>
          ${escapeHtml(customer.name || 'Unknown')}
        </button>
      </td>
      <td>${escapeHtml(customer.phoneDisplay || customer.phone || '—')}</td>
      <td>${escapeHtml(customer.companyName || '—')}</td>
      <td><span class="lead-score">${customer.leadScore ?? '—'}</span></td>
      <td>${sentimentDisplay(customer)}</td>
      <td>${presence}</td>
      <td>${tags || '—'}</td>
      <td>${statusBadge(customer.status || 'in_progress')}</td>
    </tr>
  `;
}

export function renderCustomerListShell({ customers, search, activeFilter, sourceLabel }) {
  return `
    <div class="crm-list-page">
      <div class="table-container">
        <div class="table-toolbar crm-toolbar">
          <div class="search-wrapper">
            <span class="search-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="text" placeholder="Search name, phone, tags..." id="customerSearch" value="${escapeHtml(search)}" />
          </div>
          ${renderCustomerFilters(activeFilter)}
          <span class="crm-source-badge">${escapeHtml(sourceLabel)}</span>
        </div>
        <table class="org-table crm-table">
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Company</th><th>Lead Score</th>
              <th>Sentiment</th><th>Last Seen</th><th>Tags</th><th>Status</th>
            </tr>
          </thead>
          <tbody id="customerTableBody">
            ${customers.length ? customers.map(renderCustomerTableRow).join('') : '<tr><td colspan="8"><div class="empty-panel">No customers match your filters.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function filterCustomers(customers, { search = '', filter = 'All' } = {}) {
  let items = [...customers];
  const q = search.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }
  if (filter && filter !== 'All') {
    items = items.filter((c) => (c.tags || []).some((t) => t.toLowerCase() === filter.toLowerCase()));
  }
  return items;
}

export function renderLeadScoreBreakdown(breakdown = {}, score = 0) {
  const labels = {
    conversationFrequency: 'Conversation Frequency',
    questionsAsked: 'Questions Asked',
    productsViewed: 'Products Viewed',
    positiveSentiment: 'Positive Sentiment',
    purchaseIntent: 'Purchase Intent',
    responseSpeed: 'Response Speed',
  };
  return `
    <div class="crm-score-card profile-card">
      <h3><i class="fa-solid fa-chart-simple"></i> Lead Score Breakdown</h3>
      <div class="crm-score-total">Score: <strong>${score}/100</strong></div>
      <div class="crm-score-bars">
        ${Object.entries(labels)
          .map(([key, label]) => {
            const val = breakdown[key] ?? 0;
            const pct = Math.round((val / 20) * 100);
            return `
              <div class="crm-score-row">
                <span>${escapeHtml(label)}</span>
                <div class="crm-score-bar"><div style="width:${pct}%"></div></div>
                <strong>${val}</strong>
              </div>`;
          })
          .join('')}
      </div>
    </div>
  `;
}

export function renderRecommendationCard(recommendation) {
  if (!recommendation?.action) {
    return '<div class="crm-rec-card profile-card"><p class="panel-hint">No AI recommendation yet.</p></div>';
  }
  return `
    <div class="crm-rec-card profile-card">
      <h3><i class="fa-solid fa-lightbulb"></i> AI Recommendations</h3>
      <p class="crm-rec-action"><strong>Recommended Next Action:</strong> ${escapeHtml(recommendation.action)}</p>
      ${recommendation.reason ? `<p class="panel-hint">${escapeHtml(recommendation.reason)}</p>` : ''}
      <div class="crm-rec-confidence">Confidence: <strong>${recommendation.confidence ?? '—'}%</strong></div>
    </div>
  `;
}

export function timelineIcon(type) {
  const map = {
    created: 'fa-user-plus',
    whatsapp: 'fa-brands fa-whatsapp',
    ai_reply: 'fa-robot',
    knowledge: 'fa-book',
    human_takeover: 'fa-user',
    purchase: 'fa-cart-shopping',
    follow_up: 'fa-bell',
    ai_analysis: 'fa-wand-magic-sparkles',
  };
  return map[type] || 'fa-circle';
}

export function renderTimelineFeed(events = []) {
  if (!events.length) return '<div class="empty-panel">No timeline events yet.</div>';
  return `
    <div class="crm-timeline">
      ${events
        .map(
          (ev) => `
        <div class="crm-timeline-item">
          <div class="crm-timeline-icon"><i class="fa-solid ${timelineIcon(ev.type)}"></i></div>
          <div class="crm-timeline-body">
            <div class="crm-timeline-title">${escapeHtml(ev.title)}</div>
            <div class="crm-timeline-desc">${escapeHtml(ev.description || '')}</div>
            <div class="crm-timeline-time">${formatDate(ev.createdAt)}</div>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

export function renderMessageThread(messages = []) {
  if (!messages.length) {
    return '<div class="empty-panel">No conversation history yet. Messages from WhatsApp will appear here.</div>';
  }
  return `
    <div class="crm-thread">
      ${messages
        .map((m) => {
          const role = m.role || 'customer';
          const cls = role === 'ai' ? 'ai' : role === 'human' ? 'human' : 'customer';
          return `
            <div class="thread-bubble ${cls}">
              <div class="bubble-label">${escapeHtml(role === 'ai' ? 'AI' : role === 'human' ? m.senderName || 'Agent' : 'Customer')}</div>
              <div class="bubble-text">${escapeHtml(m.message || m.content || '')}</div>
              <div class="bubble-time">${escapeHtml(m.time || '')}</div>
            </div>`;
        })
        .join('')}
    </div>
  `;
}
