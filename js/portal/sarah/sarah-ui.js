/**
 * Sarah chat UI for Company Portal — full-page module + optional floating shortcut.
 * Each workforce module keeps its own transcript + server session (surface-scoped).
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
import { persistenceScopeToSurface, PORTAL_SARAH_SURFACES } from './sarahModuleSurfaces.js';

const WELCOME =
  "Hi! I'm Sarah, your AI operating assistant. Ask me to view analytics, search CRM, manage AI employees, upload knowledge, or connect channels — I'll walk you through it.";

export const SUGGESTIONS = [
  'What is in my workspace?',
  'Where do I connect WhatsApp?',
  'What is the difference between Sarah and an AI employee?',
  'How many AI employees do I have?',
  'Is my WhatsApp connected?',
];

/** @typedef {{ sessionId: string|null, sending: boolean, transcript: { role: string, content: string, actions?: unknown[] }[], chatMount: HTMLElement|null, mount: object }} SarahScopeState */

/** @type {Map<string, SarahScopeState>} */
const scopeStates = new Map();

function getScopeState(persistenceScope) {
  const key = persistenceScope || 'admin';
  if (!scopeStates.has(key)) {
    scopeStates.set(key, {
      sessionId: null,
      sending: false,
      transcript: [],
      chatMount: null,
      mount: {
        persistenceScope: key,
        sessionSurface: persistenceScopeToSurface(key),
        getPageContext: () => getSarahPageContext(),
        welcome: WELCOME,
        suggestions: SUGGESTIONS,
      },
    });
  }
  return scopeStates.get(key);
}

function sessionStorageKey(companyId, persistenceScope) {
  if (persistenceScope === 'finance') {
    return `ziricai.portal.financeSarahSession.${companyId || 'unknown'}`;
  }
  return `ziricai.portal.sarah.${persistenceScope || 'admin'}.${companyId || 'unknown'}`;
}

function transcriptStorageKey(companyId, persistenceScope) {
  if (persistenceScope === 'finance') {
    return `ziricai.portal.financeSarahTranscript.${companyId || 'unknown'}`;
  }
  return `ziricai.portal.sarah.transcript.${persistenceScope || 'admin'}.${companyId || 'unknown'}`;
}

function persistSessionId(companyId, persistenceScope, id) {
  if (!companyId || !id) return;
  writeSarahSessionId(sessionStorageKey(companyId, persistenceScope), id);
}

function readPersistedSessionId(companyId, persistenceScope) {
  return readSarahSessionId(sessionStorageKey(companyId, persistenceScope));
}

function persistTranscript(companyId, persistenceScope, transcript) {
  if (!companyId) return;
  writeSarahTranscript(transcriptStorageKey(companyId, persistenceScope), transcript);
}

export const SARAH_CAPABILITIES = [
  { icon: 'fa-wand-magic-sparkles', label: 'Sarah workforce coordination' },
  { icon: 'fa-inbox', label: 'Sarah Sales · channels & inbox' },
  { icon: 'fa-coins', label: 'Sarah Finance · quotes & ledger' },
  { icon: 'fa-list-check', label: 'Sarah Operations · tasks & delivery' },
  { icon: 'fa-user-tie', label: 'Sarah HR · people & staffing' },
  { icon: 'fa-users', label: 'CRM · customers & leads' },
  { icon: 'fa-robot', label: 'AI Employees & knowledge' },
  { icon: 'fa-chart-line', label: 'Analytics & integrations' },
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

const INTERNAL_ACTION_MESSAGE_RE = /Each line item requires unitAmount/i;

function isInternalActionNoise(action) {
  const msg = String(action?.message || action?.error || '');
  return INTERNAL_ACTION_MESSAGE_RE.test(msg);
}

function formatActionSummary(actions = []) {
  return actions
    .filter((a) => a.tool && !isInternalActionNoise(a))
    .map((a) => {
      const icon = a.success ? '✓' : '✗';
      const msg = a.message ? String(a.message).slice(0, 200) : '';
      return `${icon} ${a.tool}${msg ? `: ${msg}` : ''}`;
    });
}

function q(scopeState, sel) {
  return scopeState.chatMount?.querySelector(sel) ?? null;
}

const TYPING_MIN_MS = 450;

function appendTypingIndicator(scopeState) {
  const messages = q(scopeState, '#portalSarahMessages');
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

function appendMessage(scopeState, text, role, { skipScroll = false, track = true } = {}) {
  const messages = q(scopeState, '#portalSarahMessages');
  if (!messages) return;
  const el = document.createElement('div');
  el.className = `portal-sarah-msg ${role}`;
  el.textContent = text;
  messages.appendChild(el);
  if (track) {
    scopeState.transcript.push({ role: role === 'user' ? 'user' : 'ai', content: text });
    persistTranscript(state.companyId, scopeState.mount.persistenceScope, scopeState.transcript);
  }
  if (!skipScroll) messages.scrollTop = messages.scrollHeight;
}

function appendActionBlock(scopeState, actions) {
  const summaries = formatActionSummary(actions);
  if (!summaries.length) return;
  const messages = q(scopeState, '#portalSarahMessages');
  const el = document.createElement('div');
  el.className = 'portal-sarah-actions';
  el.innerHTML = summaries.map((s) => `<div class="portal-sarah-action">${s}</div>`).join('');
  messages?.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function renderStoredMessages(scopeState, messages = []) {
  const container = q(scopeState, '#portalSarahMessages');
  if (!container) return;
  container.innerHTML = '';
  scopeState.transcript = messages.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'ai',
    content: String(msg.content || ''),
    actions: msg.actions,
  }));
  const welcome = scopeState.mount.welcome || WELCOME;
  if (!messages.length) {
    scopeState.transcript = [];
    appendMessage(scopeState, welcome, 'ai', { track: false });
    persistTranscript(state.companyId, scopeState.mount.persistenceScope, scopeState.transcript);
    return;
  }
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : 'ai';
    appendMessage(scopeState, msg.content || '', role, { skipScroll: true, track: false });
    if (msg.actions?.length) appendActionBlock(scopeState, msg.actions);
  }
  persistTranscript(state.companyId, scopeState.mount.persistenceScope, scopeState.transcript);
  container.scrollTop = container.scrollHeight;
}

async function restoreSarahConversation(scopeState, companyId) {
  const { persistenceScope, sessionSurface } = scopeState.mount;
  const persistedId = readPersistedSessionId(companyId, persistenceScope);
  if (persistedId) {
    const { data, error } = await fetchSarahSession(persistedId, companyId, sessionSurface);
    if (!error && data?.session?.messages?.length) {
      scopeState.sessionId = data.session.sessionId;
      persistSessionId(companyId, persistenceScope, scopeState.sessionId);
      renderStoredMessages(scopeState, data.session.messages);
      return;
    }
  }

  let { data, error } = await fetchSarahActiveSession(companyId, sessionSurface);
  if (
    (error || !data?.session?.messages?.length) &&
    sessionSurface === PORTAL_SARAH_SURFACES.admin
  ) {
    ({ data, error } = await fetchSarahActiveSession(companyId, 'portal'));
  }
  if (!error && data?.session?.messages?.length) {
    scopeState.sessionId = data.session.sessionId;
    persistSessionId(companyId, persistenceScope, scopeState.sessionId);
    renderStoredMessages(scopeState, data.session.messages);
    return;
  }

  const local = readSarahTranscript(transcriptStorageKey(companyId, persistenceScope));
  if (local.length) {
    renderStoredMessages(scopeState, local);
    return;
  }

  renderStoredMessages(scopeState, []);
}

async function submitMessage(scopeState, text) {
  const trimmed = text.trim();
  if (!trimmed || scopeState.sending) return;
  if (!state.companyId) {
    showToast('No company context', 'error');
    return;
  }

  scopeState.sending = true;
  appendMessage(scopeState, trimmed, 'user');
  const input = q(scopeState, '#portalSarahInput');
  if (input) input.value = '';

  const typingStarted = Date.now();
  const typing = appendTypingIndicator(scopeState);

  const { sessionSurface } = scopeState.mount;
  const { data, error } = await sarahChat({
    message: trimmed,
    sessionId: scopeState.sessionId,
    companyId: state.companyId,
    surface: sessionSurface,
    pageContext: scopeState.mount.getPageContext(),
  });

  await removeTypingIndicator(typing, typingStarted);
  scopeState.sending = false;

  if (error) {
    appendMessage(scopeState, error, 'ai');
    showToast(error, 'error');
    return;
  }

  scopeState.sessionId = data.sessionId || scopeState.sessionId;
  persistSessionId(state.companyId, scopeState.mount.persistenceScope, scopeState.sessionId);
  appendMessage(scopeState, data.reply || 'Done.', 'ai');
  appendActionBlock(scopeState, data.actions);
  applyUiHints(data.uiHints);

  if (data.actions?.some((a) => a.success && a.tool)) {
    invalidateHub();
  }
}

function bindSuggestions(scopeState, container) {
  container.querySelectorAll('.portal-sarah-chip').forEach((btn) => {
    btn.addEventListener('click', () => submitMessage(scopeState, btn.dataset.q || btn.textContent || ''));
  });
}

/**
 * Mount interactive chat into a container (full-page or embedded).
 * @param {HTMLElement} container
 * @param {{ mode?: 'page' | 'widget', persistenceScope?: string, sessionSurface?: string, getPageContext?: () => object|null, welcomeMessage?: string, suggestions?: string[] }} [options]
 */
export async function mountSarahChat(container, options = {}) {
  const mode = options.mode || 'page';
  const persistenceScope = options.persistenceScope || 'admin';
  const scopeState = getScopeState(persistenceScope);
  scopeState.mount = {
    persistenceScope,
    sessionSurface: options.sessionSurface || persistenceScopeToSurface(persistenceScope),
    getPageContext: options.getPageContext || (() => getSarahPageContext()),
    welcome: options.welcomeMessage || WELCOME,
    suggestions: options.suggestions || SUGGESTIONS,
  };
  scopeState.chatMount = container;
  container.dataset.sarahPersistenceScope = persistenceScope;
  container.dataset.sarahSurface = scopeState.mount.sessionSurface;
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

  const suggestionsEl = q(scopeState, '#portalSarahSuggestions');
  if (suggestionsEl) {
    suggestionsEl.innerHTML = scopeState.mount.suggestions
      .map(
        (text) =>
          `<button type="button" class="portal-sarah-chip" data-q="${text.replace(/"/g, '&quot;')}">${text}</button>`
      )
      .join('');
    bindSuggestions(scopeState, suggestionsEl);
  }

  q(scopeState, '#portalSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = q(scopeState, '#portalSarahInput');
    if (input?.value.trim()) submitMessage(scopeState, input.value);
  });

  q(scopeState, '#portalSarahInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      q(scopeState, '#portalSarahForm')?.requestSubmit();
    }
  });

  if (state.companyId) {
    await restoreSarahConversation(scopeState, state.companyId);
  } else {
    renderStoredMessages(scopeState, []);
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

export { PORTAL_SARAH_SURFACES };
