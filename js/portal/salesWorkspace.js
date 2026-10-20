/**
 * Sarah Sales — multi-channel inbox workspaces (overview + channel views).
 */
import { escapeHtml, pageHeader } from '../admin/ui.js';
import {
  renderSarahHorizontalNav,
  renderSwKpiGrid,
  renderDonutChart,
  renderBarChart,
  renderSwChartCard,
  renderSwOverviewQuad,
  renderSparkBars,
  renderSarahWorkspaceChatShell,
} from './sarahWorkspaceUi.js';
import { computeInboxMetrics } from './modules/inbox-ui.js';

export const SALES_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
  { id: 'sarah', label: 'Sarah', sarah: true },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { id: 'email', label: 'Email', icon: 'fa-envelope' },
  { id: 'messenger', label: 'Facebook Messenger', icon: 'fa-brands fa-facebook-messenger' },
  { id: 'webchat', label: 'Website Live', icon: 'fa-globe' },
];

export const SALES_CHANNEL_GROUPS = {
  whatsapp: new Set(['whatsapp']),
  email: new Set(['email']),
  messenger: new Set(['facebook', 'messenger', 'facebook_messenger', 'instagram']),
  webchat: new Set(['webchat', 'website', 'website_chat', 'web', 'livechat']),
};

const CHANNEL_COLORS = {
  whatsapp: '#25D366',
  email: '#6366f1',
  messenger: '#0084ff',
  webchat: '#0ea5e9',
};

export function conversationSalesChannel(conv) {
  const raw = String(conv?.channel || 'whatsapp').toLowerCase();
  for (const [key, set] of Object.entries(SALES_CHANNEL_GROUPS)) {
    if (set.has(raw)) return key;
  }
  return 'whatsapp';
}

export function filterConversationsForSalesSection(conversations, section) {
  if (!section || section === 'overview') return conversations;
  return conversations.filter((c) => conversationSalesChannel(c) === section);
}

export function computeSalesChannelStats(conversations = []) {
  const counts = { whatsapp: 0, email: 0, messenger: 0, webchat: 0 };
  let unread = 0;
  let active = 0;
  for (const c of conversations) {
    const ch = conversationSalesChannel(c);
    counts[ch] = (counts[ch] || 0) + 1;
    if (c.unread) unread++;
    if (!['closed', 'resolved'].includes(String(c.status || '').toLowerCase())) active++;
  }
  return { ...counts, unread, active, total: conversations.length };
}

export function salesSectionMeta(section) {
  const map = {
    overview: { title: 'Overview', subtitle: 'Sarah Sales performance across channels' },
    sarah: { title: 'Sarah', subtitle: 'Sales assistant — quotes, leads, and channel guidance' },
    whatsapp: { title: 'WhatsApp', subtitle: 'Live and AI-assisted WhatsApp conversations' },
    email: { title: 'Email', subtitle: 'Sales inbox — email threads handled by Sarah' },
    messenger: { title: 'Facebook Messenger', subtitle: 'Messenger threads routed to Sarah Sales' },
    webchat: { title: 'Website Live', subtitle: 'Website live chat sessions' },
  };
  return map[section] || map.overview;
}

export function renderSalesOverview(conversations) {
  const stats = computeSalesChannelStats(conversations);
  const metrics = computeInboxMetrics(conversations);
  const trend = [
    Math.max(1, stats.total - 2),
    Math.max(1, stats.total - 1),
    stats.total,
    Math.max(0, metrics.active),
    metrics.waiting,
    metrics.unread,
    stats.total,
  ];
  const quad = renderSwOverviewQuad(
    [
      renderSwChartCard(
        'By channel',
        'Conversation volume',
        renderDonutChart(
          [
            { label: 'WhatsApp', value: stats.whatsapp, color: CHANNEL_COLORS.whatsapp },
            { label: 'Messenger', value: stats.messenger, color: CHANNEL_COLORS.messenger },
            { label: 'Webchat', value: stats.webchat, color: CHANNEL_COLORS.webchat },
            { label: 'Email', value: stats.email, color: CHANNEL_COLORS.email },
          ],
          { centerLabel: 'Total', centerValue: stats.total, compact: true }
        )
      ),
      renderSwChartCard(
        'Queue health',
        'Threads needing attention',
        renderBarChart([
          { label: 'Active', value: metrics.active, color: '#10b981' },
          { label: 'Waiting', value: metrics.waiting, color: '#f59e0b' },
          { label: 'Unread', value: metrics.unread, color: '#8b5cf6' },
        ])
      ),
      renderSwChartCard(
        'Activity trend',
        'Recent volume shape',
        renderSparkBars(trend, { color: '#25D366' })
      ),
      renderSwChartCard(
        'AI vs human',
        'Who is handling chats',
        renderDonutChart(
          [
            { label: 'AI', value: metrics.aiChats, color: '#22c55e' },
            { label: 'Human', value: metrics.humanChats, color: '#3b82f6' },
          ],
          {
            centerLabel: 'Handled',
            centerValue: metrics.aiChats + metrics.humanChats,
            compact: true,
          }
        )
      ),
    ].join('')
  );

  return `${renderSwKpiGrid([
    { label: 'WhatsApp', value: stats.whatsapp, icon: 'fa-brands fa-whatsapp', tone: 'wa' },
    { label: 'Messenger', value: stats.messenger, icon: 'fa-brands fa-facebook-messenger', tone: 'fb' },
    { label: 'Website live', value: stats.webchat, icon: 'fa-globe', tone: 'web' },
    { label: 'Email', value: stats.email, icon: 'fa-envelope', tone: 'mail' },
    { label: 'Unread', value: stats.unread, icon: 'fa-envelope-open-text', tone: 'accent' },
  ])}
  ${quad}
  <p class="sw-overview-tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Open a channel tab above to reply in the same inbox experience as WhatsApp. Connect channels under <strong>Integrations</strong> when you are ready to go live.</p>`;
}

export function renderSalesSarahShell() {
  return renderSarahWorkspaceChatShell({
    title: 'Sarah',
    subtitle: 'Sales Assistant',
    intro:
      'Ask about leads, quotations, channel inbox behaviour, and instructions from Sarah Admin. Use channel tabs for live threads; this chat is your Sales Sarah command desk.',
    capabilities: [
      { icon: 'fa-comments', label: 'Multi-channel sales guidance' },
      { icon: 'fa-file-invoice', label: 'Quotations & follow-ups' },
      { icon: 'fa-user-plus', label: 'Lead capture context' },
      { icon: 'fa-share-nodes', label: 'Workforce instructions from Admin' },
    ],
    suggestions: [
      'Summarise open WhatsApp leads',
      'What should I do with pending Admin instructions?',
      'How do human takeovers work in the inbox?',
      'Explain the BOS quotation cycle for Central Motors',
    ],
    chatMountId: 'salesSarahPageChat',
    accent: 'sales',
  });
}

export function renderSalesShell({ section, bodyHtml, unreadCount = 0 }) {
  const nav = renderSarahHorizontalNav(SALES_SECTIONS, section, 'data-sales-section');
  const meta = salesSectionMeta(section);
  const badge = unreadCount
    ? `<span class="sw-header-badge">${unreadCount} unread</span>`
    : '';

  return `
    <div class="sw-module sales-module">
      ${pageHeader(
        'Sales Sarah',
        'Multi-channel sales inbox — Sarah handles AI replies; your team can take over anytime.',
        badge
      )}
      ${nav}
      <div class="sw-module-body sales-module-body" data-sales-body>
        ${
          section === 'overview' || section === 'sarah'
            ? bodyHtml
            : `<div class="sales-channel-head">
            <h2 class="sales-channel-title">${escapeHtml(meta.title)}</h2>
            <p class="sales-channel-subtitle">${escapeHtml(meta.subtitle)}</p>
          </div>${bodyHtml}`
        }
      </div>
    </div>`;
}

export function bindSalesNav(container, onSection) {
  container.querySelectorAll('[data-sales-section]').forEach((btn) => {
    btn.addEventListener('click', () => onSection(btn.getAttribute('data-sales-section') || 'overview'));
  });
  container.querySelector('[data-sw-nav-select]')?.addEventListener('change', (e) => {
    onSection(e.target.value || 'overview');
  });
}
