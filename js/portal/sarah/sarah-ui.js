/**
 * Sarah chat UI for Company Portal — full-page module + optional floating shortcut.
 */
import { state } from '../core/dataStore.js';
import { navigateTo } from '../router.js';
import { showToast } from '../../admin/ui.js';
import {
  sarahChat,
  fetchSarahActiveSession,
  fetchSarahSession,
} from '../api.js';
import { getSarahPageContext } from '../core/sarahPageContext.js';
import { MODULE_LABELS } from '../core/appShell.js';
import { invalidateHub } from '../core/dataService.js';
import {
  readSarahSessionId,
  writeSarahSessionId,
  readSarahTranscript,
  writeSarahTranscript,
} from '../../shared/sarahConversationPersistence.js';

let sessionId = null;
let sending = false;
/** @type {HTMLElement | null} */
let chatMount = null;
/** @type {{ role: string, content: string, actions?: unknown[] }[]} */
let transcript = [];

const WELCOME =
  "Hi! I'm Sarah, your AI operating assistant. Ask me to view analytics, search CRM, manage AI employees, upload knowledge, or connect channels — I'll walk you through it.";

export const SUGGESTIONS = [
  'What is in my workspace?',
  'Where do I connect WhatsApp?',
  'What is the difference between Sarah and an AI employee?',
  'How many AI employees do I have?',
  'Is my WhatsApp connected?',
];

/** @type {{ scope: string, getPageContext: () => object|null, welcome: string, suggestions: string[] }} */
let activeMount = {
  scope: 'portal',
  getPageContext: () => getSarahPageContext(),
  welcome: WELCOME,
  suggestions: SUGGESTIONS,
};

function sessionStorageKey(companyId) {
  const scope = activeMount.scope === 'finance' ? 'financeSarahSession' : 'sarahSession';
  return `ziricai.portal.${scope}.${companyId || 'unknown'}`;
}

function transcriptStorageKey(companyId) {
  const scope = activeMount.scope === 'finance' ? 'financeSarahTranscript' : 'sarahTranscript';
  return `ziricai.portal.${scope}.${companyId || 'unknown'}`;
}

function persistSessionId(companyId, id) {
  if (!companyId || !id) return;
  writeSarahSessionId(sessionStorageKey(companyId), id);
}

function readPersistedSessionId(companyId) {
  return readSarahSessionId(sessionStorageKey(companyId));
}

function persistTranscript(companyId) {
  if (!companyId) return;
  writeSarahTranscript(transcriptStorageKey(companyId), transcript);
}

export const SARAH_CAPABILITIES = [
  { icon: 'fa-chart-line', label: 'Analytics & reports' },
  { icon: 'fa-inbox', label: 'Inbox & conversations' },
  { icon: 'fa-users', label: 'CRM search & leads' },
  { icon: 'fa-robot', label: 'AI Employees' },
  { icon: 'fa-book', label: 'Knowledge base' },
  { icon: 'fa-plug', label: 'Integrations & channels' },
];

function applyUiHints(hints = []) {
  for (const hint of hints) {
    if (hint.navigate) {
      const page = String(hint.navigate).trim();
      if (!MODULE_LABELS[page]) {
        console.warn('[Sarah] Unknown navigate target:', page);
        showToast(`That page (${page}) isn't available in the portal.`, 'warning');
        continue;
      }
      const label = MODULE_LABELS[page];
      navigateTo(page);
      showToast(`Taking you to ${label}…`, 'info');
    }
    if (hint.openWizard === 'connectWhatsApp') {
      import('../../shared/siteUrls.js').then(({ portalModuleUrl }) =>
        import(portalModuleUrl('../whatsappConnect.js')).then(({ openWhatsAppConnectWizard }) => {
          openWhatsAppConnectWizard({ companyId: state.companyId || state.company?.id });
        })
      );
    } else if (hint.openWizard) {
      showToast(`Wizard: ${hint.openWizard}`, 'info');
    }
  }
}

function formatActionSummary(actions = []) {
  return actions
    .filter((a) => a.tool)
    .map((a) => {
      const icon = a.success ? '✓' : '✗';
      return `${icon} ${a.tool}${a.message ? `: ${a.message.slice(0, 200)}` : ''}`;
    });
}

function q(sel) {
  return chatMount?.querySelector(sel) ?? null;
}

const TYPING_MIN_MS = 450;

function appendTypingIndicator() {
  const messages = q('#portalSarahMessages');
  if (!messages) return null;
  const typing = document.createElement('div');
  typing.className = 'portal-sarah-msg ai typing';
  typing.setAttribute('role', 'status');
  typing.setAttribute('aria-label', 'Sarah is typing');
  typing.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;
  requestAnimationFrame(() => {
    typing.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  return typing;
}

async function removeTypingIndicator(typing, startedAt) {
  if (!typing?.isConnected) return;
  const elapsed = Date.now() - (startedAt || 0);
  if (elapsed < TYPING_MIN_MS) {
    await new Promise((r) => setTimeout(r, TYPING_MIN_MS - elapsed));
  }
  typing.remove();
}

function appendMessage(text, role, { skipScroll = false, track = true } = {}) {
  const messages = q('#portalSarahMessages');
  if (!messages) return;
  const el = document.createElement('div');
  el.className = `portal-sarah-msg ${role}`;
  el.textContent = text;
  messages.appendChild(el);
  if (track) {
    transcript.push({ role: role === 'user' ? 'user' : 'ai', content: text });
    persistTranscript(state.companyId);
  }
  if (!skipScroll) messages.scrollTop = messages.scrollHeight;
}

function appendActionBlock(actions) {
  const summaries = formatActionSummary(actions);
  if (!summaries.length) return;
  const messages = q('#portalSarahMessages');
  const el = document.createElement('div');
  el.className = 'portal-sarah-actions';
  el.innerHTML = summaries.map((s) => `<div class="portal-sarah-action">${s}</div>`).join('');
  messages?.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function renderStoredMessages(messages = []) {
  const container = q('#portalSarahMessages');
  if (!container) return;
  container.innerHTML = '';
  transcript = messages.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'ai',
    content: String(msg.content || ''),
    actions: msg.actions,
  }));
  if (!messages.length) {
    transcript = [];
    appendMessage(activeMount.welcome || WELCOME, 'ai', { track: false });
    persistTranscript(state.companyId);
    return;
  }
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : 'ai';
    appendMessage(msg.content || '', role, { skipScroll: true, track: false });
    if (msg.actions?.length) appendActionBlock(msg.actions);
  }
  persistTranscript(state.companyId);
  container.scrollTop = container.scrollHeight;
}

async function restoreSarahConversation(companyId) {
  const persistedId = readPersistedSessionId(companyId);
  if (persistedId) {
    const { data, error } = await fetchSarahSession(persistedId, companyId);
    if (!error && data?.session?.messages?.length) {
      sessionId = data.session.sessionId;
      persistSessionId(companyId, sessionId);
      renderStoredMessages(data.session.messages);
      return;
    }
  }

  const { data, error } = await fetchSarahActiveSession(companyId);
  if (!error && data?.session?.messages?.length) {
    sessionId = data.session.sessionId;
    persistSessionId(companyId, sessionId);
    renderStoredMessages(data.session.messages);
    return;
  }

  const local = readSarahTranscript(transcriptStorageKey(companyId));
  if (local.length) {
    renderStoredMessages(local);
    return;
  }

  renderStoredMessages([]);
}

async function submitMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || sending) return;
  if (!state.companyId) {
    showToast('No company context', 'error');
    return;
  }

  sending = true;
  appendMessage(trimmed, 'user');
  const input = q('#portalSarahInput');
  if (input) input.value = '';

  const typingStarted = Date.now();
  const typing = appendTypingIndicator();

  const { data, error } = await sarahChat({
    message: trimmed,
    sessionId,
    companyId: state.companyId,
    pageContext: activeMount.getPageContext(),
  });

  await removeTypingIndicator(typing, typingStarted);
  sending = false;

  if (error) {
    appendMessage(error, 'ai');
    showToast(error, 'error');
    return;
  }

  sessionId = data.sessionId || sessionId;
  persistSessionId(state.companyId, sessionId);
  appendMessage(data.reply || 'Done.', 'ai');
  appendActionBlock(data.actions);
  applyUiHints(data.uiHints);

  if (data.actions?.some((a) => a.success && a.tool)) {
    invalidateHub();
  }
}

function bindSuggestions(container) {
  container.querySelectorAll('.portal-sarah-chip').forEach((btn) => {
    btn.addEventListener('click', () => submitMessage(btn.dataset.q || btn.textContent || ''));
  });
}

/**
 * Mount interactive chat into a container (full-page or embedded).
 * @param {HTMLElement} container
 * @param {{ mode?: 'page' | 'widget' }} [options]
 */
export async function mountSarahChat(container, options = {}) {
  const mode = options.mode || 'page';
  activeMount = {
    scope: options.persistenceScope || 'portal',
    getPageContext: options.getPageContext || (() => getSarahPageContext()),
    welcome: options.welcomeMessage || WELCOME,
    suggestions: options.suggestions || SUGGESTIONS,
  };
  chatMount = container;
  container.classList.add(
    'portal-sarah-chat-mount',
    mode === 'page' ? 'portal-sarah-chat-mount--page' : 'portal-sarah-chat-mount--widget'
  );
  container.innerHTML = `
    <div class="portal-sarah-messages" id="portalSarahMessages" role="log" aria-live="polite">
      <div class="portal-sarah-msg ai">Loading conversation…</div>
    </div>
    <div class="portal-sarah-suggestions portal-sarah-suggestions--inline" id="portalSarahSuggestions"></div>
    <form class="portal-sarah-form" id="portalSarahForm">
      <textarea id="portalSarahInput" rows="${mode === 'page' ? 3 : 1}" placeholder="Ask Sarah to do something…" autocomplete="off"></textarea>
      <button type="submit" class="btn btn-primary portal-sarah-send"><i class="fa-solid fa-paper-plane"></i><span>Send</span></button>
    </form>
  `;

  const suggestionsEl = q('#portalSarahSuggestions');
  if (suggestionsEl) {
    suggestionsEl.innerHTML = activeMount.suggestions
      .map(
        (text) =>
          `<button type="button" class="portal-sarah-chip" data-q="${text.replace(/"/g, '&quot;')}">${text}</button>`
      )
      .join('');
    bindSuggestions(suggestionsEl);
  }

  q('#portalSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = q('#portalSarahInput');
    if (input?.value.trim()) submitMessage(input.value);
  });

  q('#portalSarahInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      q('#portalSarahForm')?.requestSubmit();
    }
  });

  if (state.companyId) {
    await restoreSarahConversation(state.companyId);
  } else {
    renderStoredMessages([]);
  }
}

/** Remove legacy floating FAB — Sarah is a full module in the sidebar. */
function removeFloatingShortcut() {
  document.getElementById('portalSarahWidget')?.remove();
}

export function initPortalSarah() {
  removeFloatingShortcut();
}

export function openPortalSarah() {
  navigateTo('sarah');
}
