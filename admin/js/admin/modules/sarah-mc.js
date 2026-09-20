/**
 * Mission Control Sarah — operator assistant (platform APIs, not customer-facing Sarah).
 */
import { state } from '../state.js';
import { escapeHtml } from '../ui.js';
import { sendMissionControlSarahChat } from '../services/platformConsole.js';

let sessionId = `mc-${Date.now()}`;
/** @type {{ role: 'user'|'assistant', text: string }[]} */
let transcript = [];
let sending = false;

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

export async function renderSarah(container) {
  const scoped = state.selectedCompanyId || null;
  container.innerHTML = `
    <div class="portal-sarah-page mc-sarah-page">
      <aside class="portal-sarah-page-aside" aria-label="Sarah assistant info">
        <div class="portal-sarah-page-brand">
          <div class="portal-sarah-page-avatar" aria-hidden="true"><i class="fa-solid fa-sparkles"></i></div>
          <div>
            <h2 class="portal-sarah-page-title">Sarah</h2>
            <p class="portal-sarah-page-subtitle">Mission Control Assistant</p>
          </div>
        </div>
        <p class="portal-sarah-page-intro">
          Platform operator chat — Sarah uses authorised Mission Control APIs. This is not the customer-facing WhatsApp Sarah.
        </p>
        ${
          scoped
            ? `<p class="mc-sarah-context-tag"><span class="ops-tag">Tenant context: ${escapeHtml(scoped)}</span></p>`
            : '<p class="mc-sarah-context-tag"><span class="ops-tag">Platform context</span></p>'
        }
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
        </header>
        <div class="portal-sarah-page-chat" id="mcSarahPageChat"></div>
      </section>
    </div>
  `;

  const chatRoot = container.querySelector('#mcSarahPageChat');
  if (chatRoot) {
    mountMcSarahChat(chatRoot, container);
    chatRoot.querySelector('#mcSarahInput')?.focus();
  }
}

function mountMcSarahChat(chatRoot, pageContainer) {
  const greeting =
    transcript.length === 0
      ? '<div class="portal-sarah-msg ai">Hi! I\'m Sarah for Mission Control. Ask about tenants, billing, integrations, or support — I\'ll use read-only platform APIs.</div>'
      : '';
  chatRoot.classList.add('portal-sarah-chat-mount', 'portal-sarah-chat-mount--page');
  chatRoot.innerHTML = `
    <div class="portal-sarah-messages" id="mcSarahMessages" role="log" aria-live="polite">
      ${greeting}
      ${transcript.map((m) => renderBubbleHtml(m)).join('')}
    </div>
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
  `;

  chatRoot.querySelectorAll('.portal-sarah-chip').forEach((btn) => {
    btn.addEventListener('click', () => submitSarah(pageContainer, btn.dataset.q || ''));
  });

  chatRoot.querySelector('#mcSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = chatRoot.querySelector('#mcSarahInput');
    submitSarah(pageContainer, input?.value || '');
    if (input) input.value = '';
  });

  chatRoot.querySelector('#mcSarahInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatRoot.querySelector('#mcSarahForm')?.requestSubmit();
    }
  });

  scrollThread(chatRoot);
}

function renderBubbleHtml(msg) {
  const cls = msg.role === 'user' ? 'user' : 'ai';
  return `<div class="portal-sarah-msg ${cls}">${escapeHtml(msg.text)}</div>`;
}

async function submitSarah(pageContainer, message) {
  const text = String(message || '').trim();
  if (!text || sending) return;

  sending = true;
  transcript.push({ role: 'user', text });
  paintThread(pageContainer);

  const chatRoot = pageContainer.querySelector('#mcSarahPageChat');
  const messages = chatRoot?.querySelector('#mcSarahMessages');
  const typing = document.createElement('div');
  typing.className = 'portal-sarah-msg typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  messages?.appendChild(typing);
  scrollThread(chatRoot);

  const { data, error } = await sendMissionControlSarahChat({
    message: text,
    companyId: state.selectedCompanyId || null,
    sessionId,
  });

  typing.remove();
  sending = false;

  if (data?.sessionId) sessionId = data.sessionId;
  const reply =
    data?.reply ||
    data?.message ||
    data?.content ||
    (error ? `Sorry — ${error}` : 'No response from Sarah.');
  transcript.push({ role: 'assistant', text: String(reply) });
  paintThread(pageContainer);
}

function paintThread(pageContainer) {
  const chatRoot = pageContainer.querySelector('#mcSarahPageChat');
  if (!chatRoot) return;
  mountMcSarahChat(chatRoot, pageContainer);
}

function scrollThread(chatRoot) {
  const messages = chatRoot?.querySelector('#mcSarahMessages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}
