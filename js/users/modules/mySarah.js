import { state } from '../core/state.js';
import { sendPersonalSarahMessage, fetchActivePersonalSarahSession } from '../personalSarahChat.js';

const SESSION_KEY = 'sarah.app.personalSarah.sessionId';

function persistSessionId(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function readSessionId() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMessages(host, transcript) {
  const inner = host.querySelector('.sarah-chat-messages');
  if (!inner) return;
  inner.innerHTML = transcript
    .map(
      (m) => `
    <div class="sarah-chat-bubble ${m.role === 'user' ? 'is-user' : 'is-assistant'}">
      ${escapeHtml(m.content)}
    </div>`
    )
    .join('');
  inner.scrollTop = inner.scrollHeight;
}

export async function renderMySarah(host) {
  const name =
    state.consumerProfile?.preferredName ||
    state.consumerProfile?.firstName ||
    'friend';

  host.innerHTML = `
    <div class="sarah-chat-module">
      <h2>My Sarah</h2>
      <p class="sarah-module-hint">Your private assistant — not connected to any company yet.</p>
      <div class="sarah-chat-messages" role="log" aria-live="polite"></div>
      <form class="sarah-chat-compose" id="personalSarahForm">
        <input type="text" id="personalSarahInput" placeholder="Ask Sarah anything…" autocomplete="off" />
        <button type="submit" class="btn btn-primary">Send</button>
      </form>
      <div class="sarah-chat-suggestions">
        <button type="button" data-suggest="Help me plan my week">Plan my week</button>
        <button type="button" data-suggest="Remind me to drink water at 3pm">Set a reminder</button>
        <button type="button" data-suggest="Summarize my chat with smilemore-demo">Summarize SmileMore chat</button>
      </div>
    </div>`;

  /** @type {{ role: string, content: string }[]} */
  let transcript = [
    {
      role: 'assistant',
      content: `Hello ${name}! I'm your personal Sarah. Use Discover to chat with SmileMore Dentists, then ask me to summarize that conversation here.`,
    },
  ];

  let sessionId = readSessionId();
  let sending = false;

  const active = await fetchActivePersonalSarahSession();
  if (active.data?.session?.messages?.length) {
    transcript = active.data.session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    sessionId = active.data.session.id || sessionId;
    persistSessionId(sessionId);
  }

  renderMessages(host, transcript);

  async function send(text) {
    const message = String(text || '').trim();
    if (!message || sending) return;
    sending = true;
    transcript.push({ role: 'user', content: message });
    renderMessages(host, transcript);
    const input = host.querySelector('#personalSarahInput');
    if (input) input.value = '';

    const res = await sendPersonalSarahMessage({ message, sessionId });
    sending = false;
    if (res.error) {
      transcript.push({ role: 'assistant', content: res.error });
      renderMessages(host, transcript);
      return;
    }
    sessionId = res.data?.sessionId || sessionId;
    persistSessionId(sessionId);
    transcript.push({ role: 'assistant', content: res.data?.reply || '…' });
    renderMessages(host, transcript);
  }

  host.querySelector('#personalSarahForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = host.querySelector('#personalSarahInput');
    send(input?.value);
  });

  host.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => send(btn.dataset.suggest));
  });
}
