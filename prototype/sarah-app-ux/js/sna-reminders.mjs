/**
 * SNA-01G/H — Sarah Reminders (PWA stage): local schedule + full-screen alarm UI.
 * Server scheduling lands in a later phase; this uses permission-aware client alerts.
 */
const STORAGE_KEY = 'sarah.sna.reminders.v1';
const TICK_MS = 15000;
const SNOOZE_MS = 5 * 60 * 1000;

let activeRing = null;
let tickTimer = null;

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Attention alarm — school reminders & urgent announcements (app open). */
export function playAttentionAlarm({ repeat = 3 } = {}) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0.14;
    gain.connect(ctx.destination);
    const pattern = [784, 988, 784, 1175];
    let t = ctx.currentTime;
    for (let r = 0; r < repeat; r += 1) {
      for (const freq of pattern) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.14);
        t += 0.18;
      }
      t += 0.12;
    }
    setTimeout(() => ctx.close(), Math.ceil((t - ctx.currentTime) * 1000) + 80);
  } catch {
    /* ignore */
  }
  if (navigator.vibrate) navigator.vibrate([280, 120, 280, 120, 400]);
}

function playAlarmTone() {
  playAttentionAlarm({ repeat: 3 });
}

function formatClock(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function showAlarm(reminder) {
  const shell = document.getElementById('sarahReminderAlarm');
  if (!shell) return;
  activeRing = reminder;
  const kicker = document.getElementById('sarahReminderAlarmLabel');
  if (kicker) kicker.textContent = reminder.alarmLabel || 'Sarah Reminder';
  document.getElementById('sarahReminderAlarmTime')?.replaceChildren(document.createTextNode(formatClock(reminder.fireAt)));
  const titleEl = document.getElementById('sarahReminderAlarmTitle');
  const bodyEl = document.getElementById('sarahReminderAlarmBody');
  if (titleEl) titleEl.textContent = reminder.title || 'Reminder';
  if (bodyEl) bodyEl.textContent = reminder.body || '';
  shell.classList.remove('hidden');
  shell.setAttribute('aria-hidden', 'false');
  playAlarmTone();
}

function hideAlarm() {
  const shell = document.getElementById('sarahReminderAlarm');
  shell?.classList.add('hidden');
  shell?.setAttribute('aria-hidden', 'true');
  activeRing = null;
}

function acknowledge(reminderId, status) {
  const list = loadAll();
  const next = list.map((r) =>
    r.id === reminderId ? { ...r, status, firedAt: r.firedAt || Date.now() } : r
  );
  saveAll(next);
}

/** Client-side backup when the server stored a reminder (fires even if poll is late). */
export function syncServerReminderSchedule({ id, title, body, dueAt } = {}) {
  if (!id || !dueAt) return null;
  const ms = Date.parse(dueAt);
  if (!Number.isFinite(ms)) return null;
  const list = loadAll().filter((r) => r.id !== id);
  const row = {
    id: String(id),
    title: String(title || 'Reminder').trim() || 'Reminder',
    body: String(body || '').trim(),
    fireAt: ms,
    status: 'scheduled',
    createdAt: Date.now(),
    source: 'server',
  };
  list.push(row);
  saveAll(list);
  return row;
}

export function scheduleReminder({ title, body, fireAt, id }) {
  const list = loadAll();
  const row = {
    id: id || `rem-${Date.now()}`,
    title: String(title || 'Reminder').trim() || 'Reminder',
    body: String(body || '').trim(),
    fireAt: Number(fireAt) || Date.now() + 60000,
    status: 'scheduled',
    createdAt: Date.now(),
  };
  list.push(row);
  saveAll(list);
  return row;
}

export function scheduleDemoReminder(minutesFromNow = 1) {
  const ms = Math.max(0.05, minutesFromNow) * 60 * 1000;
  return scheduleReminder({
    title: 'Time to leave for work',
    body: 'You asked Sarah to remind you so you can arrive at the office on time.',
    fireAt: Date.now() + ms,
  });
}

function dueReminders(now) {
  return loadAll().filter((r) => r.status === 'scheduled' && Number(r.fireAt) <= now);
}

function tick() {
  if (activeRing) return;
  const due = dueReminders(Date.now());
  if (!due.length) return;
  const next = due.sort((a, b) => a.fireAt - b.fireAt)[0];
  showAlarm(next);
}

function bindAlarmUi() {
  document.getElementById('sarahReminderSnooze')?.addEventListener('click', () => {
    if (!activeRing) return;
    const id = activeRing.id;
    const list = loadAll();
    const idx = list.findIndex((r) => r.id === id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        status: 'scheduled',
        fireAt: Date.now() + SNOOZE_MS,
      };
      saveAll(list);
    }
    hideAlarm();
  });
  document.getElementById('sarahReminderDismiss')?.addEventListener('click', () => {
    if (!activeRing) return;
    acknowledge(activeRing.id, 'dismissed');
    hideAlarm();
  });
}

export function initSarahReminders() {
  bindAlarmUi();
  if (tickTimer) return;
  tick();
  tickTimer = setInterval(tick, TICK_MS);
}

/** Full-screen alarm when the server reports a due reminder (app open). */
export function triggerServerReminderAlarm({ id, title, body } = {}) {
  showAlarm({
    id: id || `server-${Date.now()}`,
    title: title || 'Reminder',
    body: body || title || '',
    fireAt: Date.now(),
  });
}

/** School announcements that need immediate parent attention (app open). */
export function triggerSchoolAttentionAlert({ id, title, body, label = 'School announcement' } = {}) {
  const shell = document.getElementById('sarahReminderAlarm');
  if (!shell) {
    playAttentionAlarm({ repeat: 2 });
    return;
  }
  showAlarm({
    id: id || `ann-${Date.now()}`,
    title: title || label,
    body: body || title || '',
    fireAt: Date.now(),
  });
  const kicker = document.getElementById('sarahReminderAlarmLabel');
  if (kicker) kicker.textContent = label;
}
