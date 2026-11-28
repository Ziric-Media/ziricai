/**
 * ST-UX-01 / ST-UX-04 — task conversation workspace.
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

function formatTimelineWhen(at) {
    if (!at) return 'When you set a date';
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) return String(at);
    return new Date(ms).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function timelineHtml(task, esc) {
    const rows = Array.isArray(task?.timeline) ? task.timeline : [];
    if (!rows.length) return '<p class="st-detail-empty">Sarah will build a timeline when this task has a due date.</p>';
    return `<ol class="st-ws-timeline">${rows
        .map(
            (row) =>
                `<li class="st-ws-timeline-item st-ws-timeline-item--${esc(row.kind || 'milestone')}"><time>${esc(formatTimelineWhen(row.at))}</time><span>${esc(row.label || '')}</span></li>`
        )
        .join('')}</ol>`;
}

function suggestionsHtml(task, esc) {
    const rows = Array.isArray(task?.suggestions) ? task.suggestions : [];
    if (!rows.length) return '';
    return `<h3 class="st-detail-h">Sarah suggests</h3><ul class="st-ws-suggestions">${rows
        .map((s) => `<li>${esc(s)}</li>`)
        .join('')}</ul>`;
}

function networkMatchHtml(networkMatch, esc) {
    const matches = networkMatch?.matches || [];
    if (!matches.length) {
        return '<p class="st-detail-empty">No Sarah Network listing matched this organisation yet. Sarah can still help using your notes.</p>';
    }
    const items = matches
        .map(
            (m) =>
                `<li class="st-network-match"><button type="button" class="ms-link-btn" data-st-open-discover="${esc(m.companyId)}">${esc(m.displayName)}${m.verified ? ' · verified' : ''}</button></li>`
        )
        .join('');
    return `<ul class="st-network-list">${items}</ul>`;
}

export function renderTaskWorkspace(task, session, esc, { networkMatch } = {}) {
    const messages = session?.messages || [];
    const phase = task?.sarahPhase || 'idle';
    const isDone = task?.lifecycleState === 'completed' || task?.status === 'completed';
    const isCancelled = task?.lifecycleState === 'cancelled' || task?.status === 'cancelled';
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
            ? `<ul class="st-ws-check st-ws-check--live">${task.checklist
                  .map(
                      (c, i) =>
                          `<li><button type="button" class="st-ws-check-btn${c.done ? ' is-done' : ''}" data-st-check-idx="${i}">${esc(c.label)}</button></li>`
                  )
                  .join('')}</ul>`
            : '<p class="st-detail-empty">No checklist yet.</p>';

    const due = task?.dueAt ? esc(new Date(task.dueAt).toLocaleString()) : 'No due date';
    const org = task?.meta?.organisation || task?.meta?.govDepartmentName || '';

    const actionRow = isDone
        ? '<p class="st-ws-done-note">This task is marked complete.</p>'
        : isCancelled
          ? '<p class="st-ws-done-note">This task was cancelled.</p>'
          : `<div class="st-ws-compose-actions">
          <button type="submit" class="st-cat-select st-ws-send">Send</button>
          <button type="button" class="ms-link-btn" data-st-ws-complete>Mark complete</button>
          <button type="button" class="ms-link-btn st-detail-cancel" data-st-ws-cancel>Cancel task</button>
        </div>`;

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
      ${
        task?.lifecycleState === 'awaiting_approval' && !isDone && !isCancelled
          ? `<div class="st-ws-quick">
        <button type="button" class="st-tab" data-st-ws-quick="Yes, go ahead and start.">Go ahead</button>
        <button type="button" class="st-tab" data-st-ws-quick="Not yet — I need to add more details.">Not yet</button>
      </div>`
          : ''
      }
      <form class="st-ws-composer" id="stWsComposer">
        <label class="st-ws-compose-label"><span class="visually-hidden">Message Sarah</span>
          <textarea name="message" rows="2" placeholder="Message Sarah about this task…" required ${isDone || isCancelled ? 'disabled' : ''}></textarea>
        </label>
        ${actionRow}
      </form>
    </section>
  <section class="st-ws-panel is-hidden" data-st-ws-panel="details" hidden>
      ${task?.notes ? `<p class="st-detail-notes">${esc(String(task.notes))}</p>` : ''}
      <dl class="st-ws-dl">
        <dt>Category</dt><dd>${esc(task?.categoryId || '—')}</dd>
        <dt>Type</dt><dd>${esc(task?.taskType || '—')}</dd>
        <dt>Kind</dt><dd>${esc(task?.taskKind || '—')}</dd>
        ${org ? `<dt>Organisation</dt><dd>${esc(org)}</dd>` : ''}
      </dl>
      <h3 class="st-detail-h">Sarah Network</h3>
      ${networkMatchHtml(networkMatch, esc)}
    </section>
    <section class="st-ws-panel is-hidden" data-st-ws-panel="progress" hidden>
      <div class="st-ws-intel-head">
        <h3 class="st-detail-h">Timeline</h3>
        <button type="button" class="ms-link-btn" data-st-ws-regen-intel>Refresh plan</button>
      </div>
      ${timelineHtml(task, esc)}
      <h3 class="st-detail-h">Checklist</h3>
      ${checklist}
      ${suggestionsHtml(task, esc)}
      ${task?.planSummary ? `<h3 class="st-detail-h">Sarah's plan</h3><p class="st-ws-plan">${esc(task.planSummary)}</p>` : ''}
    </section>`;
}

export function bindTaskWorkspace(root, { esc, hooks, onBack, onRefresh, networkMatch }) {
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
  root.querySelectorAll('[data-st-open-discover]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-st-open-discover');
      if (id && typeof globalThis.openDiscoverCompany === 'function') globalThis.openDiscoverCompany(id);
      else hooks.toast?.('Open Discover to view this organisation.');
    });
  });
  root.querySelectorAll('[data-st-check-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void (async () => {
        const idx = Number(btn.getAttribute('data-st-check-idx'));
        if (!Number.isFinite(idx) || !hooks.updateTask || !hooks.workspaceTaskId || !hooks.workspaceTask) return;
        const list = [...(hooks.workspaceTask.checklist || [])];
        if (!list[idx]) return;
        list[idx] = { ...list[idx], done: !list[idx].done };
        const done = list.filter((c) => c.done).length;
        const progress = list.length ? Math.round((done / list.length) * 100) : 0;
        await hooks.updateTask(hooks.workspaceTaskId, { checklist: list, progress });
        await onRefresh?.();
      })();
    });
  });
  const form = root.querySelector('#stWsComposer');
  root.querySelectorAll('[data-st-ws-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-st-ws-quick') || '';
      const area = form?.querySelector('textarea[name=message]');
      if (area) area.value = text;
      form?.requestSubmit();
    });
  });
  root.querySelector('[data-st-ws-complete]')?.addEventListener('click', () => {
    void (async () => {
      if (!hooks.updateTask || !hooks.workspaceTaskId) {
        hooks.toast?.('Sign in to update this task.');
        return;
      }
      await hooks.updateTask(hooks.workspaceTaskId, {
        status: 'completed',
        lifecycleState: 'completed',
        progress: 100,
      });
      hooks.toast?.('Task marked complete.');
      await onRefresh?.();
    })();
  });
  root.querySelector('[data-st-ws-regen-intel]')?.addEventListener('click', () => {
    void (async () => {
      if (!hooks.regenerateTaskIntelligence || !hooks.workspaceTaskId) {
        hooks.toast?.('Sign in to refresh Sarah’s plan.');
        return;
      }
      const res = await hooks.regenerateTaskIntelligence(hooks.workspaceTaskId);
      if (res?.error) {
        hooks.toast?.(res.error);
        return;
      }
      hooks.toast?.('Timeline and suggestions updated.');
      await onRefresh?.();
    })();
  });
  root.querySelector('[data-st-ws-cancel]')?.addEventListener('click', () => {
    void (async () => {
      if (!hooks.updateTask || !hooks.workspaceTaskId) return;
      if (!globalThis.confirm?.('Cancel this task?')) return;
      await hooks.updateTask(hooks.workspaceTaskId, { status: 'cancelled', lifecycleState: 'cancelled' });
      hooks.toast?.('Task cancelled.');
      onBack?.();
    })();
  });
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