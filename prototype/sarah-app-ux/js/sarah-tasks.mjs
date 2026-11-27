/**
 * ST-01 — Sarah Tasks UX (dashboard, categories, structured forms).
 * Engine persistence (ST-02+) lands later; meeting reminders use live API where available.
 */
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

const TEMPLATES = {
  departure: {
    leaving_home: ['Keys', 'Wallet', 'Phone', 'Medication'],
    going_to_work: ['Laptop', 'Access card', 'Lunch', 'Phone charger'],
    going_to_meeting: ['Documents', 'Laptop', 'Notebook and pen'],
    going_on_trip: ['ID', 'Tickets', 'Luggage', 'Chargers'],
    leaving_car: ['Phone', 'Keys', 'Valuables'],
    going_to_school: ['Books', 'Stationery', 'Assignments'],
  },
  interview: [
    'Prepare and print your CV',
    'Prepare copies of your qualifications',
    'Prepare your identity document',
    'Research the company',
    'Practise common interview questions',
    'Choose appropriate interview clothing',
    'Confirm the interview location',
    'Check transport arrangements',
    'Charge your phone',
    'Set out documents the night before',
  ],
};

let view = 'hub'; // hub | categories | form | detail
let tab = 'today';
let categoryId = null;
let formKind = null;
let hooks = {};

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

async function liveReminders() {
  if (!hooks.fetchReminders) return [];
  const res = await hooks.fetchReminders({ limit: 40 });
  if (res?.error) return [];
  return (res.reminders || []).map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.dueAt,
    status: r.status === 'fired' ? 'completed' : 'open',
    kind: 'reminder',
    categoryId: 'reminders',
    progress: r.status === 'fired' ? 100 : 0,
  }));
}

function allTasks(reminders) {
  return [...loadProtoTasks(), ...reminders];
}

function filterTab(tasks, which) {
  const now = Date.now();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  if (which === 'today') {
    return tasks.filter((t) => {
      const ms = Date.parse(t.dueAt);
      return t.status === 'open' && Number.isFinite(ms) && ms >= startToday.getTime() && ms < endToday.getTime();
    });
  }
  if (which === 'upcoming') {
    return tasks.filter((t) => {
      const ms = Date.parse(t.dueAt);
      return t.status === 'open' && Number.isFinite(ms) && ms >= endToday.getTime();
    });
  }
  if (which === 'open') return tasks.filter((t) => t.status === 'open' || t.status === 'active');
  if (which === 'waiting') return tasks.filter((t) => t.status === 'waiting');
  if (which === 'completed') return tasks.filter((t) => t.status === 'completed');
  if (which === 'templates') return [];
  return tasks;
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
      (t) => `<li class="st-task-card" data-st-task="${esc(t.id)}">
        <div class="st-task-card-top">
          <span class="st-task-card-title">${esc(t.title)}</span>
          <span class="st-task-card-status st-task-card-status--${esc(t.status)}">${esc(t.status === 'completed' ? 'Done' : 'Open')}</span>
        </div>
        <p class="st-task-card-when">${t.dueAt ? esc(formatWhen(t.dueAt)) : 'No due date'}</p>
        <div class="st-task-card-bar"><span style="width:${Math.min(100, t.progress || 0)}%"></span></div>
      </li>`
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
    <nav class="st-tabs" role="tablist">${tabs
      .map(
        ([id, label]) =>
          `<button type="button" class="st-tab${tab === id ? ' is-active' : ''}" role="tab" data-st-tab="${id}" aria-selected="${
            tab === id
          }">${label}</button>`
      )
      .join('')}</nav>
    <section class="st-list-wrap">${tab === 'templates' ? renderTemplates() : `<ul class="st-task-list">${renderTaskCards(list)}</ul>`}</section>
    <p class="st-footnote">ST-01 UX — full task engine (ST-02) adds server scheduling when Sarah is closed.</p>
  `;
}

function renderTemplates() {
  const rows = Object.entries(TEMPLATES.departure)
    .map(
      ([key, items]) => `<article class="st-template-card">
        <h4>${esc(key.replace(/_/g, ' '))}</h4>
        <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        <button type="button" class="ms-link-btn" data-st-template="departure-${esc(key)}">Use template</button>
      </article>`
    )
    .join('');
  return `<div class="st-templates">${rows}<article class="st-template-card"><h4>Job interview prep</h4><ul>${TEMPLATES.interview.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><button type="button" class="ms-link-btn" data-st-template="interview">Use template</button></article></div>`;
}

function renderCategories() {
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Choose a category</h2>
      <p class="st-lead">Sarah opens the right form for what you selected.</p>
    </header>
    <div class="st-cat-grid">${CATEGORIES.map(
      (c) => `<button type="button" class="st-cat-card" data-st-category="${c.id}">
        ${iconSvg(c.icon)}
        <span class="st-cat-title">${esc(c.title)}</span>
        <span class="st-cat-desc">${esc(c.desc)}</span>
      </button>`
    ).join('')}</div>`;
}

function renderMeetingForm() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Create meeting reminder</h2>
    </header>
    <form class="st-form" id="stMeetingForm">
      <label class="st-field"><span>Meeting title</span><input name="title" required placeholder="e.g. Central Motors review" /></label>
      <label class="st-field"><span>Location</span><input name="location" placeholder="Address or online link" /></label>
      <div class="st-field-row">
        <label class="st-field"><span>Date</span><input name="date" type="date" required value="${today}" /></label>
        <label class="st-field"><span>Time</span><input name="time" type="time" required /></label>
      </div>
      <fieldset class="st-fieldset"><legend>What should you take?</legend>
        <label class="st-check"><input type="checkbox" name="take" value="Laptop" /> Laptop</label>
        <label class="st-check"><input type="checkbox" name="take" value="Meeting documents" /> Meeting documents</label>
        <label class="st-check"><input type="checkbox" name="take" value="Notebook and pen" /> Notebook and pen</label>
      </fieldset>
      <fieldset class="st-fieldset"><legend>Remind me before</legend>
        <label class="st-radio"><input type="radio" name="lead" value="15" checked /> 15 minutes</label>
        <label class="st-radio"><input type="radio" name="lead" value="30" /> 30 minutes</label>
        <label class="st-radio"><input type="radio" name="lead" value="60" /> 1 hour</label>
        <label class="st-radio"><input type="radio" name="lead" value="1440" /> 1 day</label>
      </fieldset>
      <aside class="st-preview" id="stFormPreview" aria-live="polite"></aside>
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
      <label class="st-field"><span>Special instructions</span><textarea name="notes" rows="2"></textarea></label>
      <div class="st-checklist-preview"><h3>Sarah preparation plan</h3><ul>${TEMPLATES.interview.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>
      <button type="submit" class="st-submit-btn">Save preparation task</button>
    </form>`;
}

function renderDepartureForm() {
  const opts = Object.keys(TEMPLATES.departure)
    .map((k) => `<option value="${k}">${k.replace(/_/g, ' ')}</option>`)
    .join('');
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>Before you leave</h2>
      <p class="st-lead">Tick items before you walk out — Sarah nudges you at the right time.</p>
    </header>
    <form class="st-form" id="stDepartureForm">
      <label class="st-field"><span>Profile</span><select name="profile">${opts}</select></label>
      <label class="st-field"><span>Remind me at</span><input name="time" type="time" required /></label>
      <ul class="st-dep-checklist" id="stDepList"></ul>
      <button type="submit" class="st-submit-btn">Start checklist</button>
    </form>`;
}

function renderGenericForm(cat) {
  return `
    <header class="st-subhead">
      <button type="button" class="st-back" data-st-back>← Back</button>
      <h2>${esc(cat?.title || 'New task')}</h2>
    </header>
    <form class="st-form" id="stGenericForm">
      <label class="st-field"><span>What should Sarah help with?</span><input name="title" required placeholder="Short title" /></label>
      <label class="st-field"><span>Details</span><textarea name="notes" rows="3" placeholder="Dates, people, deadlines…"></textarea></label>
      <label class="st-field"><span>Due date</span><input name="date" type="date" /></label>
      <label class="st-field"><span>Due time</span><input name="time" type="time" /></label>
      <p class="st-proto-note">Prototype task — saved on this device until ST-02 syncs to Sarah Task Engine.</p>
      <button type="submit" class="st-submit-btn">Save task</button>
    </form>`;
}

function pickForm() {
  if (formKind === 'meeting') return renderMeetingForm();
  if (formKind === 'interview') return renderInterviewForm();
  if (formKind === 'departure') return renderDepartureForm();
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return renderGenericForm(cat);
}

async function paint() {
  const root = document.getElementById('stRoot');
  if (!root) return;
  const reminders = await liveReminders();
  if (view === 'categories') root.innerHTML = renderCategories();
  else if (view === 'form') root.innerHTML = pickForm();
  else root.innerHTML = renderHub(reminders);
  bind(root, reminders);
}

function bind(root, reminders) {
  root.querySelector('#stCreateTaskBtn')?.addEventListener('click', () => {
    view = 'categories';
    void paint();
  });
  root.querySelectorAll('[data-st-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.getAttribute('data-st-tab') || 'today';
      void paint();
    });
  });
  root.querySelectorAll('[data-st-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (view === 'form') {
        view = 'categories';
        formKind = null;
      } else {
        view = 'hub';
        categoryId = null;
      }
      void paint();
    });
  });
  root.querySelectorAll('[data-st-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryId = btn.getAttribute('data-st-category');
      if (categoryId === 'reminders') formKind = 'meeting';
      else if (categoryId === 'preparation') formKind = 'interview';
      else if (categoryId === 'delegate') {
        hooks.onDelegate?.();
        return;
      }
      view = 'form';
      if (categoryId === 'preparation') {
        const sub = window.confirm(
          'Job interview preparation? Choose OK. Choose Cancel for Before you leave checklist.'
        );
        formKind = sub ? 'interview' : 'departure';
      } else if (!formKind) {
        formKind = 'generic';
      }
      void paint();
    });
  });
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
      void paint();
    });
  });

  const meeting = root.querySelector('#stMeetingForm');
  meeting?.addEventListener('input', () => updateMeetingPreview(meeting));
  meeting?.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitMeeting(meeting);
  });

  const interview = root.querySelector('#stInterviewForm');
  interview?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProto({
      title: `Interview prep — ${interview.querySelector('[name=company]')?.value || interview.querySelector('[name=position]')?.value}`,
      dueAt: combineDateTime(
        interview.querySelector('[name=date]')?.value,
        interview.querySelector('[name=time]')?.value
      ),
      status: 'open',
      categoryId: 'preparation',
      checklist: TEMPLATES.interview.map((label) => ({ label, done: false })),
      progress: 0,
      meta: Object.fromEntries(new FormData(interview)),
    });
    hooks.toast?.('Preparation task saved — see Open tasks.');
    view = 'hub';
    tab = 'open';
    void paint();
  });

  const departure = root.querySelector('#stDepartureForm');
  if (departure) {
    const sel = departure.querySelector('[name=profile]');
    const syncList = () => {
      const key = sel?.value || 'leaving_home';
      const items = TEMPLATES.departure[key] || [];
      const list = root.querySelector('#stDepList');
      if (list) list.innerHTML = items.map((i) => `<li><label class="st-check"><input type="checkbox" /> ${esc(i)}</label></li>`).join('');
    };
    sel?.addEventListener('change', syncList);
    syncList();
    departure.addEventListener('submit', (e) => {
      e.preventDefault();
      const key = sel.value;
      saveProto({
        title: `Before you leave — ${key.replace(/_/g, ' ')}`,
        dueAt: combineDateTime(new Date().toISOString().slice(0, 10), departure.time.value),
        status: 'open',
        categoryId: 'preparation',
        progress: 0,
        checklist: (TEMPLATES.departure[key] || []).map((label) => ({ label, done: false })),
      });
      hooks.toast?.('Departure checklist ready.');
      view = 'hub';
      tab = 'today';
      void paint();
    });
  }

  const generic = root.querySelector('#stGenericForm');
  generic?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(generic);
    saveProto({
      title: String(fd.get('title') || 'Task'),
      dueAt: combineDateTime(fd.get('date'), fd.get('time')) || new Date(Date.now() + 3600000).toISOString(),
      status: 'open',
      categoryId,
      progress: 0,
      notes: fd.get('notes'),
    });
    hooks.toast?.('Task saved on this device.');
    view = 'hub';
    tab = 'open';
    void paint();
  });
}

function combineDateTime(date, time) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function saveProto(task) {
  const list = loadProtoTasks();
  list.unshift({
    ...task,
    id: `st-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  saveProtoTasks(list);
}

function updateMeetingPreview(form) {
  const fd = new FormData(form);
  const title = fd.get('title') || 'Meeting';
  const loc = fd.get('location') || 'your meeting';
  const lead = Number(fd.get('lead')) || 15;
  const take = fd.getAll('take').filter(Boolean);
  const el = form.querySelector('#stFormPreview');
  if (!el) return;
  el.innerHTML = `<h4>Preview</h4><p>Your meeting at <strong>${esc(String(loc))}</strong> is in ${lead} minutes.</p>${
    take.length ? `<p>Remember: ${take.map((t) => esc(t)).join(', ')}</p>` : ''
  }<p class="st-preview-note">${esc(title)}</p>`;
}

async function submitMeeting(form) {
  const fd = new FormData(form);
  const title = String(fd.get('title') || 'Meeting').trim();
  const location = String(fd.get('location') || '').trim();
  const leadMin = Number(fd.get('lead')) || 15;
  const dueIso = combineDateTime(fd.get('date'), fd.get('time'));
  if (!dueIso) {
    hooks.toast?.('Enter a valid date and time.');
    return;
  }
  const dueMs = Date.parse(dueIso) - leadMin * 60_000;
  const reminderAt = new Date(Math.max(Date.now() + 30_000, dueMs)).toISOString();
  const take = fd.getAll('take').filter(Boolean);
  const notes = [location && `Where: ${location}`, take.length && `Bring: ${take.join(', ')}`].filter(Boolean).join('. ');

  if (hooks.createReminder) {
    const res = await hooks.createReminder({
      title,
      dueAt: reminderAt,
      notes: notes || title,
    });
    if (res?.error) {
      hooks.toast?.(res.error);
      return;
    }
    hooks.onReminderCreated?.(res.reminder);
  } else {
    saveProto({ title, dueAt: reminderAt, status: 'open', categoryId: 'reminders', progress: 0, notes });
  }
  hooks.toast?.('Meeting reminder created.');
  view = 'hub';
  tab = 'today';
  void paint();
}

export function mountSarahTasksHub(options = {}) {
  hooks = {
    escapeHtml: options.escapeHtml,
    toast: options.toast,
    fetchReminders: options.fetchReminders,
    createReminder: options.createReminder,
    onReminderCreated: options.onReminderCreated,
    onDelegate: options.onDelegate,
  };
  view = 'hub';
  tab = 'today';
  void paint();
}

export function resetSarahTasksView() {
  view = 'hub';
  tab = 'today';
  categoryId = null;
  formKind = null;
}