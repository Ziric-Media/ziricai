/**
 * SmileMore — 15-minute booking reminder for owner and reception (portal-wide popup).
 */
import { state } from '../core/dataStore.js';
import { escapeHtml } from '../../admin/ui.js';
import { fetchAppointments, fetchDentalPatients } from '../api.js';
import { isSmilemoreDentalCommandCentreTenant } from './smilemoreDentalGate.js';
import { normalizeRole } from '../permissions.js';
import { navigateTo } from '../router.js';
import { digitsPhone, practiceLabel, practiceDate } from './smilemorePractice.js';

const LEAD_MS = 15 * 60 * 1000;
const POLL_MS = 30 * 1000;
const ACTIVE_STATUS = new Set(['requested', 'confirmed', 'checked_in', 'scheduled']);

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
/** @type {string | null} */
let openBookingId = null;
/** @type {AudioContext | null} */
let audioContext = null;
let audioUnlockBound = false;

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  return audioContext;
}

function playReminderChime(ctx) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
  master.connect(ctx.destination);

  [587.33, 783.99].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const toneGain = ctx.createGain();
    toneGain.gain.value = index === 0 ? 0.55 : 0.4;
    oscillator.connect(toneGain);
    toneGain.connect(master);
    const start = now + index * 0.16;
    oscillator.start(start);
    oscillator.stop(start + 0.38);
  });
}

export function unlockBookingReminderAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function playBookingReminderSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playReminderChime(ctx)).catch(() => {});
      return;
    }
    playReminderChime(ctx);
  } catch {
    /* Browsers may block audio until user gesture — unlock handler runs on first click */
  }
}

function bindAudioUnlockOnce() {
  if (audioUnlockBound) return;
  audioUnlockBound = true;
  const unlock = () => {
    unlockBookingReminderAudio();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

function canReceiveReminder(role) {
  const r = normalizeRole(role);
  return r === 'owner' || r === 'reception';
}

function ackKey(companyId, bookingId) {
  return `smilemore-booking-reminder-ack-${companyId}-${bookingId}`;
}

function isAcknowledged(companyId, bookingId) {
  try {
    return sessionStorage.getItem(ackKey(companyId, bookingId)) === '1';
  } catch {
    return false;
  }
}

function acknowledge(companyId, bookingId) {
  try {
    sessionStorage.setItem(ackKey(companyId, bookingId), '1');
  } catch {
    /* ignore */
  }
}

function bookingStartMs(booking) {
  const date = practiceDate(booking?.scheduledAt);
  return date ? date.getTime() : NaN;
}

function channelLabel(id) {
  const map = {
    whatsapp: 'WhatsApp',
    phone: 'Phone',
    portal: 'Practice desk',
    'sarah-sales': 'Sarah Sales',
    walk-in: 'Walk-in',
  };
  return map[String(id || '').toLowerCase()] || id || 'Not recorded';
}

function pickNextReminder(bookings, nowMs) {
  const candidates = (bookings || [])
    .filter((booking) => {
      const status = String(booking.status || '').toLowerCase();
      if (!ACTIVE_STATUS.has(status)) return false;
      if (['cancelled', 'canceled', 'completed', 'no_show'].includes(status)) return false;
      const start = bookingStartMs(booking);
      if (!Number.isFinite(start)) return false;
      const diff = start - nowMs;
      return diff > 0 && diff <= LEAD_MS;
    })
    .sort((a, b) => bookingStartMs(a) - bookingStartMs(b));
  return candidates[0] || null;
}

function minutesUntil(startMs, nowMs) {
  return Math.max(1, Math.ceil((startMs - nowMs) / 60000));
}

function ensureOverlayHost() {
  let host = document.getElementById('dentalBookingReminderHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'dentalBookingReminderHost';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

function closeReminder() {
  openBookingId = null;
  const host = document.getElementById('dentalBookingReminderHost');
  if (host) host.innerHTML = '';
  document.body.classList.remove('dental-booking-reminder-open');
}

function renderReminder(booking, patient, nowMs) {
  const companyId = state.companyId;
  const startMs = bookingStartMs(booking);
  const mins = minutesUntil(startMs, nowMs);
  const clinician = booking.providerPreference
    ? `${booking.providerPreference} (preference — confirm at desk)`
    : 'No clinician assigned yet';
  const aid = patient?.medicalAid?.scheme || patient?.medicalAidScheme || 'Not on file';
  const host = ensureOverlayHost();
  openBookingId = booking.id;

  host.innerHTML = `
    <div class="dental-booking-reminder-overlay" role="dialog" aria-modal="true" aria-labelledby="dentalBookingReminderTitle">
      <article class="dental-booking-reminder-card">
        <header class="dental-booking-reminder-card__head">
          <span class="dental-booking-reminder-card__badge"><i class="fa-solid fa-bell"></i> Upcoming visit</span>
          <p class="dental-booking-reminder-card__countdown">Starts in about <strong>${mins}</strong> minute${mins === 1 ? '' : 's'}</p>
          <h2 id="dentalBookingReminderTitle">${escapeHtml(booking.customerName || 'Client')}</h2>
          <p class="dental-booking-reminder-card__sub">${escapeHtml(booking.phone || 'No phone on booking')}</p>
        </header>
        <dl class="dental-booking-reminder-card__facts">
          <div><dt>Arrival time</dt><dd>${escapeHtml(booking.scheduledLabel || practiceLabel(booking.scheduledAt))}</dd></div>
          <div><dt>Visit</dt><dd>${escapeHtml(booking.service || 'Not recorded')}</dd></div>
          <div><dt>Doctor / clinician</dt><dd>${escapeHtml(clinician)}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(booking.locationLabel || 'Not recorded')}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(String(booking.status || 'confirmed').replace(/_/g, ' '))}</dd></div>
          <div><dt>Channel</dt><dd>${escapeHtml(channelLabel(booking.channel || booking.source))}</dd></div>
          <div><dt>Medical aid</dt><dd>${escapeHtml(aid)}</dd></div>
        </dl>
        ${booking.notes ? `<p class="dental-booking-reminder-card__notes"><strong>Notes:</strong> ${escapeHtml(booking.notes)}</p>` : ''}
        <footer class="dental-booking-reminder-card__actions">
          <button type="button" class="btn btn-primary btn-sm" data-reminder-nav="appointments">Open bookings</button>
          <button type="button" class="btn btn-secondary btn-sm" data-reminder-client="${escapeHtml(digitsPhone(booking.phone || ''))}">Client file</button>
          <button type="button" class="btn btn-secondary btn-sm" data-reminder-dismiss>Acknowledge</button>
        </footer>
      </article>
    </div>`;

  document.body.classList.add('dental-booking-reminder-open');
  playBookingReminderSound();

  host.querySelector('[data-reminder-dismiss]')?.addEventListener('click', () => {
    acknowledge(companyId, booking.id);
    closeReminder();
  });

  host.querySelector('[data-reminder-nav="appointments"]')?.addEventListener('click', () => {
    acknowledge(companyId, booking.id);
    closeReminder();
    navigateTo('appointments');
  });

  host.querySelector('[data-reminder-client]')?.addEventListener('click', (event) => {
    const phone = event.currentTarget?.getAttribute('data-reminder-client');
    if (phone) {
      sessionStorage.setItem(`smilemore-client-${companyId}`, phone);
    }
    acknowledge(companyId, booking.id);
    closeReminder();
    navigateTo('dentalPatients');
  });

  host.querySelector('.dental-booking-reminder-overlay')?.addEventListener('click', (event) => {
    if (event.target?.classList?.contains('dental-booking-reminder-overlay')) {
      acknowledge(companyId, booking.id);
      closeReminder();
    }
  });
}

async function tick() {
  const companyId = state.companyId;
  if (!companyId || !isSmilemoreDentalCommandCentreTenant(companyId)) return;
  if (!canReceiveReminder(state.profile?.role)) return;
  if (document.visibilityState === 'hidden') return;

  const res = await fetchAppointments(companyId, { upcoming: true });
  const items = res.data?.items || res.data || [];
  const list = Array.isArray(items) ? items : [];
  const nowMs = Date.now();
  const next = pickNextReminder(list, nowMs);

  if (!next) {
    if (openBookingId) closeReminder();
    return;
  }

  if (isAcknowledged(companyId, next.id)) return;
  if (openBookingId === next.id) return;

  let patient = null;
  const phone = digitsPhone(next.phone || next.customerId);
  if (phone) {
    const patientRes = await fetchDentalPatients(companyId);
    const patients = patientRes.data?.items || [];
    patient = patients.find((row) => digitsPhone(row.phone || row.id) === phone) || null;
  }

  renderReminder(next, patient, nowMs);
}

export function startBookingReminderWatcher() {
  if (pollTimer) return;
  const companyId = state.companyId;
  if (!companyId || !isSmilemoreDentalCommandCentreTenant(companyId)) return;
  if (!canReceiveReminder(state.profile?.role)) return;

  bindAudioUnlockOnce();
  tick().catch(() => {});
  pollTimer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);

  document.addEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    tick().catch(() => {});
  }
}

export function stopBookingReminderWatcher() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibility);
  closeReminder();
}
