/**
 * Mission Control Sarah — operator assistant (platform APIs, not customer-facing Sarah).
 */
import { state } from '../state.js';
import { escapeHtml, pageHeader, loadingState } from '../ui.js';
import { sendMissionControlSarahChat } from '../services/platformConsole.js';

let sessionId = `mc-${Date.now()}`;
/** @type {{ role: 'user'|'assistant', text: string }[]} */
let transcript = [];

const STARTERS = [
  'Which tenants have WhatsApp connected?',
  'Summarize platform health and integration risks.',
  'What should I know about billing trials this week?',
  'Explain ZiricAI packages for a new operator.',
];

export async function renderSarah(container) {
  const scoped = state.selectedCompanyId || null;
  container.innerHTML = `
    ${pageHeader(
      'Sarah',
      'Mission Control operator assistant — asks authorised platform and tenant APIs; not the customer-facing WhatsApp Sarah.',
      scoped ? `<span class="ops-tag">Tenant context: ${escapeHtml(scoped)}</span>` : '<span class="ops-tag">Platform context</span>'
    )}
    <div class="mc-sarah-layout">
      <div class="mc-sarah-starters">
        <p class="panel-hint">Try asking:</p>
        ${STARTERS.map(
          (q) =>
            `<button type="button" class="btn btn-secondary btn-sm mc-sarah-starter" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`
        ).join('')}
      </div>
      <div class="mc-sarah-thread" id="mcSarahThread">
        ${transcript.length ? transcript.map(renderBubble).join('') : '<div class="empty-panel">Ask Sarah about ZiricAI, a tenant, billing, or integrations.</div>'}
      </div>
      <form class="mc-sarah-compose" id="mcSarahForm">
        <input type="text" id="mcSarahInput" placeholder="Ask Sarah about the platform or a tenant…" autocomplete="off" />
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
    </div>
  `;

  container.querySelectorAll('.mc-sarah-starter').forEach((btn) => {
    btn.addEventListener('click', () => submitSarah(container, btn.dataset.q || ''));
  });
  container.querySelector('#mcSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = container.querySelector('#mcSarahInput');
    submitSarah(container, input?.value || '');
    if (input) input.value = '';
  });
}

function renderBubble(msg) {
  const cls = msg.role === 'user' ? 'mc-sarah-user' : 'mc-sarah-assistant';
  return `<div class="mc-sarah-bubble ${cls}">${escapeHtml(msg.text)}</div>`;
}

async function submitSarah(container, message) {
  const text = String(message || '').trim();
  if (!text) return;
  transcript.push({ role: 'user', text });
  paintThread(container);
  const thread = container.querySelector('#mcSarahThread');
  if (thread) thread.innerHTML = loadingState('Sarah is thinking…');

  const { data, error } = await sendMissionControlSarahChat({
    message: text,
    companyId: state.selectedCompanyId || null,
    sessionId,
  });

  if (data?.sessionId) sessionId = data.sessionId;
  const reply =
    data?.reply ||
    data?.message ||
    data?.content ||
    (error ? `Sorry — ${error}` : 'No response from Sarah.');
  transcript.push({ role: 'assistant', text: String(reply) });
  paintThread(container);
}

function paintThread(container) {
  const thread = container.querySelector('#mcSarahThread');
  if (!thread) return;
  thread.innerHTML = transcript.map(renderBubble).join('');
  thread.scrollTop = thread.scrollHeight;
}
