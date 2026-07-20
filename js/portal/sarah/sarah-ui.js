/**
 * Sarah UI widget for Company Portal — floating panel connected to /api/sarah/chat.
 */
import { state } from '../core/dataStore.js';
import { navigateTo } from '../router.js';
import { showToast } from '../../admin/ui.js';
import { sendSarahMessage } from './sarah-chat.js';
import { invalidateHub } from '../core/dataService.js';

let sessionId = null;
let sending = false;

const SUGGESTIONS = [
  'Show analytics for this month',
  'List recent conversations',
  'Search CRM for leads',
  'Connect WhatsApp',
  'Help with ZiricAI setup',
];

function getAuthToken() {
  return state.user?.accessToken || null;
}

function applyUiHints(hints = []) {
  for (const hint of hints) {
    if (hint.navigate) {
      navigateTo(hint.navigate);
      showToast(`Opened ${hint.navigate}`, 'info');
    }
    if (hint.openWizard) {
      showToast(`Wizard: ${hint.openWizard}`, 'info');
    }
  }
}

function formatActionSummary(actions = []) {
  return actions
    .filter((a) => a.tool)
    .map((a) => {
      const icon = a.success ? '✓' : '✗';
      return `${icon} ${a.tool}${a.message ? `: ${a.message.slice(0, 80)}` : ''}`;
    });
}

function ensureWidget() {
  if (document.getElementById('portalSarahWidget')) return;

  const widget = document.createElement('div');
  widget.id = 'portalSarahWidget';
  widget.className = 'portal-sarah-widget';
  widget.innerHTML = `
    <button type="button" class="portal-sarah-bubble" id="portalSarahBubble" aria-label="Open Sarah assistant">
      <i class="fa-solid fa-sparkles"></i>
      <span class="portal-sarah-bubble-label">Sarah</span>
    </button>
    <div class="portal-sarah-panel" id="portalSarahPanel" aria-hidden="true">
      <header class="portal-sarah-header">
        <div class="portal-sarah-avatar"><i class="fa-solid fa-sparkles"></i></div>
        <div>
          <strong>Sarah</strong>
          <span>AI Operating Assistant</span>
        </div>
        <button type="button" class="portal-sarah-close" id="portalSarahClose" aria-label="Close">&times;</button>
      </header>
      <div class="portal-sarah-messages" id="portalSarahMessages">
        <div class="portal-sarah-msg ai">Hi! I'm Sarah. Ask me to view analytics, search CRM, create AI employees, upload knowledge, or connect channels.</div>
      </div>
      <div class="portal-sarah-suggestions" id="portalSarahSuggestions"></div>
      <form class="portal-sarah-form" id="portalSarahForm">
        <input type="text" id="portalSarahInput" placeholder="Ask Sarah to do something…" autocomplete="off" />
        <button type="submit" class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </div>
  `;
  document.body.appendChild(widget);

  const suggestionsEl = document.getElementById('portalSarahSuggestions');
  suggestionsEl.innerHTML = SUGGESTIONS.map(
    (q) => `<button type="button" class="portal-sarah-chip" data-q="${q.replace(/"/g, '&quot;')}">${q}</button>`
  ).join('');

  document.getElementById('portalSarahBubble')?.addEventListener('click', togglePanel);
  document.getElementById('portalSarahClose')?.addEventListener('click', closePanel);
  document.getElementById('portalSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('portalSarahInput');
    if (input?.value.trim()) submitMessage(input.value);
  });

  suggestionsEl.querySelectorAll('.portal-sarah-chip').forEach((btn) => {
    btn.addEventListener('click', () => submitMessage(btn.dataset.q || btn.textContent));
  });
}

function togglePanel() {
  const widget = document.getElementById('portalSarahWidget');
  const panel = document.getElementById('portalSarahPanel');
  const open = widget?.classList.toggle('open');
  panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) document.getElementById('portalSarahInput')?.focus();
}

function closePanel() {
  document.getElementById('portalSarahWidget')?.classList.remove('open');
  document.getElementById('portalSarahPanel')?.setAttribute('aria-hidden', 'true');
}

function appendMessage(text, role) {
  const messages = document.getElementById('portalSarahMessages');
  if (!messages) return;
  const el = document.createElement('div');
  el.className = `portal-sarah-msg ${role}`;
  el.textContent = text;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function appendActionBlock(actions) {
  const summaries = formatActionSummary(actions);
  if (!summaries.length) return;
  const messages = document.getElementById('portalSarahMessages');
  const el = document.createElement('div');
  el.className = 'portal-sarah-actions';
  el.innerHTML = summaries.map((s) => `<div class="portal-sarah-action">${s}</div>`).join('');
  messages?.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
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
  const input = document.getElementById('portalSarahInput');
  if (input) input.value = '';

  const typing = document.createElement('div');
  typing.className = 'portal-sarah-msg typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  document.getElementById('portalSarahMessages')?.appendChild(typing);

  const { data, error } = await sendSarahMessage({
    message: trimmed,
    sessionId,
    companyId: state.companyId,
    token: getAuthToken(),
  });

  typing.remove();
  sending = false;

  if (error) {
    appendMessage(error, 'ai');
    showToast(error, 'error');
    return;
  }

  sessionId = data.sessionId || sessionId;
  appendMessage(data.reply || 'Done.', 'ai');
  appendActionBlock(data.actions);
  applyUiHints(data.uiHints);

  if (data.actions?.some((a) => a.success && a.tool)) {
    invalidateHub();
  }
}

export function initPortalSarah() {
  ensureWidget();
}

export function openPortalSarah() {
  ensureWidget();
  const widget = document.getElementById('portalSarahWidget');
  if (!widget?.classList.contains('open')) togglePanel();
}
