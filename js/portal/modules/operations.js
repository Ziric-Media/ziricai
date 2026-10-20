import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, errorState } from '../../admin/ui.js';
import { showToast } from '../../admin/ui.js';
import { renderEmptyState } from '../core/widgets/emptyState.js';
import { can } from '../permissions.js';
import {
  fetchPortalTasks,
  createPortalTask,
  updatePortalTask,
  fetchAiEmployees,
  fetchPortalTeam,
  fetchCrmCustomers,
} from '../api.js';
import { navigateTo } from '../router.js';
import {
  renderSarahHorizontalNav,
  renderSwKpiGrid,
  renderDonutChart,
  renderBarChart,
  renderSwChartCard,
  renderSwOverviewQuad,
  renderSparkBars,
  renderSarahWorkspaceChatShell,
} from '../sarahWorkspaceUi.js';
import { mountSarahChat } from '../sarah/sarah-ui.js';
import { mountWorkforceInstructionsPanel } from '../workforceInstructionsPanel.js';
import { getSarahPageContext } from '../core/sarahPageContext.js';

const OPS_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'fa-gauge-high' },
  { id: 'sarah', label: 'Sarah', sarah: true },
  { id: 'projects', label: 'Projects', icon: 'fa-folder-tree' },
  { id: 'tasks', label: 'Tasks', icon: 'fa-list-check' },
  { id: 'clients', label: 'Client database', icon: 'fa-database' },
  { id: 'workflows', label: 'Workflows & SLA', icon: 'fa-diagram-project' },
];

/** @type {string} */
let opsSection = 'overview';

const RETRY_BTN =
  '<button class="btn btn-secondary btn-sm" type="button" onclick="location.reload()">Retry</button>';

/** @type {{ tasks: object[], team: object[], agents: object[], filter: object } | null} */
let opsCache = null;

function taskStatusKey(task) {
  const s = String(task?.status || 'open').toLowerCase();
  if (s === 'completed') return 'done';
  return s;
}

function isDone(task) {
  return taskStatusKey(task) === 'done';
}

function isOverdue(task) {
  if (isDone(task) || !task?.dueAt) return false;
  const t = Date.parse(String(task.dueAt));
  return Number.isFinite(t) && t < Date.now();
}

function statusLabel(task) {
  if (isOverdue(task)) return 'Overdue';
  const s = taskStatusKey(task);
  if (s === 'in_progress') return 'In progress';
  if (s === 'done') return 'Completed';
  return 'Open';
}

function statusClass(task) {
  if (isOverdue(task)) return 'ops-pill ops-pill-overdue';
  const s = taskStatusKey(task);
  if (s === 'in_progress') return 'ops-pill ops-pill-progress';
  if (s === 'done') return 'ops-pill ops-pill-done';
  return 'ops-pill ops-pill-open';
}

function priorityClass(p) {
  const v = String(p || 'medium').toLowerCase();
  if (v === 'high') return 'ops-pill ops-pill-priority-high';
  if (v === 'low') return 'ops-pill ops-pill-priority-low';
  return 'ops-pill ops-pill-priority-med';
}

function formatDue(dueAt) {
  if (!dueAt) return '—';
  const t = Date.parse(String(dueAt));
  if (!Number.isFinite(t)) return escapeHtml(String(dueAt));
  return escapeHtml(new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
}

function formatTs(val) {
  if (!val) return '—';
  if (val._seconds != null) {
    return new Date(val._seconds * 1000).toLocaleString();
  }
  const t = Date.parse(String(val));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : escapeHtml(String(val));
}

/** Server-managed AI execution state (not the same as human task status). */
function formatExecutionStatus(task) {
  if (task?.assigneeType !== 'ai' && !task?.aiEmployeeId) return '—';
  const raw = String(task.executionStatus || 'queued').toLowerCase();
  const labels = {
    queued: 'Queued for AI',
    assigned: 'Assigned to AI',
    in_progress: 'AI working',
    retrying: 'Retry scheduled',
    completed: 'AI plan recorded',
    failed: 'AI execution failed',
  };
  let label = labels[raw] || raw.replace(/_/g, ' ');
  if (raw === 'retrying' && task.executionRetryAt) {
    label += ` · next ${formatTs(task.executionRetryAt)}`;
  }
  return label;
}

function assigneeLabel(task, teamByUid, agentsById) {
  if (task.assigneeType === 'ai' || task.aiEmployeeId) {
    const agent = agentsById.get(task.aiEmployeeId);
    return agent ? `AI · ${agent.name || agent.roleLabel || agent.id}` : `AI · ${task.aiEmployeeId || '—'}`;
  }
  const uid = task.assigneeUid || task.assigneeId;
  if (!uid) return 'Unassigned';
  const member = teamByUid.get(uid);
  if (member) return member.fullName || member.name || member.email || uid;
  if (uid === state.profile?.uid) return 'Myself';
  return uid;
}

function canCompleteTask(task) {
  const role = state.profile?.role;
  const uid = state.profile?.uid;
  if (!can(role, 'canCompleteTasks')) return false;
  if (can(role, 'canUpdateAnyTask')) return true;
  const assignee = task.assigneeUid || task.assigneeId || null;
  return assignee && uid && assignee === uid;
}

function canCreate() {
  return can(state.profile?.role, 'canCreateTasks');
}

function renderActivityLog(log) {
  const items = Array.isArray(log) ? log : [];
  if (!items.length) return '';
  return `<div class="ops-activity"><h5>Activity</h5><ul>${items
    .slice()
    .reverse()
    .map(
      (e) =>
        `<li><span class="muted">${escapeHtml(formatTs(e.at))}</span> — ${escapeHtml(e.message || e.type || '')}</li>`
    )
    .join('')}</ul></div>`;
}

function canAssignAi() {
  return can(state.profile?.role, 'canAssignTasks');
}

function applyFilters(tasks, filter) {
  let list = [...tasks];
  const q = String(filter.q || '').trim().toLowerCase();
  if (q) {
    list = list.filter((t) => {
      const hay = `${t.title || ''} ${t.description || ''} ${assigneeLabel(t, filter.teamByUid, filter.agentsById)}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (filter.status && filter.status !== 'all') {
    if (filter.status === 'overdue') {
      list = list.filter((t) => isOverdue(t));
    } else {
      list = list.filter((t) => taskStatusKey(t) === filter.status);
    }
  }
  if (filter.priority && filter.priority !== 'all') {
    list = list.filter((t) => String(t.priority || 'medium').toLowerCase() === filter.priority);
  }
  if (filter.assigneeType && filter.assigneeType !== 'all') {
    list = list.filter((t) => {
      const ai = t.assigneeType === 'ai' || Boolean(t.aiEmployeeId);
      return filter.assigneeType === 'ai' ? ai : !ai;
    });
  }
  list.sort((a, b) => {
    const da = Date.parse(String(a.dueAt || '')) || Infinity;
    const db = Date.parse(String(b.dueAt || '')) || Infinity;
    if (da !== db) return da - db;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  return list;
}

function countStats(tasks) {
  let open = 0;
  let inProgress = 0;
  let done = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (isOverdue(t)) overdue += 1;
    const s = taskStatusKey(t);
    if (s === 'done') done += 1;
    else if (s === 'in_progress') inProgress += 1;
    else open += 1;
  }
  return { open, inProgress, done, overdue, total: tasks.length };
}

function modalShell(id, title, bodyHtml, footerHtml) {
  return `
    <div class="ops-modal-backdrop" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="ops-modal">
        <div class="ops-modal-header">
          <h3 id="${id}-title">${escapeHtml(title)}</h3>
          <button type="button" class="ops-modal-close" data-close-modal="${id}" aria-label="Close">&times;</button>
        </div>
        <div class="ops-modal-body">${bodyHtml}</div>
        <div class="ops-modal-footer">${footerHtml}</div>
      </div>
    </div>`;
}

function bindModalClose(root) {
  root.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-close-modal'))?.remove();
    });
  });
  root.querySelectorAll('.ops-modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
  });
}

function teamOptions(team, selectedUid) {
  const selfUid = state.profile?.uid || '';
  const opts = [`<option value="${escapeHtml(selfUid)}" ${selectedUid === selfUid ? 'selected' : ''}>Myself</option>`];
  for (const m of team) {
    const uid = m.uid || m.id;
    if (!uid || uid === selfUid) continue;
    const label = m.fullName || m.name || m.email || uid;
    opts.push(
      `<option value="${escapeHtml(uid)}" ${selectedUid === uid ? 'selected' : ''}>${escapeHtml(label)}</option>`
    );
  }
  return opts.join('');
}

function agentOptions(agents, selectedId) {
  if (!agents.length) {
    return '<option value="">No AI employees provisioned</option>';
  }
  return agents
    .map((a) => {
      const label = `${a.name || a.id}${a.roleLabel ? ` — ${a.roleLabel}` : ''}`;
      return `<option value="${escapeHtml(a.id)}" ${selectedId === a.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function openNewTaskModal(container, ctx) {
  const { companyId, team, onSuccess } = ctx;
  const html = modalShell(
    'opsNewTaskModal',
    'New Task',
    `<p class="muted ops-modal-lead">Create work for yourself or an authorized team member.</p>
     <form id="opsNewTaskForm" class="ops-form">
       <label>Task title <input name="title" required maxlength="200" placeholder="What needs to be done?" /></label>
       <label>Task description <textarea name="description" rows="3" placeholder="Optional details"></textarea></label>
       <div class="ops-form-row">
         <label>Status
           <select name="status">
             <option value="open" selected>Open</option>
             <option value="in_progress">In progress</option>
           </select>
         </label>
         <label>Priority
           <select name="priority">
             <option value="low">Low</option>
             <option value="medium" selected>Medium</option>
             <option value="high">High</option>
           </select>
         </label>
       </div>
       <label>Due date <input type="datetime-local" name="dueAt" /></label>
       <label>Assignee
         <select name="assigneeUid">${teamOptions(team, state.profile?.uid || '')}</select>
       </label>
     </form>`,
    `<button type="button" class="btn btn-secondary" data-close-modal="opsNewTaskModal">Cancel</button>
     <button type="submit" form="opsNewTaskForm" class="btn btn-primary">Create Task</button>`
  );
  container.insertAdjacentHTML('beforeend', html);
  bindModalClose(container);
  container.querySelector('#opsNewTaskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = String(fd.get('title') || '').trim();
    if (!title) return;
    const body = {
      title,
      description: String(fd.get('description') || '').trim(),
      status: String(fd.get('status') || 'open'),
      priority: String(fd.get('priority') || 'medium'),
      assigneeType: 'human',
      assigneeUid: String(fd.get('assigneeUid') || state.profile?.uid || ''),
    };
    const dueRaw = String(fd.get('dueAt') || '').trim();
    if (dueRaw) body.dueAt = new Date(dueRaw).toISOString();

    const res = await createPortalTask(companyId, body);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    document.getElementById('opsNewTaskModal')?.remove();
    showToast('Task created', 'success');
    onSuccess();
  });
}

function openAssignAiModal(container, ctx) {
  const { companyId, agents, onSuccess } = ctx;
  const html = modalShell(
    'opsAiTaskModal',
    'Delegate to an AI Employee',
    `<p class="muted ops-modal-lead">Assign work to an AI employee. This queues the task — execution is tracked separately from completion.</p>
     <form id="opsAiTaskForm" class="ops-form">
       <label>AI employee
         <select name="aiEmployeeId" required ${agents.length ? '' : 'disabled'}>${agentOptions(agents, agents[0]?.id || '')}</select>
       </label>
       <label>Task title <input name="title" required maxlength="200" /></label>
       <label>Description / instructions <textarea name="description" rows="3" required placeholder="What should the AI employee do?"></textarea></label>
       <label>Success criteria <textarea name="aiInstructions" rows="2" placeholder="Optional — how you will judge success"></textarea></label>
       <div class="ops-form-row">
         <label>Priority
           <select name="priority">
             <option value="low">Low</option>
             <option value="medium" selected>Medium</option>
             <option value="high">High</option>
           </select>
         </label>
         <label>Due date <input type="datetime-local" name="dueAt" /></label>
       </div>
     </form>`,
    `<button type="button" class="btn btn-secondary" data-close-modal="opsAiTaskModal">Cancel</button>
     <button type="submit" form="opsAiTaskForm" class="btn btn-primary" ${agents.length ? '' : 'disabled'}>Assign Task</button>`
  );
  container.insertAdjacentHTML('beforeend', html);
  bindModalClose(container);
  container.querySelector('#opsAiTaskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = String(fd.get('title') || '').trim();
    const aiEmployeeId = String(fd.get('aiEmployeeId') || '').trim();
    if (!title || !aiEmployeeId) return;
    const body = {
      title,
      description: String(fd.get('description') || '').trim(),
      aiInstructions: String(fd.get('aiInstructions') || '').trim(),
      priority: String(fd.get('priority') || 'medium'),
      assigneeType: 'ai',
      aiEmployeeId,
      status: 'open',
    };
    const dueRaw = String(fd.get('dueAt') || '').trim();
    if (dueRaw) body.dueAt = new Date(dueRaw).toISOString();

    const res = await createPortalTask(companyId, body);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    document.getElementById('opsAiTaskModal')?.remove();
    showToast('Task assigned to AI (queued)', 'success');
    onSuccess();
  });
}

function openTaskDetail(container, task, ctx) {
  const { companyId, teamByUid, agentsById, onSuccess } = ctx;
  const exec = formatExecutionStatus(task);
  const actions = [];
  if (canCompleteTask(task) && !isDone(task)) {
    actions.push(`<button type="button" class="btn btn-primary btn-sm" id="opsDetailComplete">Mark complete</button>`);
  }
  if (can(state.profile?.role, 'canUpdateAnyTask') && !isDone(task) && taskStatusKey(task) !== 'in_progress') {
    actions.push(`<button type="button" class="btn btn-secondary btn-sm" id="opsDetailStart">Start progress</button>`);
  }

  const html = modalShell(
    'opsDetailModal',
    'Task details',
    `<div class="ops-detail">
       <h4 class="ops-detail-title">${escapeHtml(task.title || '(untitled)')}</h4>
       <p class="ops-detail-desc">${escapeHtml(task.description || task.notes || 'No description.')}</p>
       <dl class="ops-detail-grid">
         <div><dt>Status</dt><dd><span class="${statusClass(task)}">${escapeHtml(statusLabel(task))}</span></dd></div>
         <div><dt>Priority</dt><dd><span class="${priorityClass(task.priority)}">${escapeHtml(task.priority || 'medium')}</span></dd></div>
         <div><dt>Due</dt><dd>${formatDue(task.dueAt)}</dd></div>
         <div><dt>Assignee</dt><dd>${escapeHtml(assigneeLabel(task, teamByUid, agentsById))}</dd></div>
         <div><dt>Type</dt><dd>${task.assigneeType === 'ai' || task.aiEmployeeId ? 'AI employee' : 'Human'}</dd></div>
         <div><dt>AI execution</dt><dd>${escapeHtml(exec)}</dd></div>
         <div><dt>Created</dt><dd>${formatTs(task.createdAt)}</dd></div>
         <div><dt>Updated</dt><dd>${formatTs(task.updatedAt)}</dd></div>
       </dl>
       ${task.aiInstructions ? `<p class="muted"><strong>Success criteria:</strong> ${escapeHtml(task.aiInstructions)}</p>` : ''}
       ${task.executionError ? `<p class="ops-error">${escapeHtml(task.executionError)}</p>` : ''}
       ${task.executionResult ? `<p class="muted ops-exec-plan-note"><strong>Execution plan</strong> — review required; this is not marked as completed work until you close the task.</p><pre class="ops-exec-result">${escapeHtml(task.executionResult)}</pre>` : ''}
       ${renderActivityLog(task.activityLog)}
     </div>`,
    `${actions.join(' ')}<button type="button" class="btn btn-secondary" data-close-modal="opsDetailModal">Close</button>`
  );
  container.insertAdjacentHTML('beforeend', html);
  bindModalClose(container);
  container.querySelector('#opsDetailComplete')?.addEventListener('click', async () => {
    const res = await updatePortalTask(companyId, task.id, { status: 'done' });
    if (res.error) showToast(res.error, 'error');
    else {
      document.getElementById('opsDetailModal')?.remove();
      showToast('Task completed', 'success');
      onSuccess();
    }
  });
  container.querySelector('#opsDetailStart')?.addEventListener('click', async () => {
    const res = await updatePortalTask(companyId, task.id, { status: 'in_progress' });
    if (res.error) showToast(res.error, 'error');
    else {
      document.getElementById('opsDetailModal')?.remove();
      showToast('Task in progress', 'success');
      onSuccess();
    }
  });
}

function renderTaskList(tasks, ctx) {
  if (!tasks.length) {
    return renderEmptyState({
      title: 'No tasks match your filters',
      message: canCreate()
        ? 'Create a task or assign work to an AI employee.'
        : 'Tasks assigned to you will appear here.',
    });
  }
  return `<div class="ops-task-list">
    ${tasks
      .map((task) => {
        const id = escapeHtml(task.id);
        return `<button type="button" class="ops-task-row" data-task-id="${id}">
          <div class="ops-task-row-main">
            <span class="ops-task-row-title">${escapeHtml(task.title || '(untitled)')}</span>
            <span class="ops-task-row-meta">Assigned to: ${escapeHtml(assigneeLabel(task, ctx.teamByUid, ctx.agentsById))}</span>
          </div>
          <div class="ops-task-row-badges">
            <span class="${priorityClass(task.priority)}">${escapeHtml(String(task.priority || 'medium'))}</span>
            <span class="${statusClass(task)}">${escapeHtml(statusLabel(task))}</span>
            <span class="ops-task-row-due">${formatDue(task.dueAt)}</span>
          </div>
        </button>`;
      })
      .join('')}
  </div>`;
}

function countActiveProjects(tasks) {
  const ids = new Set();
  for (const t of tasks) {
    const pid = t.projectId || t.project || t.metadata?.projectId;
    if (pid) ids.add(String(pid));
  }
  if (ids.size) return ids.size;
  const open = tasks.filter((t) => !isDone(t)).length;
  return open ? Math.min(5, Math.max(1, Math.ceil(open / 4))) : 0;
}

function renderOpsOverviewPanel(stats, clientCount, projectCount) {
  const totalTasks = stats.open + stats.inProgress + stats.done;
  const quad = renderSwOverviewQuad(
    [
      renderSwChartCard(
        'Task mix',
        'Status breakdown',
        renderDonutChart(
          [
            { label: 'Open', value: stats.open, color: '#3b82f6' },
            { label: 'In progress', value: stats.inProgress, color: '#8b5cf6' },
            { label: 'Done', value: stats.done, color: '#10b981' },
            { label: 'Overdue', value: stats.overdue, color: '#ef4444' },
          ],
          { centerLabel: 'Tasks', centerValue: totalTasks, compact: true }
        )
      ),
      renderSwChartCard(
        'Delivery & clients',
        'Projects and CRM',
        renderBarChart([
          { label: 'Projects', value: projectCount, color: '#0ea5e9' },
          { label: 'Open tasks', value: stats.open, color: '#3b82f6' },
          { label: 'Clients', value: clientCount, color: '#6366f1' },
        ])
      ),
      renderSwChartCard(
        'Throughput',
        'Completion trend shape',
        renderSparkBars(
          [stats.open, stats.inProgress, stats.done, stats.overdue, stats.open, stats.inProgress, stats.done],
          { color: '#0284c7' }
        )
      ),
      renderSwChartCard(
        'Risk',
        'Overdue vs active',
        renderDonutChart(
          [
            { label: 'Overdue', value: stats.overdue, color: '#ef4444' },
            { label: 'On track', value: Math.max(0, stats.open + stats.inProgress - stats.overdue), color: '#10b981' },
          ],
          { centerLabel: 'Focus', centerValue: stats.overdue, compact: true }
        )
      ),
    ].join('')
  );
  return `${renderSwKpiGrid([
    { label: 'Active projects', value: projectCount, icon: 'fa-folder-open', tone: 'ops' },
    { label: 'Open tasks', value: stats.open, icon: 'fa-circle-dot', tone: 'ops' },
    { label: 'In progress', value: stats.inProgress, icon: 'fa-spinner', tone: 'accent' },
    { label: 'Clients', value: clientCount, icon: 'fa-users', tone: 'ops' },
    { label: 'Overdue', value: stats.overdue, icon: 'fa-triangle-exclamation', tone: 'warn' },
    { label: 'Completed', value: stats.done, icon: 'fa-check', tone: 'success' },
  ])}
  ${quad}
  <p class="sw-overview-tip"><i class="fa-solid fa-compass" aria-hidden="true"></i> Use <strong>Tasks</strong> for day-to-day work, <strong>Projects</strong> for grouped delivery, and <strong>Client database</strong> for CRM context.</p>`;
}

function renderOpsSarahPanel() {
  return renderSarahWorkspaceChatShell({
    title: 'Sarah',
    subtitle: 'Operations Assistant',
    intro:
      'Ask Sarah to summarise open work, explain task statuses, or navigate to clients and workflows. Task changes still happen in the Tasks workspace.',
    capabilities: [
      { icon: 'fa-list-check', label: 'Tasks & priorities' },
      { icon: 'fa-folder-tree', label: 'Projects & delivery' },
      { icon: 'fa-database', label: 'Client context' },
      { icon: 'fa-robot', label: 'AI employee assignments' },
    ],
    suggestions: [
      'What tasks are overdue?',
      'How do I assign work to an AI employee?',
      'Open the client database',
      'Explain task execution status',
    ],
    chatMountId: 'opsSarahPageChat',
    accent: 'ops',
  });
}

function renderOpsProjectsPanel() {
  return `<section class="card ops-shell-card">
    <div class="card-header"><h3><i class="fa-solid fa-folder-tree"></i> Projects</h3></div>
    <div class="card-body">
      <p class="muted">Group tasks into projects for delivery tracking. Full project boards connect when project IDs are set on tasks from the API.</p>
      ${renderEmptyState({
        title: 'No project boards yet',
        message: 'Create tasks with a project reference, or use Tasks while project grouping rolls out.',
        actionHtml: '<button type="button" class="btn btn-secondary btn-sm" data-ops-section-jump="tasks">Go to Tasks</button>',
      })}
    </div>
  </section>`;
}

function renderOpsClientsPanel(clientCount) {
  return `<section class="card ops-shell-card">
    <div class="card-header"><h3><i class="fa-solid fa-database"></i> Client database <span class="muted">(${clientCount})</span></h3></div>
    <div class="card-body">
      <p class="muted">Operational view of CRM clients linked to tasks and Sarah Operations.</p>
      <button type="button" class="btn btn-primary btn-sm" id="opsOpenCrm"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open full CRM</button>
    </div>
  </section>`;
}

function renderOpsWorkflowsPanel() {
  return `<section class="card ops-shell-card">
    <div class="card-header"><h3><i class="fa-solid fa-diagram-project"></i> Workflows & SLA</h3></div>
    <div class="card-body">
      <p class="muted">Automation runs, SLAs, and escalation paths for operations work will appear here.</p>
      <p class="fin-capability-badge fin-capability-badge--unavailable"><i class="fa-solid fa-eye-slash"></i> Preview · connect Automation module for live runs</p>
    </div>
  </section>`;
}

function renderOpsTasksPanel(tasks, team, agents, filter, stats) {
  const teamByUid = new Map();
  for (const m of team) {
    const uid = m.uid || m.id;
    if (uid) teamByUid.set(uid, m);
  }
  const agentsById = new Map(agents.map((a) => [a.id, a]));
  filter.teamByUid = teamByUid;
  filter.agentsById = agentsById;
  const filtered = applyFilters(tasks, filter);

  return `
    <div class="ops-kpi-grid ops-kpi-grid--compact">
      <div class="ops-kpi"><span class="ops-kpi-label">Open</span><span class="ops-kpi-value">${stats.open}</span></div>
      <div class="ops-kpi"><span class="ops-kpi-label">In progress</span><span class="ops-kpi-value">${stats.inProgress}</span></div>
      <div class="ops-kpi"><span class="ops-kpi-label">Completed</span><span class="ops-kpi-value">${stats.done}</span></div>
      <div class="ops-kpi ops-kpi-warn"><span class="ops-kpi-label">Overdue</span><span class="ops-kpi-value">${stats.overdue}</span></div>
    </div>
    <div class="card ops-toolbar-card">
      <div class="ops-toolbar">
        <input type="search" id="opsSearch" placeholder="Search tasks…" value="${escapeHtml(filter.q || '')}" />
        <select id="opsFilterStatus">
          <option value="all">All statuses</option>
          <option value="open" ${filter.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${filter.status === 'in_progress' ? 'selected' : ''}>In progress</option>
          <option value="done" ${filter.status === 'done' ? 'selected' : ''}>Completed</option>
          <option value="overdue" ${filter.status === 'overdue' ? 'selected' : ''}>Overdue</option>
        </select>
        <select id="opsFilterPriority">
          <option value="all">All priorities</option>
          <option value="high" ${filter.priority === 'high' ? 'selected' : ''}>High</option>
          <option value="medium" ${filter.priority === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="low" ${filter.priority === 'low' ? 'selected' : ''}>Low</option>
        </select>
        <select id="opsFilterType">
          <option value="all">Human & AI</option>
          <option value="human" ${filter.assigneeType === 'human' ? 'selected' : ''}>Human only</option>
          <option value="ai" ${filter.assigneeType === 'ai' ? 'selected' : ''}>AI only</option>
        </select>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="fa-solid fa-list-check"></i> Tasks <span class="muted">(${filtered.length})</span></h3></div>
      <div class="card-body" id="opsTaskListHost">${renderTaskList(filtered, filter)}</div>
    </div>`;
}

async function mountOpsSarahChat(container) {
  const root = container.querySelector('[data-sw-sarah-chat]');
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';
  const instrHost = container.querySelector('[data-workforce-instructions-host]');
  if (instrHost) await mountWorkforceInstructionsPanel(instrHost, { persistenceScope: 'opsSarah', adminView: false });

  await mountSarahChat(root, {
    mode: 'page',
    persistenceScope: 'opsSarah',
    welcomeMessage:
      "Hi! I'm Sarah, your Operations assistant. I can help you understand tasks, projects, and client context in this workspace.",
    suggestions: [
      'Summarise open and overdue tasks',
      'How do AI task assignments work?',
      'Take me to the client database',
      'What is execution status on AI tasks?',
    ],
    getPageContext: () => ({ ...getSarahPageContext(), module: 'operations', section: opsSection }),
  });
}

function renderPage(container, data) {
  const { tasks, team, agents, filter, clientCount = 0 } = data;
  const teamByUid = new Map();
  for (const m of team) {
    const uid = m.uid || m.id;
    if (uid) teamByUid.set(uid, m);
  }
  const agentsById = new Map(agents.map((a) => [a.id, a]));
  const stats = countStats(tasks);
  const projectCount = countActiveProjects(tasks);
  const companyId = state.companyId;
  const ctx = { companyId, team, agents, teamByUid, agentsById, onSuccess: () => renderOperations(container) };

  const headerActions =
    opsSection === 'tasks'
      ? `<div class="ops-header-actions">
        ${canCreate() ? '<button type="button" class="btn btn-primary" id="opsBtnNewTask"><i class="fa-solid fa-plus"></i> New Task</button>' : ''}
        ${canAssignAi() ? '<button type="button" class="btn btn-secondary" id="opsBtnAssignAi"><i class="fa-solid fa-robot"></i> Assign to AI</button>' : ''}
      </div>`
      : '';

  let panelHtml = '';
  switch (opsSection) {
    case 'sarah':
      panelHtml = renderOpsSarahPanel();
      break;
    case 'projects':
      panelHtml = renderOpsProjectsPanel();
      break;
    case 'tasks':
      panelHtml = renderOpsTasksPanel(tasks, team, agents, filter, stats);
      break;
    case 'clients':
      panelHtml = renderOpsClientsPanel(clientCount);
      break;
    case 'workflows':
      panelHtml = renderOpsWorkflowsPanel();
      break;
    case 'overview':
    default:
      panelHtml = renderOpsOverviewPanel(stats, clientCount, projectCount);
      break;
  }

  container.innerHTML = `
    <div class="sw-module ops-module">
      ${pageHeader(
        'Sarah Operations',
        `Delivery, tasks, and clients for ${escapeHtml(state.company?.name || 'your company')}.`,
        headerActions
      )}
      ${renderSarahHorizontalNav(OPS_SECTIONS, opsSection, 'data-ops-section')}
      <div class="sw-module-body ops-module-body" data-ops-panel>${panelHtml}</div>
    </div>
  `;

  container.querySelectorAll('[data-ops-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      opsSection = btn.getAttribute('data-ops-section') || 'overview';
      renderPage(container, data);
    });
  });
  container.querySelector('[data-sw-nav-select]')?.addEventListener('change', (e) => {
    opsSection = e.target.value || 'overview';
    renderPage(container, data);
  });
  container.querySelectorAll('[data-ops-section-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      opsSection = btn.getAttribute('data-ops-section-jump') || 'tasks';
      renderPage(container, data);
    });
  });
  container.querySelector('#opsOpenCrm')?.addEventListener('click', () => navigateTo('customers'));

  if (opsSection === 'sarah') void mountOpsSarahChat(container);

  if (opsSection !== 'tasks') return;

  const persistFilter = () => {
    opsCache = {
      ...data,
      filter: {
        q: container.querySelector('#opsSearch')?.value || '',
        status: container.querySelector('#opsFilterStatus')?.value || 'all',
        priority: container.querySelector('#opsFilterPriority')?.value || 'all',
        assigneeType: container.querySelector('#opsFilterType')?.value || 'all',
      },
    };
    renderPage(container, opsCache);
  };

  container.querySelector('#opsBtnNewTask')?.addEventListener('click', () => openNewTaskModal(container, ctx));
  container.querySelector('#opsBtnAssignAi')?.addEventListener('click', () => openAssignAiModal(container, ctx));
  container.querySelector('#opsSearch')?.addEventListener('input', () => persistFilter());
  container.querySelector('#opsFilterStatus')?.addEventListener('change', () => persistFilter());
  container.querySelector('#opsFilterPriority')?.addEventListener('change', () => persistFilter());
  container.querySelector('#opsFilterType')?.addEventListener('change', () => persistFilter());

  container.querySelectorAll('[data-task-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-task-id');
      const task = tasks.find((t) => t.id === id);
      if (task) openTaskDetail(container, task, ctx);
    });
  });
}

export async function renderOperations(container) {
  if (!can(state.profile?.role, 'canViewTasks')) {
    container.innerHTML = errorState('You do not have permission to view Operations.');
    return;
  }

  opsSection = opsSection || 'overview';
  container.innerHTML = loadingState('Loading Operations…');
  const companyId = state.companyId;

  const [taskRes, teamRes, agentRes, clientRes] = await Promise.all([
    fetchPortalTasks(companyId),
    state.team?.length ? Promise.resolve({ data: { items: state.team } }) : fetchPortalTeam(companyId),
    fetchAiEmployees(companyId),
    fetchCrmCustomers(companyId),
  ]);

  if (taskRes.error) {
    container.innerHTML = `
      ${pageHeader('Sarah Operations', '')}
      ${errorState(taskRes.error)}
      <div style="text-align:center;margin-top:12px;">${RETRY_BTN}</div>`;
    return;
  }

  const tasks = taskRes.data?.items || [];
  const team = teamRes.data?.items || teamRes.data || state.team || [];
  const agents = (agentRes.data?.items || agentRes.data || []).filter((a) => a.status !== 'archived');
  const clientCount = (clientRes.data?.items || clientRes.data || []).length;

  const filter = opsCache?.filter || { q: '', status: 'all', priority: 'all', assigneeType: 'all' };
  renderPage(container, { tasks, team, agents, filter, clientCount });
}
