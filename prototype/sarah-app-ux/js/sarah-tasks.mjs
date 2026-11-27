/**
 * ST-01 — Sarah Tasks UX (dashboard, categories, structured forms).
 * ST-02+ adds Firestore + server scheduling; proto tasks use localStorage until then.
 */
import {
  CATEGORY_TYPES,
  DEFAULT_DEPARTURE_PROFILES,
  INTERVIEW_CHECKLIST,
  SCHEMA_FORMS,
  TRIP_CHECKLIST,
  loadDepartureProfiles,
  saveDepartureProfiles,
  isExecutionTaskType,
  schemaKeyFor,
} from './sarah-tasks-catalog.mjs';

const STORAGE_KEY = 'sarah.st.tasks.proto.v1';

const CATEGORIES = [
  {
    id: 'reminders',
    title: 'Reminders & appointments',
    desc: 'Meetings, medical, birthdays, bills, deadlines',
    icon: 'clock',
    samples: ['Meeting reminder', 'Medical appointment', 'Bill payment'],
  },
  {
    id: 'preparation',
    title: 'Preparation tasks',
    desc: 'Interview, trip, meeting, exam, event, before you leave',
    icon: 'checklist',
    samples: ['Job interview', 'Trip', 'Before you leave'],
  },
  {
    id: 'applications',
    title: 'Applications & opportunities',
    desc: 'Jobs, study, funding, loans, accommodation',
    icon: 'doc',
    samples: ['Apply for a job', 'University application', 'Track deadline'],
  },
  {
    id: 'shopping',
    title: 'Shopping & errands',
    desc: 'Groceries, collections, deliveries, payments',
    icon: 'cart',
    samples: ['Buy groceries', 'Collect an order'],
  },
  {
    id: 'personal',
    title: 'Personal & daily',
    desc: 'Home, follow-ups, renewals, vehicle, goals',
    icon: 'home',
    samples: ['Renew documents', 'Follow up with someone'],
  },
  {
    id: 'delegate',
    title: 'Sarah, do this for me',
    desc: 'Research, compare, draft, book — with your approval',
    icon: 'spark',
    samples: ['Research something', 'Prepare a document', 'Book an appointment'],
  },
];

let view = 'hub'; // hub | categories | types | form | detail
let tab = 'today';
let categoryId = null;
let formKind = null;
let taskTypeId = null;
let detailTaskId = null;
let hooks = {};
let cachedReminders = [];
let remindersFetchedAt = 0;
let remindersInflight = null;
const REMINDER_CACHE_MS = 60_000;

function invalidateReminderCache() {
  remindersFetchedAt = 0;
}

function loadProtoTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProtoTasks(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function esc(s) {
  return hooks.escapeHtml ? hooks.escapeHtml(s) : String(s || '');
}

function iconSvg(name) {
  const map = {
    clock: '<path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    checklist: '<path d="M9 11l2 2 4-4M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>',
    cart: '<circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M1 1h4l2.6 13h9.8l2-8H6"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    spark: '<path d="M12 3l2.5 7.5L22 13l-7.5 2.5L12 23l-2.5-7.5L2 13l7.5-2.5L12 3z"/>',
  };
  return `<svg class="icon-svg icon-svg--md st-cat-icon" viewBox="0 0 24 24" aria-hidden="true">${map[name] || map.spark}</svg>`;
}

function taskStatusLabel(status) {
  if (status === 'completed') return 'Done';
  if (status === 'waiting') return 'Waiting';
  if (status === 'cancelled') return 'Cancelled';
  return 'Open';
}

function mapServerTask(t) {
  const raw = String(t?.status || '').toLowerCase();
  let status = 'open';
  if (raw === 'fired' || raw === 'completed') status = 'completed';
  else if (raw === 'cancelled' || raw === 'dismissed') status = 'cancelled';
  else if (raw === 'waiting') status = 'waiting';
  else if (raw === 'scheduled') status = 'open';
  else if (raw) status = raw;
  const displayDueAt = t.meta?.eventAt || t.meta?.meetingAt || t.dueAt;
  return {
    id: t.id,
    title: t.title,
    dueAt: displayDueAt || t.dueAt,
    status,
    kind: t.taskKind || t.type,
    categoryId: t.categoryId || (t.taskKind === 'reminder' ? 'reminders' : null),
    taskType: t.taskType,
    taskKind: t.taskKind,
    checklist: t.checklist,
    progress: t.progress,
    notes: t.notes,
    reminderSchedule: t.reminderSchedule,
    meta: t.meta,
    source: 'server',
  };
}

function mapLiveReminders(rows) {
  return (rows || []).map((r) => mapServerTask({ ...r, taskKind: r.taskKind || 'reminder' }));
}

async function pullLiveReminders() {
  if (hooks.fetchTasks) {
    const res = await hooks.fetchTasks({ limit: 80 });
    if (!res?.error) return (res.tasks || []).map(mapServerTask);
  }
  if (!hooks.fetchReminders) return [];
  const res = await hooks.fetchReminders({ limit: 40 });
  if (res?.error) return cachedReminders;
  return mapLiveReminders(res.reminders);
}

async function ensureReminders({ force = false } = {}) {
  const fresh = !force && Date.now() - remindersFetchedAt < REMINDER_CACHE_MS;
  if (fresh) return cachedReminders;
  if (remindersInflight) return remindersInflight;
  remindersInflight = pullLiveReminders()
    .then((list) => {
      cachedReminders = list;
      remindersFetchedAt = Date.now();
      return list;
    })
    .finally(() => {
      remindersInflight = null;
    });
  return remindersInflight;
}

function allTasks(reminders) {
  const proto = loadProtoTasks().filter((t) => !t.hiddenInList);
  const visible = (list) => list.filter((t) => t.status !== 'cancelled');
  if (hooks.fetchTasks && reminders.length) {
    const serverIds = new Set(reminders.map((t) => t.id));
    const shadowOnly = proto.filter((t) => t.meta?.reminderId && serverIds.has(t.meta.reminderId));
    const localOnly = proto.filter((t) => !serverIds.has(t.id) && !t.meta?.reminderId);
    return visible([...reminders, ...shadowOnly, ...localOnly]);
  }
  return visible([...proto, ...reminders]);
}

function filterTab(tasks, which) {
  const now = Date.now();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const isActive = (t) => t.status !== 'cancelled' && t.status !== 'completed';
  if (which === 'today') {
    return tasks.filter((t) => {
      const ms = Date.parse(t.dueAt);
      return isActive(t) && (t.status === 'open' || t.status === 'waiting') && Number.isFinite(ms) && ms >= startToday.getTime() && ms < endToday.getTime();
    });
  }
  if (which === 'upcoming') {
    return tasks.filter((t) => {
      const ms = Date.parse(t.dueAt);
      return isActive(t) && (t.status === 'open' || t.status === 'waiting') && Number.isFinite(ms) && ms >= endToday.getTime();
    });
  }
  if (which === 'preparation') {
    return tasks.filter(
      (t) => isActive(t) && (t.categoryId === 'preparation' || t.taskKind === 'preparation')
    );
  }
  if (which === 'open') {
    return tasks.filter((t) => isActive(t) && (t.status === 'open' || t.status === 'active' || t.status === 'waiting'));
  }
  if (which === 'waiting') return tasks.filter((t) => t.status === 'waiting');
  if (which === 'completed') return tasks.filter((t) => t.status === 'completed');
  if (which === 'templates') return [];
  return tasks;
}

function checklistProgress(checklist) {
  const list = Array.isArray(checklist) ? checklist : [];
  if (!list.length) return 0;
  const done = list.filter((c) => c.done).length;
  return Math.round((100 * done) / list.length);
}

function relTime(ms) {
  const diff = ms - Date.now();
  if (diff < 0) return 'now';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.round(h / 24)} days`;
}

function buildNextActions(tasks) {
  const open = tasks.filter(
    (t) => t.status !== 'cancelled' && (t.status === 'open' || t.status === 'active' || t.status === 'waiting')
  );
  const actions = [];
  for (const t of open) {
    const due = Date.parse(t.dueAt);
    if (Number.isFinite(due)) {
      const diff = due - Date.now();
      if (diff > 0 && diff < 6 * 3600_000) {
        actions.push({ id: t.id, text: `${t.title} — in ${relTime(due)}` });
      } else if (diff > 0 && diff < 48 * 3600_000) {
        actions.push({ id: t.id, text: `${t.title} — ${formatWhen(t.dueAt)}` });
      }
    }
    if (Array.isArray(t.checklist) && t.checklist.length) {
      const pct = checklistProgress(t.checklist);
      if (pct > 0 && pct < 100) actions.push({ id: t.id, text: `${t.title} checklist ${pct}% complete` });
      else if (pct === 0) actions.push({ id: t.id, text: `Start preparing: ${t.title}` });
    }
  }
  return actions.slice(0, 4);
}

function renderNextActions(tasks) {
  const actions = buildNextActions(tasks);
  if (!actions.length) {
    return '<section class="st-next st-next--empty"><h3 class="st-next-title">Sarah’s next actions</h3><p class="st-next-lead">No urgent actions — create a task when you’re ready.</p></section>';
  }
  return `<section class="st-next" aria-label="Sarah next actions">
    <h3 class="st-next-title">Sarah’s next actions</h3>
    <ul class="st-next-list">${actions.map((a) => `<li><button type="button" class="st-next-btn" data-st-task="${esc(a.id)}">${esc(a.text)}</button></li>`).join('')}</ul>
  </section>`;
}

function formatWhen(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Today · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function taskProgress(t) {
  if (Number.isFinite(t?.progress)) return Math.min(100, Number(t.progress));
  return Math.min(100, checklistProgress(t?.checklist) || 0);
}

function buildStats(tasks) {
  const open = tasks.filter((t) => t.status === 'open' || t.status === 'active').length;
  const waiting = tasks.filter((t) => t.status === 'waiting').length;
  const done = tasks.filter((t) => t.status === 'completed').length;
  const today = filterTab(tasks, 'today').length;
  return { open, waiting, done, today };
}

function renderTaskCards(tasks) {
  if (!tasks.length) {
    return '<li class="st-task-empty">No tasks here yet. Tap <strong>Create task</strong> to get started.</li>';
  }
  return tasks
    .map(
      (t) => `<li class="st-task-card"><button type="button" class="st-task-card-btn" data-st-task="${esc(t.id)}">
        <div class="st-task-card-top">
          <span class="st-task-card-title">${esc(t.title)}</span>
          <span class="st-task-card-status st-task-card-status--${esc(t.status)}">${esc(taskStatusLabel(t.status))}</span>
        </div>
        <p class="st-task-card-when">${t.dueAt ? esc(formatWhen(t.dueAt)) : 'No due date'}</p>
        <div class="st-task-card-bar"><span style="width:${taskProgress(t)}%"></span></div>
      </button></li>`
    )
    .join('');
}

function renderHub(reminders) {
  const tasks = allTasks(reminders);
  const stats = buildStats(tasks);
  const list = filterTab(tasks, tab);
  const tabs = [
    ['today', 'Today'],
    ['upcoming', 'Upcoming'],
    ['open', 'Open'],
    ['preparation', 'Preparation'],
    ['waiting', 'Waiting on me'],
    ['completed', 'Completed'],
    ['templates', 'Templates'],
  ];
  return `
    <header class="st-hero">
      <p class="st-kicker">Sarah Tasks</p>
      <h2 class="st-title">Plan it. Prepare for it. Remember it. Get it done.</h2>
      <p class="st-lead">Choose what you need — no chat required. Sarah manages reminders, checklists and follow-ups for you.</p>
      <button type="button" class="st-create-btn" id="stCreateTaskBtn">
        <svg class="icon-svg icon-svg--sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Create task
      </button>
    </header>
    <section class="st-stats" aria-label="Task overview">
      <article class="st-stat st-stat--purple"><span class="st-stat-val">${stats.today}</span><span class="st-stat-label">Today</span></article>
      <article class="st-stat st-stat--pink"><span class="st-stat-val">${stats.open}</span><span class="st-stat-label">Open</span></article>
      <article class="st-stat st-stat--green"><span class="st-stat-val">${stats.done}</span><span class="st-stat-label">Completed</span></article>
      <article class="st-stat st-stat--amber"><span class="st-stat-val">${stats.waiting}</span><span class="st-stat-label">Waiting</span></article>
    </section>
    ${renderNextActions(tasks)}
    <nav class="st-tabs" role="tablist">${tabs
      .map(
        ([id, label]) =>
          `<button type="button" class="st-tab${tab === id ? ' is-active' : ''}" role="tab" data-st-tab="${id}" aria-selected="${
            tab === id
          }">${label}</button>`
      )
      .join('')}</nav>
    <section class="st-list-wrap">${tab === 'templates' ? renderTemplates() : `<ul class="st-task-list">${renderTaskCards(list)}</ul>`}</section>
    <p class="st-footnote">Tasks save to your Sarah account when signed in. Reliable push when the app is closed arrives with ST-03.</p>
  `;
}

function renderTemplates() {
  const profiles = loadDepartureProfiles();
  const rows = Object.entries(profiles)
    .map(
      ([key, items]) => `<article class="st-template-card">
        <h4>${esc(key.replace(/_/g, ' '))}</h4>
        <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        <button type="button" class="ms-link-btn" data-st-template="departure-${esc(key)}">Use template</button>
      </article>`
    )
    .join('');
  return `<div class="st-templates">${rows}<article class="st-template-card"><h4>Job interview prep</h4><ul>${INTERVIEW_CHECKLIST.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><button type="button" class="ms-link-btn" data-st-template="interview">Use template</button></article></div>`;
}

function renderTypePicker() {
  const types = CATEGORY_TYPES[categoryId] || [];
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>${esc(cat?.title || 'Task type')}</h2>
      <p class="st-lead">Choose the option that matches what you need.</p>
    </header>
    <div class="st-cat-grid">${types
      .map(
        (t) => `<article class="st-cat-card">
        <span class="st-cat-title">${esc(t.title)}</span>
        <span class="st-cat-desc">${esc(t.desc)}</span>
        <button type="button" class="st-cat-select" data-st-type="${esc(t.id)}">Select</button>
      </article>`
      )
      .join('')}</div>`;
}

function renderCategories() {
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Choose a category</h2>
      <p class="st-lead">Sarah opens the right form for what you selected.</p>
    </header>
    <div class="st-cat-grid">${CATEGORIES.map(
      (c) => `<article class="st-cat-card">
        ${iconSvg(c.icon)}
        <span class="st-cat-title">${esc(c.title)}</span>
        <span class="st-cat-desc">${esc(c.desc)}</span>
        <button type="button" class="st-cat-select" data-st-category="${c.id}">Select</button>
      </article>`
    ).join('')}</div>`;
}

function renderMeetingForm() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Meeting reminder</h2>
    </header>
    <form class="st-form" id="stMeetingForm">
      <label class="st-field"><span>Meeting title</span><input name="title" required placeholder="e.g. Central Motors review" /></label>
      <label class="st-field"><span>Meeting with</span><input name="with" placeholder="People or organisation" /></label>
      <label class="st-field"><span>Location</span><input name="location" placeholder="Address or online link" /></label>
      <div class="st-field-row">
        <label class="st-field"><span>Date</span><input name="date" type="date" required value="${today}" /></label>
        <label class="st-field"><span>Time</span><input name="time" type="time" required /></label>
      </div>
      <label class="st-field"><span>Travel time (minutes)</span><input name="travel" type="number" min="0" step="5" placeholder="e.g. 45" /></label>
      <label class="st-field"><span>Prepare beforehand</span><textarea name="preparation" rows="2" placeholder="Documents to print, briefing to read…"></textarea></label>
      <fieldset class="st-fieldset"><legend>What to bring</legend>
        <label class="st-check"><input type="checkbox" name="take" value="Laptop" /> Laptop</label>
        <label class="st-check"><input type="checkbox" name="take" value="Meeting documents" /> Meeting documents</label>
        <label class="st-check"><input type="checkbox" name="take" value="Notebook and pen" /> Notebook and pen</label>
      </fieldset>
      <fieldset class="st-fieldset"><legend>Remind me (select all that apply)</legend>
        <label class="st-check"><input type="checkbox" name="remind" value="1440" checked /> 1 day before</label>
        <label class="st-check"><input type="checkbox" name="remind" value="60" checked /> 1 hour before</label>
        <label class="st-check"><input type="checkbox" name="remind" value="30" /> 30 minutes before</label>
        <label class="st-check"><input type="checkbox" name="remind" value="15" checked /> 15 minutes before</label>
        <label class="st-check"><input type="checkbox" name="remind" value="travel" checked /> When I should leave (uses travel time)</label>
      </fieldset>
      <label class="st-field"><span>Notes</span><textarea name="notes" rows="3" placeholder="Agenda, parking, dial-in…"></textarea></label>
      <aside class="st-preview" id="stFormPreview" aria-live="polite"></aside>
      <p class="st-proto-note">Sarah saves one meeting task and schedules each reminder time on your account.</p>
      <button type="submit" class="st-submit-btn">Create task</button>
    </form>`;
}

function renderInterviewForm() {
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Prepare for a job interview</h2>
    </header>
    <form class="st-form" id="stInterviewForm">
      <label class="st-field"><span>Position</span><input name="position" required /></label>
      <label class="st-field"><span>Company</span><input name="company" required /></label>
      <label class="st-field"><span>Interview location</span><input name="location" /></label>
      <div class="st-field-row">
        <label class="st-field"><span>Date</span><input name="date" type="date" required /></label>
        <label class="st-field"><span>Time</span><input name="time" type="time" required /></label>
      </div>
      <label class="st-field"><span>Online or in person?</span>
        <select name="mode"><option value="in_person">In person</option><option value="online">Online</option></select>
      </label>
      <label class="st-field"><span>Interview format</span>
        <select name="format"><option value="panel">In person — panel</option><option value="one">In person — one-to-one</option><option value="video">Video call</option><option value="phone">Phone</option></select>
      </label>
      <label class="st-field"><span>Job description (optional)</span><textarea name="jd" rows="3" placeholder="Paste key requirements…"></textarea></label>
      <label class="st-field"><span>Special instructions</span><textarea name="notes" rows="2"></textarea></label>
      <div class="st-checklist-preview"><h3>Sarah preparation plan</h3><ul>${INTERVIEW_CHECKLIST.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>
      <button type="submit" class="st-submit-btn">Save preparation task</button>
    </form>`;
}

function renderDepartureForm() {
  const profiles = loadDepartureProfiles();
  const opts = Object.keys(profiles)
    .map((k) => `<option value="${k}">${k.replace(/_/g, ' ')}</option>`)
    .join('');
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Before you leave</h2>
      <p class="st-lead">Reusable checklists — add your own items and save the profile.</p>
    </header>
    <form class="st-form" id="stDepartureForm">
      <label class="st-field"><span>Profile</span><select name="profile">${opts}</select></label>
      <label class="st-field"><span>Optional reminder time</span><input name="time" type="time" /></label>
      <ul class="st-dep-checklist" id="stDepList"></ul>
      <div class="st-add-item">
        <input type="text" name="newItem" placeholder="Add custom item" id="stDepNewItem" />
        <button type="button" class="st-cat-select st-add-item-btn" id="stDepAddItem">Add</button>
      </div>
      <label class="st-check"><input type="checkbox" name="saveProfile" checked /> Save changes to this profile</label>
      <button type="submit" class="st-submit-btn">Create checklist task</button>
    </form>`;
}

function renderTripForm() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Prepare for a trip</h2>
    </header>
    <form class="st-form" id="stTripForm">
      <label class="st-field"><span>Destination</span><input name="destination" required /></label>
      <div class="st-field-row">
        <label class="st-field"><span>Depart date</span><input name="date" type="date" required value="${today}" /></label>
        <label class="st-field"><span>Depart time</span><input name="time" type="time" required /></label>
      </div>
      <label class="st-field"><span>Return date</span><input name="return" type="date" /></label>
      <label class="st-field"><span>Purpose</span><input name="purpose" placeholder="Holiday, family, work…" /></label>
      <label class="st-field"><span>Transport</span><input name="transport" placeholder="Flight, car, train…" /></label>
      <label class="st-field"><span>Accommodation</span><input name="accommodation" placeholder="Hotel, address, booking ref" /></label>
      <div class="st-checklist-preview"><h3>Travel checklist</h3><ul>${TRIP_CHECKLIST.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p class="st-preview-note">Timeline reminders (7 / 3 / 1 day) activate with ST-03.</p></div>
      <button type="submit" class="st-submit-btn">Save trip preparation</button>
    </form>`;
}

function renderSchemaForm(schema) {
  const fields = (schema.fields || [])
    .map((f) => {
      if (f.type === 'textarea') {
        return `<label class="st-field"><span>${esc(f.label)}</span><textarea name="${esc(f.name)}" rows="3"${f.required ? ' required' : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}></textarea></label>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
        return `<label class="st-field"><span>${esc(f.label)}</span><select name="${esc(f.name)}"${f.required ? ' required' : ''}>${opts}</select></label>`;
      }
      const inputType = f.type === 'date' || f.type === 'time' || f.type === 'number' ? f.type : 'text';
      return `<label class="st-field"><span>${esc(f.label)}</span><input name="${esc(f.name)}" type="${inputType}"${f.required ? ' required' : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''} /></label>`;
    })
    .join('');
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>${esc(schema.heading)}</h2>
    </header>
    <form class="st-form" id="stSchemaForm" data-schema-key="${esc(schema.taskType)}">
      ${fields}
      <p class="st-proto-note">${esc(schema.footnote || 'Saved to your Sarah account when signed in on a paid plan.')}</p>
      <button type="submit" class="st-submit-btn">Save task</button>
    </form>`;
}

function findTaskById(id, reminders = cachedReminders) {
  const local = loadProtoTasks().find((t) => t.id === id);
  if (local) return local;
  const shadow = loadProtoTasks().find((t) => t.meta?.reminderId === id);
  const live = allTasks(reminders).find((t) => t.id === id);
  if (shadow && live) return { ...live, ...shadow, id, notes: shadow.notes || live.notes };
  return live || null;
}

function isMutableTaskId(id) {
  return String(id).startsWith('task-') || loadProtoTasks().some((t) => t.id === id && !t.hiddenInList);
}

function updateProtoTask(id, patch) {
  const list = loadProtoTasks();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const next = { ...list[idx], ...patch };
  if (patch.checklist) next.progress = checklistProgress(patch.checklist);
  list[idx] = next;
  saveProtoTasks(list);
  return next;
}

function deleteProtoTask(id) {
  saveProtoTasks(loadProtoTasks().filter((t) => t.id !== id));
}

function renderDetail(reminders) {
  const task = findTaskById(detailTaskId, reminders);
  if (!task) {
    return `<header class="st-subhead"><button type="button" class="st-back" data-st-back>← Back</button><p>Task not found.</p></header>`;
  }
  const pct = taskProgress(task);
  const proto = isMutableTaskId(detailTaskId);
  const schedule = Array.isArray(task.reminderSchedule) ? task.reminderSchedule : [];
  const scheduleHtml = schedule.length
    ? `<h3 class="st-detail-h">Reminder schedule</h3><ul class="st-detail-schedule">${schedule
        .map((r) => `<li>${esc(r.label || 'Reminder')} · ${esc(formatWhen(r.at))}</li>`)
        .join('')}</ul><p class="st-proto-note">Sarah schedules each time on your account. In-app chimes still run while Sarah is open.</p>`
  : '';
  const checklist =
    Array.isArray(task.checklist) && task.checklist.length
      ? `<ul class="st-detail-checklist">${task.checklist
          .map(
            (c, i) => `<li><label class="st-check"><input type="checkbox" data-st-check="${i}" ${c.done ? 'checked' : ''} /> ${esc(c.label)}</label></li>`
          )
          .join('')}</ul>`
      : '<p class="st-detail-empty">No checklist items.</p>';
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>${esc(task.title)}</h2>
      <p class="st-detail-meta"><span class="st-task-card-status st-task-card-status--${esc(task.status)}">${esc(taskStatusLabel(task.status))}</span>
      ${task.dueAt ? ` · ${esc(formatWhen(task.dueAt))}` : ''}</p>
    </header>
    <section class="st-detail">
      ${task.notes ? `<p class="st-detail-notes">${esc(String(task.notes))}</p>` : ''}
      <h3 class="st-detail-h">Checklist ${pct ? `(${pct}%)` : ''}</h3>
      ${checklist}
      ${scheduleHtml}
      <h3 class="st-detail-h">Sarah’s next action</h3>
      <p class="st-detail-next">${pct >= 100 ? 'Confirm task complete when you are finished.' : 'Work through your checklist — Sarah will nudge you at reminder times.'}</p>
      ${
        proto
          ? `<div class="st-detail-snooze">
        <h3 class="st-detail-h">Snooze</h3>
        <div class="st-snooze-row">
          <button type="button" class="st-tab" data-st-snooze="15">15 min</button>
          <button type="button" class="st-tab" data-st-snooze="60">1 hour</button>
          <button type="button" class="st-tab" data-st-snooze="1440">Tomorrow</button>
        </div>
        <form class="st-form st-reschedule" id="stRescheduleForm">
          <div class="st-field-row">
            <label class="st-field"><span>Reschedule date</span><input name="date" type="date" required /></label>
            <label class="st-field"><span>Time</span><input name="time" type="time" required /></label>
          </div>
          <button type="submit" class="ms-link-btn">Reschedule</button>
        </form>
      </div>`
          : ''
      }
      <div class="st-detail-actions">
        ${task.taskType === 'interview' ? '<button type="button" class="st-cat-select" data-st-mock-interview>Practise mock interview with Sarah</button>' : ''}
        <button type="button" class="st-cat-select" data-st-complete-task>Mark complete</button>
        <button type="button" class="ms-link-btn" data-st-ask-sarah>Ask Sarah for help</button>
        ${proto ? '<button type="button" class="ms-link-btn st-detail-cancel" data-st-cancel-task>Cancel task</button>' : ''}
      </div>
    </section>`;
}

function pickForm() {
  const kind = taskTypeId || formKind;
  if (kind === 'meeting') return renderMeetingForm();
  if (kind === 'interview') return renderInterviewForm();
  if (kind === 'departure') return renderDepartureForm();
  if (kind === 'trip') return renderTripForm();
  const schemaKey = schemaKeyFor(categoryId, kind) || kind;
  const schema = SCHEMA_FORMS[schemaKey] || SCHEMA_FORMS[kind];
  if (schema) return renderSchemaForm(schema);
  const types = CATEGORY_TYPES[categoryId] || [];
  const t = types.find((x) => x.id === kind);
  return renderSchemaForm({
    heading: t?.title || 'New task',
    taskType: kind,
    buildTitle: (fd) => String(fd.get('title') || t?.title || 'Task'),
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'date', label: 'Due date', type: 'date' },
      { name: 'time', label: 'Due time', type: 'time' },
      { name: 'notes', label: 'Details', type: 'textarea' },
    ],
  });
}

function paintSync() {
  const root = document.getElementById('stRoot');
  if (!root) return null;
  const reminders = cachedReminders;
  if (view === 'categories') root.innerHTML = renderCategories();
  else if (view === 'types') root.innerHTML = renderTypePicker();
  else if (view === 'form') root.innerHTML = pickForm();
  else if (view === 'detail') root.innerHTML = renderDetail(reminders);
  else root.innerHTML = renderHub(reminders);
  bind(root, reminders);
  return root;
}

function syncHubTabUi(root) {
  root.querySelectorAll('[data-st-tab]').forEach((btn) => {
    const active = btn.getAttribute('data-st-tab') === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function repaintHubBody(root, reminders = cachedReminders) {
  const tasks = allTasks(reminders);
  const wrap = root.querySelector('.st-list-wrap');
  if (!wrap) return;
  wrap.innerHTML =
    tab === 'templates' ? renderTemplates() : `<ul class="st-task-list">${renderTaskCards(filterTab(tasks, tab))}</ul>`;
  syncHubTabUi(root);
  bindTaskOpens(root);
  root.querySelectorAll('[data-st-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-st-template') || '';
      if (id.startsWith('departure-')) {
        categoryId = 'preparation';
        formKind = 'departure';
        view = 'form';
      } else if (id === 'interview') {
        categoryId = 'preparation';
        formKind = 'interview';
        view = 'form';
      }
      paint();
    });
  });
}

function applyHubReminders(root, reminders) {
  cachedReminders = reminders;
  if (view !== 'hub' || !root.isConnected) return;
  root.innerHTML = renderHub(reminders);
  bind(root, reminders);
}

function paint() {
  const root = paintSync();
  if (!root) return;
  if (view !== 'hub') return;
  void ensureReminders()
    .then((reminders) => applyHubReminders(root, reminders))
    .catch(() => {
      /* keep local proto tasks visible */
    });
}

function bindTaskOpens(root) {
  root.querySelectorAll('[data-st-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      detailTaskId = btn.getAttribute('data-st-task');
      view = 'detail';
      paint();
    });
  });
}

function bind(root, reminders) {
  root.querySelector('#stCreateTaskBtn')?.addEventListener('click', () => {
    view = 'categories';
    paint();
  });
  bindTaskOpens(root);
  root.querySelectorAll('[data-st-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.getAttribute('data-st-tab') || 'today';
      if (view === 'hub') repaintHubBody(root);
      else paint();
    });
  });
  root.querySelectorAll('[data-st-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (view === 'detail') {
        view = 'hub';
        detailTaskId = null;
      } else if (view === 'form') {
        view = 'types';
        formKind = null;
      } else if (view === 'types') {
        view = 'categories';
        categoryId = null;
        taskTypeId = null;
      } else if (view === 'categories') {
        view = 'hub';
      } else {
        view = 'hub';
        categoryId = null;
      }
      paint();
    });
  });
  root.querySelectorAll('[data-st-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryId = btn.getAttribute('data-st-category');
      taskTypeId = null;
      formKind = null;
      view = 'types';
      paint();
    });
  });
  root.querySelectorAll('[data-st-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      taskTypeId = btn.getAttribute('data-st-type');
      formKind = taskTypeId;
      view = 'form';
      paint();
    });
  });
  root.querySelectorAll('[data-st-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-st-template') || '';
      categoryId = 'preparation';
      if (id.startsWith('departure-')) {
        taskTypeId = 'departure';
        formKind = 'departure';
      } else {
        taskTypeId = 'interview';
        formKind = 'interview';
      }
      view = 'form';
      paint();
    });
  });

  if (view === 'detail' && detailTaskId) {
    root.querySelectorAll('[data-st-check]').forEach((box) => {
      box.addEventListener('change', () => {
        if (!isMutableTaskId(detailTaskId)) return;
        const task = findTaskById(detailTaskId, reminders);
        if (!task || !Array.isArray(task.checklist)) return;
        const idx = Number(box.getAttribute('data-st-check'));
        const checklist = task.checklist.map((c, i) => (i === idx ? { ...c, done: box.checked } : c));
        void persistTaskUpdate(detailTaskId, { checklist, progress: checklistProgress(checklist) }).then(() => paint());
      });
    });
    root.querySelector('[data-st-complete-task]')?.addEventListener('click', () => {
      void (async () => {
        if (isMutableTaskId(detailTaskId)) {
          await persistTaskUpdate(detailTaskId, { status: 'completed', progress: 100 });
          hooks.toast?.('Task marked complete.');
        } else hooks.toast?.('Live reminders complete in My Notifications.');
        view = 'hub';
        tab = 'completed';
        detailTaskId = null;
        paint();
      })();
    });
    root.querySelector('[data-st-cancel-task]')?.addEventListener('click', () => {
      void (async () => {
        if (String(detailTaskId).startsWith('task-')) {
          await persistTaskUpdate(detailTaskId, { status: 'cancelled' });
        } else {
          deleteProtoTask(detailTaskId);
        }
        hooks.toast?.('Task cancelled.');
        invalidateReminderCache();
        view = 'hub';
        detailTaskId = null;
        paint();
      })();
    });
    root.querySelector('[data-st-ask-sarah]')?.addEventListener('click', () => {
      const task = findTaskById(detailTaskId, reminders);
      const hint = task?.title ? `Help me with this Sarah Task: ${task.title}.` : '';
      hooks.onDelegate?.({ prompt: hint });
    });
    root.querySelector('[data-st-mock-interview]')?.addEventListener('click', () => {
      const task = findTaskById(detailTaskId, reminders);
      const company = task?.meta?.company || task?.title || 'the company';
      const role = task?.meta?.position || 'the role';
      hooks.onDelegate?.({
        prompt: `Run a short mock job interview with me for the role "${role}" at "${company}". Ask one question at a time, then brief feedback.`,
      });
    });
    root.querySelectorAll('[data-st-snooze]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void (async () => {
          const mins = Number(btn.getAttribute('data-st-snooze')) || 15;
          const task = findTaskById(detailTaskId, reminders);
          if (!task?.dueAt) {
            hooks.toast?.('No due time to snooze.');
            return;
          }
          let add = mins * 60_000;
          if (mins === 1440) {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0);
            add = d.getTime() - Date.parse(task.dueAt);
          }
          const dueAt = new Date(Date.parse(task.dueAt) + add).toISOString();
          await persistTaskUpdate(detailTaskId, { dueAt, status: 'open' });
          hooks.toast?.('Snoozed.');
          paint();
        })();
      });
    });
    root.querySelector('#stRescheduleForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void (async () => {
        const form = e.target;
        const dueAt = combineDateTime(form.querySelector('[name=date]')?.value, form.querySelector('[name=time]')?.value);
        if (!dueAt) {
          hooks.toast?.('Pick date and time.');
          return;
        }
        await persistTaskUpdate(detailTaskId, { dueAt });
        hooks.toast?.('Rescheduled.');
        paint();
      })();
    });
  }

  const meeting = root.querySelector('#stMeetingForm');
  meeting?.addEventListener('input', () => updateMeetingPreview(meeting));
  meeting?.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitMeeting(meeting);
  });

  const interview = root.querySelector('#stInterviewForm');
  interview?.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const saved = await persistTaskCreate({
        title: `Interview prep — ${interview.querySelector('[name=company]')?.value || interview.querySelector('[name=position]')?.value}`,
        dueAt: combineDateTime(
          interview.querySelector('[name=date]')?.value,
          interview.querySelector('[name=time]')?.value
        ),
        status: 'open',
        categoryId: 'preparation',
        taskType: 'interview',
        taskKind: 'preparation',
        checklist: INTERVIEW_CHECKLIST.map((label) => ({ label, done: false })),
        progress: 0,
        meta: Object.fromEntries(new FormData(interview)),
      });
      if (!saved) return;
      hooks.toast?.('Preparation task saved — open it for checklist and mock interview.');
      view = 'hub';
      tab = 'preparation';
      paint();
    })();
  });

  const trip = root.querySelector('#stTripForm');
  trip?.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const fd = new FormData(trip);
      const saved = await persistTaskCreate({
        title: `Trip — ${fd.get('destination') || 'Travel'}`,
        dueAt: combineDateTime(fd.get('date'), fd.get('time')),
        status: 'open',
        categoryId: 'preparation',
        taskType: 'trip',
        taskKind: 'preparation',
        checklist: TRIP_CHECKLIST.map((label) => ({ label, done: false })),
        progress: 0,
        notes: fd.get('accommodation') || '',
        meta: Object.fromEntries(fd),
      });
      if (!saved) return;
      hooks.toast?.('Trip preparation saved.');
      view = 'hub';
      tab = 'preparation';
      paint();
    })();
  });

  const departure = root.querySelector('#stDepartureForm');
  if (departure) {
    const profiles = loadDepartureProfiles();
    const sel = departure.querySelector('[name=profile]');
    let depItems = [];
    const paintDepList = () => {
      const list = root.querySelector('#stDepList');
      if (!list) return;
      list.innerHTML = depItems
        .map(
          (i, idx) =>
            `<li class="st-dep-row"><span>${esc(i)}</span><button type="button" class="st-dep-remove" data-st-dep-rm="${idx}" aria-label="Remove item">×</button></li>`
        )
        .join('');
      list.querySelectorAll('[data-st-dep-rm]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-st-dep-rm'));
          if (!Number.isFinite(idx)) return;
          depItems.splice(idx, 1);
          paintDepList();
        });
      });
    };
    const loadProfile = () => {
      const key = sel?.value || 'leaving_home';
      depItems = [...(profiles[key] || DEFAULT_DEPARTURE_PROFILES[key] || [])];
      paintDepList();
    };
    sel?.addEventListener('change', loadProfile);
    loadProfile();
    root.querySelector('#stDepAddItem')?.addEventListener('click', () => {
      const input = root.querySelector('#stDepNewItem');
      const val = String(input?.value || '').trim();
      if (!val) return;
      depItems.push(val);
      input.value = '';
      paintDepList();
    });
    departure.addEventListener('submit', (e) => {
      e.preventDefault();
      void (async () => {
        const key = sel.value;
        const fd = new FormData(departure);
        if (fd.get('saveProfile')) {
          profiles[key] = [...depItems];
          saveDepartureProfiles(profiles);
        }
        const timeVal = fd.get('time');
        const saved = await persistTaskCreate({
          title: `Before you leave — ${key.replace(/_/g, ' ')}`,
          dueAt: timeVal
            ? combineDateTime(new Date().toISOString().slice(0, 10), timeVal)
            : new Date(Date.now() + 3600000).toISOString(),
          status: 'open',
          categoryId: 'preparation',
          taskType: 'departure',
          taskKind: 'preparation',
          progress: 0,
          checklist: depItems.map((label) => ({ label, done: false })),
        });
        if (!saved) return;
        hooks.toast?.('Checklist ready — tap the task to tick items off.');
        view = 'hub';
        tab = 'preparation';
        paint();
      })();
    });
  }

  const schemaForm = root.querySelector('#stSchemaForm');
  schemaForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const fd = new FormData(schemaForm);
      const key = schemaForm.getAttribute('data-schema-key') || taskTypeId;
      const schema = SCHEMA_FORMS[key];
      const title = schema?.buildTitle ? schema.buildTitle(fd) : String(fd.get('title') || key);
      const isExecution = schema?.kind === 'execution' || isExecutionTaskType(key) || categoryId === 'delegate';
      const date = fd.get('date') || fd.get('deadline') || fd.get('start');
      const time = fd.get('time');
      const taskKind = isExecution ? 'execution' : categoryId === 'reminders' ? 'reminder' : 'preparation';
      const saved = await persistTaskCreate({
        title,
        dueAt:
          combineDateTime(date, time) ||
          (date ? combineDateTime(date, '09:00') : null) ||
          new Date(Date.now() + 3600000).toISOString(),
        status: isExecution ? 'waiting' : taskKind === 'reminder' ? 'scheduled' : 'open',
        categoryId,
        taskType: key,
        taskKind,
        progress: 0,
        notes: fd.get('notes') || fd.get('list') || '',
        checklist: (schema?.checklist || []).map((label) => ({ label, done: false })),
        meta: Object.fromEntries(fd),
      });
      if (!saved) return;
      if (isExecution) hooks.toast?.('Saved — Sarah will help after you approve in chat.');
      else hooks.toast?.('Task saved.');
      view = 'hub';
      tab = isExecution ? 'waiting' : 'open';
      paint();
    })();
  });
}

function combineDateTime(date, time) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function saveProto(task) {
  const list = loadProtoTasks();
  const id = task.id || `st-${Date.now()}`;
  const idx = list.findIndex((t) => t.id === id);
  const row = { ...task, id, createdAt: task.createdAt || new Date().toISOString() };
  if (idx >= 0) list[idx] = row;
  else list.unshift(row);
  saveProtoTasks(list);
  return row;
}

async function persistTaskCreate(task) {
  if (hooks.createTask) {
    const res = await hooks.createTask(task);
    if (res?.error) {
      if (res.code === 'TASK_ALLOWANCE') {
        hooks.toast?.('Sarah Tasks need a paid plan. Upgrade in Billing.');
      } else hooks.toast?.(res.error || 'Could not save task.');
      return null;
    }
    invalidateReminderCache();
    return res.task;
  }
  return saveProto(task);
}

async function persistTaskUpdate(id, patch) {
  if (hooks.updateTask && String(id).startsWith('task-')) {
    const res = await hooks.updateTask(id, patch);
    if (res?.error) {
      hooks.toast?.(res.error || 'Could not update task.');
      return null;
    }
    invalidateReminderCache();
    return res.task;
  }
  return updateProtoTask(id, patch);
}

function meetingLeadMinutes(fd) {
  const travel = Math.max(0, Number(fd.get('travel')) || 0);
  const reminds = fd.getAll('remind');
  const offsets = reminds
    .map((r) => (r === 'travel' ? travel + 10 : Number(r)))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return offsets.length ? Math.max(...offsets) : 15;
}

function updateMeetingPreview(form) {
  const fd = new FormData(form);
  const title = fd.get('title') || 'Meeting';
  const loc = fd.get('location') || 'your meeting';
  const withWho = fd.get('with');
  const travel = Number(fd.get('travel')) || 0;
  const lead = meetingLeadMinutes(fd);
  const take = fd.getAll('take').filter(Boolean);
  const userNotes = String(fd.get('notes') || '').trim();
  const prep = String(fd.get('preparation') || '').trim();
  const el = form.querySelector('#stFormPreview');
  if (!el) return;
  el.innerHTML = `<h4>Preview</h4>
    <p>Meeting: <strong>${esc(String(title))}</strong>${withWho ? ` with ${esc(String(withWho))}` : ''}</p>
    <p>At <strong>${esc(String(loc))}</strong> · first reminder about <strong>${lead}</strong> min before (or leave ${travel} min travel).</p>
    ${prep ? `<p>Prepare: ${esc(prep)}</p>` : ''}
    ${take.length ? `<p>Bring: ${take.map((t) => esc(t)).join(', ')}</p>` : ''}
    ${userNotes ? `<p>${esc(userNotes)}</p>` : ''}`;
}

function buildMeetingSchedule(fd, meetingMs) {
  const travel = Math.max(0, Number(fd.get('travel')) || 0);
  const rows = [];
  for (const r of fd.getAll('remind')) {
    if (r === 'travel' && travel > 0) {
      rows.push({
        label: `Leave (${travel} min travel)`,
        at: new Date(meetingMs - (travel + 5) * 60_000).toISOString(),
      });
    } else {
      const off = Number(r);
      if (Number.isFinite(off)) {
        rows.push({ label: `${off} min before`, at: new Date(meetingMs - off * 60_000).toISOString() });
      }
    }
  }
  return rows
    .filter((row) => Date.parse(row.at) > Date.now() + 5000)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

async function scheduleClientReminders(rows, title, body) {
  if (!rows?.length) return;
  try {
    const alarm = await import('./sna-reminders.mjs');
    rows.forEach((row, i) => {
      alarm.syncServerReminderSchedule({
        id: `st-mtg-${Date.now()}-${i}`,
        title,
        body: body || title,
        dueAt: row.at,
      });
    });
  } catch {
    /* ignore */
  }
}

async function submitMeeting(form) {
  const fd = new FormData(form);
  const title = String(fd.get('title') || 'Meeting').trim();
  const location = String(fd.get('location') || '').trim();
  const withWho = String(fd.get('with') || '').trim();
  const travel = Math.max(0, Number(fd.get('travel')) || 0);
  const leadMin = meetingLeadMinutes(fd);
  const dueIso = combineDateTime(fd.get('date'), fd.get('time'));
  if (!dueIso) {
    hooks.toast?.('Enter a valid date and time.');
    return;
  }
  const meetingMs = Date.parse(dueIso);
  let fireMs = meetingMs - leadMin * 60_000;
  if (fd.getAll('remind').includes('travel') && travel > 0) {
    fireMs = Math.min(fireMs, meetingMs - (travel + 5) * 60_000);
  }
  const reminderAt = new Date(Math.max(Date.now() + 30_000, fireMs)).toISOString();
  const take = fd.getAll('take').filter(Boolean);
  const userNotes = String(fd.get('notes') || '').trim();
  const prep = String(fd.get('preparation') || '').trim();
  const notes = [
    withWho && `With: ${withWho}`,
    location && `Where: ${location}`,
    travel && `Travel: ${travel} min`,
    prep && `Prepare: ${prep}`,
    take.length && `Bring: ${take.join(', ')}`,
    userNotes && `Notes: ${userNotes}`,
  ]
    .filter(Boolean)
    .join('. ');

  const schedule = buildMeetingSchedule(fd, meetingMs);
  const primaryNote = notes || title;

  const saved = await persistTaskCreate({
    title,
    dueAt: dueIso,
    status: 'scheduled',
    categoryId: 'reminders',
    taskType: 'meeting',
    taskKind: 'reminder',
    progress: 0,
    notes: primaryNote,
    reminderSchedule: schedule.length ? schedule : [{ label: `${leadMin} min before`, at: reminderAt }],
    meta: { eventAt: dueIso, with: withWho, travel, ...Object.fromEntries(fd) },
  });
  if (!saved) return;
  invalidateReminderCache();
  hooks.onReminderCreated?.(saved);
  void scheduleClientReminders(schedule, title, primaryNote);
  hooks.toast?.('Meeting reminder created.');
  view = 'hub';
  tab = 'today';
  paint();
}

function applyHooks(options = {}) {
  hooks = {
    escapeHtml: options.escapeHtml ?? hooks.escapeHtml,
    toast: options.toast ?? hooks.toast,
    fetchReminders: options.fetchReminders ?? hooks.fetchReminders,
    createReminder: options.createReminder ?? hooks.createReminder,
    onReminderCreated: options.onReminderCreated ?? hooks.onReminderCreated,
    onDelegate: options.onDelegate ?? hooks.onDelegate,
  };
}

export function mountSarahTasksHub(options = {}, { preserveNavigation = false } = {}) {
  applyHooks(options);
  if (!preserveNavigation) {
    view = 'hub';
    tab = 'today';
    categoryId = null;
    formKind = null;
    taskTypeId = null;
    detailTaskId = null;
  }
  paint();
}

export function refreshSarahTasksHub({ forceReminders = false } = {}) {
  if (forceReminders) invalidateReminderCache();
  paint();
}

export function resetSarahTasksView() {
  view = 'hub';
  tab = 'today';
  categoryId = null;
  formKind = null;
  taskTypeId = null;
  detailTaskId = null;
}