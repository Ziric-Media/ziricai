import { state } from '../core/dataStore.js';
import { errorState } from '../../admin/ui.js';
import { can } from '../permissions.js';
import {
  fetchTenantConversations,
  fetchConversationDetail,
  sendConversationReply,
  setConversationTakeover,
  markConversationRead,
} from '../api.js';
import { shouldUseDemoFallback } from '../../shared/dataMode.js';
import { invalidateHub } from '../core/dataService.js';
import { navigateTo } from '../router.js';
import {
  computeInboxMetrics,
  filterInboxConversations,
  renderInboxLayout,
  scrollThreadToBottom,
  setActiveFilterButton,
  conversationPhone,
} from './inbox-ui.js';
import {
  renderSalesShell,
  renderSalesOverview,
  renderSalesSarahShell,
  bindSalesNav,
  filterConversationsForSalesSection,
  salesSectionMeta,
} from '../salesWorkspace.js';
import { mountSarahChat } from '../sarah/sarah-ui.js';
import { mountWorkforceInstructionsPanel } from '../workforceInstructionsPanel.js';
import { getSarahPageContext } from '../core/sarahPageContext.js';
import { consumePendingSarahNav } from '../portalWorkforceNav.js';

function isHumanControlled(conv = {}) {
  return Boolean(conv.humanTakeover) || (conv.mode || 'ai') === 'human';
}

function conversationKey(conv) {
  return conv?.id || conv?.phone || '';
}

/** @type {string} */
let salesSection = 'overview';

export async function renderConversations(container) {
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = errorState('You do not have permission to view the inbox.');
    return;
  }

  const companyId = state.companyId;
  const canReply = state.permissions.canReply;

  const pendingSection = consumePendingSarahNav('conversations');
  salesSection = pendingSection || 'overview';
  container.innerHTML = renderSalesShell({
    section: salesSection,
    bodyHtml: '<div class="empty-panel">Loading Sales Sarah…</div>',
    unreadCount: 0,
  });

  const apiRes = await fetchTenantConversations(companyId);
  let conversations = apiRes.data?.items || [];
  const useDemo = shouldUseDemoFallback({
    companyId,
    isDemo: state.hubData?.isDemo,
    isProvisioned: state.hubData?.isProvisioned,
  });

  if (apiRes.error && !conversations.length && !useDemo) {
    container.innerHTML = renderSalesShell({
      section: salesSection,
      bodyHtml: `<div class="inbox-thread-error">${errorState(apiRes.error)}<div style="text-align:center;margin-top:12px;"><button class="btn btn-secondary btn-sm" type="button" id="inboxRetryBtn">Retry</button></div></div>`,
      unreadCount: 0,
    });
    container.querySelector('#inboxRetryBtn')?.addEventListener('click', () => location.reload());
    bindSalesNav(container, (id) => {
      salesSection = id;
      paint();
    });
    return;
  }

  let filter = 'all';
  let search = '';
  let selected = null;
  let messages = [];
  let context = null;
  let contextError = null;
  let threadError = null;
  let threadLoading = false;
  let unreadCount = apiRes.data?.unreadCount ?? conversations.filter((c) => c.unread).length;

  function aiEmployeeNameFromContext() {
    return context?.aiEmployee?.name || null;
  }

  function channelScopedConversations() {
    return filterConversationsForSalesSection(conversations, salesSection);
  }

  async function mountSalesSarahChat() {
    const root = container.querySelector('[data-sw-sarah-chat]');
    if (!root || root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';
    const instrHost = container.querySelector('[data-workforce-instructions-host]');
    if (instrHost) {
      await mountWorkforceInstructionsPanel(instrHost, { persistenceScope: 'salesSarah', adminView: false });
    }
    await mountSarahChat(root, {
      mode: 'page',
      persistenceScope: 'salesSarah',
      welcomeMessage:
        "Hi! I'm Sarah, your Sales assistant. I can help with leads, quotations, channel inbox behaviour, and instructions from Sarah Admin.",
      suggestions: [
        'Summarise open WhatsApp conversations',
        'What workforce instructions are pending?',
        'How do I hand a thread to a human?',
        'Explain our quotation workflow',
      ],
      getPageContext: () => ({ ...getSarahPageContext(), module: 'sales', section: salesSection }),
    });
  }

  function paint() {
    if (salesSection === 'overview') {
      container.innerHTML = renderSalesShell({
        section: salesSection,
        bodyHtml: renderSalesOverview(conversations),
        unreadCount,
      });
      bindSalesNav(container, onSection);
      return;
    }

    if (salesSection === 'sarah') {
      container.innerHTML = renderSalesShell({
        section: salesSection,
        bodyHtml: renderSalesSarahShell(),
        unreadCount,
      });
      bindSalesNav(container, onSection);
      void mountSalesSarahChat();
      return;
    }

    const scoped = channelScopedConversations();
    const filtered = filterInboxConversations(scoped, { filter, search });
    const meta = salesSectionMeta(salesSection);
    const layoutHtml = renderInboxLayout({
      conversations: filtered,
      selected,
      messages,
      context,
      contextError,
      filter,
      search,
      canReply,
      aiEmployeeName: aiEmployeeNameFromContext(),
      threadError,
      threadLoading,
      listTitle: `${meta.title} threads`,
      layoutAccent: salesSection,
      emptyMessage: `No ${meta.title} conversations yet. When this channel is connected, threads will appear here for Sarah Sales to handle.`,
    });

    container.innerHTML = renderSalesShell({
      section: salesSection,
      bodyHtml: layoutHtml,
      unreadCount,
    });
    bindSalesNav(container, onSection);
    bindEvents(filtered);
    if (!threadLoading && selected && !threadError) {
      scrollThreadToBottom(container);
    }
  }

  function onSection(id) {
    salesSection = id || 'overview';
    if (salesSection === 'overview' || salesSection === 'sarah') {
      selected = null;
      messages = [];
    }
    paint();
  }

  async function refreshConversations() {
    const res = await fetchTenantConversations(companyId);
    if (!res.error) {
      conversations = res.data?.items || conversations;
      unreadCount = res.data?.unreadCount ?? conversations.filter((c) => c.unread).length;
    }
    return conversations;
  }

  async function loadThread(conv) {
    if (!conv) {
      selected = null;
      messages = [];
      context = null;
      contextError = null;
      threadError = null;
      threadLoading = false;
      paint();
      return;
    }

    selected = conv;
    threadLoading = true;
    threadError = null;
    contextError = null;
    paint();

    const detail = await fetchConversationDetail(companyId, conv.id || conv.phone);
    threadLoading = false;

    if (detail.error) {
      threadError = detail.error;
      contextError = detail.error;
      messages = [];
      context = null;
      paint();
      return;
    }

    const detailConv = detail.data?.conversation || {};
    selected = {
      ...conv,
      ...detailConv,
      humanTakeover: detail.data?.humanTakeover ?? detailConv.humanTakeover ?? conv.humanTakeover,
      mode: detailConv.mode ?? conv.mode,
    };
    messages = detail.data?.messages || [];
    context = detail.data?.context || null;
    contextError = null;
    threadError = null;

    const readRes = await markConversationRead(companyId, selected.id || selected.phone);
    if (!readRes.error) {
      const key = conversationKey(selected);
      conversations = conversations.map((c) =>
        conversationKey(c) === key ? { ...c, unread: false } : c
      );
      unreadCount = Math.max(0, conversations.filter((c) => c.unread).length);
    }

    paint();
  }

  function bindEvents(filteredRows) {
    container.querySelector('#inboxSearch')?.addEventListener('input', (e) => {
      search = e.target.value;
      paint();
    });

    container.querySelectorAll('.inbox-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter || 'all';
        setActiveFilterButton(container, filter);
        paint();
      });
    });

    container.querySelectorAll('.inbox-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const conv = channelScopedConversations().find((c) => conversationKey(c) === id);
        loadThread(conv);
      });
    });

    container.querySelector('#sendReplyBtn')?.addEventListener('click', async () => {
      const input = container.querySelector('#replyInput');
      const text = input?.value?.trim();
      if (!text || !selected) return;
      const res = await sendConversationReply(companyId, selected.id || selected.phone, {
        text,
        channel: selected.channel,
      });
      if (res.error) {
        threadError = res.error;
        paint();
        return;
      }
      input.value = '';
      invalidateHub();
      await loadThread(selected);
    });

    container.querySelector('#replyInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        container.querySelector('#sendReplyBtn')?.click();
      }
    });

    container.querySelector('#takeoverBtn')?.addEventListener('click', async () => {
      if (!selected) return;
      const human = isHumanControlled(selected);
      const res = await setConversationTakeover(companyId, selected.id || selected.phone, {
        enabled: !human,
      });
      if (res.error) {
        threadError = res.error;
        paint();
        return;
      }
      invalidateHub();
      await refreshConversations();
      const key = conversationKey(selected);
      const updated = conversations.find((c) => conversationKey(c) === key) || selected;
      await loadThread({ ...updated, humanTakeover: !human, mode: human ? 'ai' : 'human' });
    });

    container.querySelector('#retryContextBtn')?.addEventListener('click', () => {
      if (selected) loadThread(selected);
    });

    container.querySelector('#openInCrmBtn')?.addEventListener('click', () => {
      const phone = conversationPhone(selected);
      if (phone) navigateTo('customers', { phone });
    });

    container.querySelector('#mobileShowProfileBtn')?.addEventListener('click', () => {
      const panel = container.querySelector('#inboxCustomerPanel');
      panel?.classList.toggle('mobile-visible');
    });

    if (!selected && filteredRows[0]) {
      loadThread(filteredRows[0]);
    }
  }

  paint();
}
