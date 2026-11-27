/**
 * ST-UX-01 — task conversation workspace (composer, typing/working, details).
 */

function lifecycleLabel(state) {
    const map = {
        awaiting_approval: 'Awaiting your approval',
        in_progress: 'In progress',
        awaiting_user: 'Ready to help',
        acknowledging: 'Sarah is acknowledging',
        assigned: 'Assigned',
        completed: 'Completed',
        cancelled: 'Cancelled',
    };
    return map[state] || 'Open';
}

export function renderTaskWorkspace(task, session, esc) {
    const messages = session?.messages || [];
    const phase = task?.sarahPhase || 'idle';
    const phaseRow =
        phase === 'typing'
            ? `<article class="st-ws-bubble st-ws-bubble--sarah st-ws-bubble--phase" aria-busy="true"><div class="st-ws-typing"><span></span><span></span><span></span></div><p class="st-ws-phase-label">Sarah is typing…</p></article>`
          : phase === 'working'
            ? `<article class="st-ws-bubble st-ws-bubble--sarah st-ws-bubble--phase st-ws-bubble--working" aria-busy="true"><div class="st-ws-typing st-ws-typing--work"><span></span><span></span><span></span></div><p class="st-ws-phase-label">Sarah is working…</p></article>`
            : '';

    const transcript = messages
        .map((m) => {
            const mine = m.role === 'user';
            return `<article class="st-ws-bubble ${mine ? 'st-ws-bubble--user' : 'st-ws-bubble--sarah'}">
        <p class="st-ws-who">${mine ? 'You' : 'Sarah'}</p>
        <p class="st-ws-text">${esc(m.content || '')}</p>
      </article>`;
        })
        .join('');

    const checklist =
        Array.isArray(task?.checklist) && task.checklist.length
            ? `<ul class="st-ws-check">${task.checklist
                  .map((c) => `<li class="${c.done ? 'is-done' : ''}">${esc(c.label)}</li>`)
                  .join('')}</ul>`
            : '<p class="st-detail-empty">No checklist yet.</p>';

    const due = task?.dueAt ? esc(new Date(task.dueAt).toLocaleString()) : 'No due date';

    return `
    <header class="st-ws-head">
      <button type="button" class="st-back" data-st-back>← Tasks</button>
      <h2 class="st-ws-title">${esc(task?.title || 'Task')}</h2>
      <p class="st-ws-meta"><span class="st-ws-pill">${esc(lifecycleLabel(task?.lifecycleState))}</span> · ${due}</p>
    </header>
    <nav class="st-ws-tabs" role="tablist">
      <button type="button" class="st-ws-tab is-active" data-st-ws-tab="chat" role="tab">Conversation</button>
      <button type="button" class="st-ws-tab" data-st-ws-tab="details" role="tab">Details</button>
      <button type="button" class="st-ws-tab" data-st-ws-tab="progress" role="tab">Progress</button>
    </nav>
    <section class="st-ws-panel" data-st-ws-panel="chat">
      <div class="st-ws-thread" id="stWsThread">${transcript}${phaseRow}</div>
      <form class="st-ws-composer" id="stWsComposer">
        <label class="st-ws-compose-label"><span class="visually-hidden">Message Sarah</span>
          <textarea name="message" rows="2" placeholder="Message Sarah about this task…" required></textarea>
        </label>
        <button type="submit" class="st-cat-select st-ws-send">Send</button>
      </form>
    </section>
  <section class="st-ws-panel is-hidden" data-st-ws-panel="details" hidden>
      ${task?.notes ? `<p class="st-detail-notes">${esc(String(task.notes))}</p>` : ''}
      <dl class="st-ws-dl">
        <dt>Category</dt><dd>${esc(task?.categoryId || '—')}</dd>
        <dt>Type</dt><dd>${esc(task?.taskType || '—')}</dd>
        <dt>Kind</dt><dd>${esc(task?.taskKind || '—')}</dd>
      </dl>
    </section>
    <section class="st-ws-panel is-hidden" data-st-ws-panel="progress" hidden>
      <h3 class="st-detail-h">Checklist</h3>
      ${checklist}
      ${task?.planSummary ? `<h3 class="st-detail-h">Sarah's plan</h3><p class="st-ws-plan">${esc(task.planSummary)}</p>` : ''}
    </section>`;
}

export function bindTaskWorkspace(root, { esc, hooks, onBack, onRefresh }) {
  root.querySelectorAll('[data-st-ws-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-st-ws-tab');
      root.querySelectorAll('[data-st-ws-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      root.querySelectorAll('[data-st-ws-panel]').forEach((p) => {
        const on = p.getAttribute('data-st-ws-panel') === id;
        p.classList.toggle('is-hidden', !on);
        p.hidden = !on;
      });
    });
  });
  root.querySelector('[data-st-back]')?.addEventListener('click', () => onBack?.());
  const form = root.querySelector('#stWsComposer');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const fd = new FormData(form);
      const message = String(fd.get('message') || '').trim();
      if (!message) return;
      if (!hooks.sendTaskMessage) {
        hooks.toast?.('Sign in on a paid plan to chat on tasks.');
        return;
      }
      form.querySelector('button[type=submit]')?.setAttribute('disabled', 'true');
      const res = await hooks.sendTaskMessage(message);
      form.querySelector('button[type=submit]')?.removeAttribute('disabled');
      if (res?.error) {
        hooks.toast?.(res.error);
        return;
      }
      form.reset();
      await onRefresh?.();
      const thread = root.querySelector('#stWsThread');
      if (thread) thread.scrollTop = thread.scrollHeight;
    })();
  });
}