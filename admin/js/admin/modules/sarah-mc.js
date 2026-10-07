/**
 * Mission Control Sarah — operator assistant (platform APIs, not customer-facing Sarah).
 */
import { state } from '../state.js';
import { escapeHtml } from '../ui.js';
import { sarahPageAvatarMarkup } from '../../shared/sarahAvatar.js';
import {
  sendMissionControlSarahChat,
  fetchMcSarahActiveSession,
  fetchMcSarahSession,
  createMcSarahSession,
} from '../services/platformConsole.js';

const STARTERS = [
  'Which tenants have WhatsApp connected?',
  'Summarize platform health and integration risks.',
  'What should I know about billing trials this week?',
  'Explain ZiricAI packages for a new operator.',
];

const MC_CAPABILITIES = [
  { icon: 'fa-plug', label: 'Integrations & WhatsApp health' },
  { icon: 'fa-credit-card', label: 'Billing & trials' },
  { icon: 'fa-building', label: 'Tenant scope & companies' },
  { icon: 'fa-ticket', label: 'Support case aggregation' },
  { icon: 'fa-chart-line', label: 'Platform analytics' },
  { icon: 'fa-shield-halved', label: 'Operator guidance (read-only APIs)' },
];

const WELCOME =
  "Hi! I'm Sarah for Mission Control. Ask about tenants, billing, integrations, or support — I'll use read-only platform APIs.";

/** @type {string|null} */
let sessionId = null;
let sending = false;
/** @type {HTMLElement|null} */
let messagesEl = null;
/** @type {HTMLElement|null} */
let pageRoot = null;

function currentScopedCompanyId() {
  return state.selectedCompanyId || null;
}

function scopeKeyForCompany(scopedCompanyId) {
  return scopedCompanyId ? `tenant:${scopedCompanyId}` : 'platform';
}

function scopeKey() {
  return scopeKeyForCompany(currentScopedCompanyId());
}

function sessionStorageKey(scope) {
  return `ziricai.mc.sarahSession.${scope}`;
}

function persistSessionId(scope, id) {
  if (!id) return;
  try {
    sessionStorage.setItem(sessionStorageKey(scope), id);
  } catch {
    /* ignore */
  }
}

function readPersistedSessionId(scope) {
  try {
    return sessionStorage.getItem(sessionStorageKey(scope));
  } catch {
    return null;
  }
}

function scopeLabel(scopedCompanyId) {
  if (scopedCompanyId) {
    const company = state.companies.find((c) => c.id === scopedCompanyId);
    return company?.name ? `${company.name} (${scopedCompanyId})` : scopedCompanyId;
  }
  return 'Platform (all tenants)';
}

function scopeTagHtml(scopedCompanyId) {
  if (scopedCompanyId) {
    return `<p class="mc-sarah-context-tag"><span class="ops-tag">Tenant context: ${escapeHtml(scopeLabel(scopedCompanyId))}</span></p>`;
  }
  return '<p class="mc-sarah-context-tag"><span class="ops-tag">Platform context</span></p>';
}

function applyMcUiHints(hints = []) {
  for (const hint of hints) {
    if (!hint?.navigateMc) continue;
    // Dynamic import avoids router ↔ sarah-mc circular binding issues.
    import('../router.js').then(({ navigateTo }) => {
      navigateTo(hint.navigateMc, {
        companyId: hint.companyId !== undefined ? hint.companyId : undefined,
      });
    });
  }
}

function appendBubble(text, role) {
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = `portal-sarah-msg ${role === 'user' ? 'user' : 'ai'}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderStoredMessages(messages = []) {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  if (!messages.length) {
    appendBubble(WELCOME, 'ai');
    return;
  }
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : 'ai';
    appendBubble(msg.content || '', role);
  }
}

async function restoreConversationForScope(scopedCompanyId) {
  const sk = scopeKeyForCompany(scopedCompanyId);
  sessionId = null;

  const persistedId = readPersistedSessionId(sk);
  if (persistedId) {
    const { data, error } = await fetchMcSarahSession(persistedId, scopedCompanyId);
    if (!error && data?.session?.messages?.length) {
      sessionId = data.session.sessionId;
      persistSessionId(sk, sessionId);
      renderStoredMessages(data.session.messages);
      return;
    }
  }

  const { data, error } = await fetchMcSarahActiveSession(scopedCompanyId);
  if (!error && data?.session?.messages?.length) {
    sessionId = data.session.sessionId;
    persistSessionId(sk, sessionId);
    renderStoredMessages(data.session.messages);
    return;
  }

  renderStoredMessages([]);
}

function bindChatHandlers() {
  const chatRoot = pageRoot?.querySelector('#mcSarahPageChat');
  if (!chatRoot) return;

  chatRoot.querySelectorAll('.portal-sarah-chip').forEach((btn) => {
    btn.addEventListener('click', () => submitSarah(btn.dataset.q || ''));
  });

  chatRoot.querySelector('#mcSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = chatRoot.querySelector('#mcSarahInput');
    const value = input?.value || '';
    submitSarah(value);
    if (input) input.value = '';
  });

  chatRoot.querySelector('#mcSarahInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatRoot.querySelector('#mcSarahForm')?.requestSubmit();
    }
  });

  chatRoot.querySelector('#mcSarahNewConversation')?.addEventListener('click', async () => {
    if (sending) return;
    const scoped = currentScopedCompanyId();
    const { data, error } = await createMcSarahSession(scoped);
    if (error) {
      appendBubble(`Could not start a new conversation: ${error}`, 'ai');
      return;
    }
    sessionId = data?.session?.sessionId || null;
    persistSessionId(scopeKeyForCompany(scoped), sessionId);
    renderStoredMessages([]);
    appendBubble('Started a new conversation for this scope.', 'ai');
  });
}

export async function renderSarah(container) {
  const scoped = currentScopedCompanyId();

  pageRoot = container;
  container.innerHTML = `
    <div class="portal-sarah-page mc-sarah-page">
      <aside class="portal-sarah-page-aside" aria-label="Sarah assistant info">
        <div class="portal-sarah-page-brand">
          ${sarahPageAvatarMarkup()}
          <div>
            <h2 class="portal-sarah-page-title">Sarah</h2>
            <p class="portal-sarah-page-subtitle">Mission Control Assistant</p>
          </div>
        </div>
        <p class="portal-sarah-page-intro">
          Platform operator chat — Sarah uses authorised Mission Control APIs. This is not the customer-facing WhatsApp Sarah.
        </p>
        ${scopeTagHtml(scoped)}
        <h3 class="portal-sarah-page-aside-heading">Can help with</h3>
        <ul class="portal-sarah-cap-list">
          ${MC_CAPABILITIES.map(
            (c) =>
              `<li><i class="fa-solid ${escapeHtml(c.icon)}"></i><span>${escapeHtml(c.label)}</span></li>`
          ).join('')}
        </ul>
        <h3 class="portal-sarah-page-aside-heading">Try asking</h3>
        <ul class="portal-sarah-try-list">
          ${STARTERS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </aside>
      <section class="portal-sarah-page-main" aria-label="Chat with Sarah">
        <header class="portal-sarah-page-main-header">
          <div>
            <strong>Conversation</strong>
            <span class="text-muted">Shift+Enter for a new line · Enter to send</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="mcSarahNewConversation">New conversation</button>
        </header>
        <div class="portal-sarah-page-chat portal-sarah-chat-mount portal-sarah-chat-mount--page" id="mcSarahPageChat">
          <div class="portal-sarah-messages" id="mcSarahMessages" role="log" aria-live="polite"></div>
          <div class="portal-sarah-suggestions portal-sarah-suggestions--inline" id="mcSarahSuggestions">
            ${STARTERS.map(
              (text) =>
                `<button type="button" class="portal-sarah-chip" data-q="${escapeHtml(text)}">${escapeHtml(text)}</button>`
            ).join('')}
          </div>
          <form class="portal-sarah-form" id="mcSarahForm">
            <textarea id="mcSarahInput" rows="3" placeholder="Ask Sarah about the platform or a tenant…" autocomplete="off"></textarea>
            <button type="submit" class="btn btn-primary portal-sarah-send"><i class="fa-solid fa-paper-plane"></i><span>Send</span></button>
          </form>
        </div>
      </section>
    </div>
  `;

  messagesEl = container.querySelector('#mcSarahMessages');
  bindChatHandlers();
  await restoreConversationForScope(scoped);

  container.querySelector('#mcSarahInput')?.focus();
}

async function submitSarah(message) {
  const text = String(message || '').trim();
  if (!text || sending || !messagesEl) return;

  const scoped = currentScopedCompanyId();
  const sk = scopeKey();

  sending = true;
  appendBubble(text, 'user');

  const typing = document.createElement('div');
  typing.className = 'portal-sarah-msg typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const { data, error } = await sendMissionControlSarahChat({
    message: text,
    companyId: scoped,
    sessionId,
    pageContext: {
      page: 'sarah',
      label: scoped
        ? `Mission Control Sarah (tenant: ${scoped})`
        : 'Mission Control Sarah (platform)',
    },
  });

  typing.remove();
  sending = false;

  if (error) {
    appendBubble(`Sorry — ${error}`, 'ai');
    return;
  }

  if (data?.sessionId) {
    sessionId = data.sessionId;
    persistSessionId(sk, sessionId);
  }

  const reply =
    data?.reply ||
    data?.message ||
    data?.content ||
    'No response from Sarah.';
  appendBubble(String(reply), 'ai');
  applyMcUiHints(data?.uiHints || []);
}
