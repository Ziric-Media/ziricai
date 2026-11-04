import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState } from '../../admin/ui.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { can } from '../permissions.js';
import { fetchAppointments, fetchDentalPatients, createAppointmentApi, updateAppointmentApi } from '../api.js';
import { navigateTo } from '../router.js';
import { smilemorePracticeRibbon } from '../dental/smilemoreDentalGate.js';
import {
  SMILEMORE_LOCATIONS,
  SMILEMORE_SERVICES,
  SMILEMORE_CHANNELS,
  SMILEMORE_PUBLIC_TEAM,
  SMILEMORE_HOURS,
  practiceLabel,
  practiceWall,
  slotsForDate,
  slotTaken,
  digitsPhone,
} from '../dental/smilemorePractice.js';

const STATUS_LABEL = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  checked_in: 'Arrived',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  scheduled: 'Confirmed',
};

const NEXT_STATUS = {
  requested: ['confirmed', 'cancelled'],
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'completed', 'cancelled', 'no_show'],
  checked_in: ['completed', 'cancelled', 'no_show'],
};

function options(items, placeholder) {
  return `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('')}`;
}

function todayJohannesburg() {
  return practiceWall(new Date()).slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function channelLabel(id) {
  return SMILEMORE_CHANNELS.find((item) => item.id === id)?.label || id || 'Not recorded';
}

export async function renderDentalBookings(container) {
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = errorState('You do not have permission to view bookings.');
    return;
  }

  container.innerHTML = renderLoadingSkeleton({ label: 'Loading the booking diary…', cards: 3, rows: 2 });
  const companyId = state.companyId;
  const [res, patientRes] = await Promise.all([
    fetchAppointments(companyId, { upcoming: false }),
    fetchDentalPatients(companyId),
  ]);
  if (res.error) {
    container.innerHTML = `${pageHeader('Bookings', 'SmileMore booking diary.')}${errorState(res.error)}`;
    return;
  }

  const bookings = res.data?.items || [];
  const patientByPhone = new Map((patientRes.data?.items || []).map((patient) => [digitsPhone(patient.phone || patient.id), patient]));
  const today = todayJohannesburg();
  const counts = {
    requested: bookings.filter((item) => item.status === 'requested').length,
    confirmed: bookings.filter((item) => item.status === 'confirmed' || item.status === 'scheduled').length,
    today: bookings.filter((item) => practiceWall(item.scheduledAt).slice(0, 10) === today && !['cancelled', 'no_show'].includes(item.status)).length,
  };
  const canEdit = can(state.profile?.role, 'canReply');
  const locationOptions = options(SMILEMORE_LOCATIONS, 'Location');
  const serviceOptions = options(SMILEMORE_SERVICES, 'Visit type');
  const channelOptions = options(SMILEMORE_CHANNELS, 'Channel');
  const teamOptions = `<option value="">No clinician preference</option>${SMILEMORE_PUBLIC_TEAM.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;

  container.innerHTML = `
    <div class="dental-bookings">
      ${pageHeader(
        'Bookings',
        'Sarah Sales records requests from WhatsApp and the other connected channels. This diary is the booking record.',
        `<span class="ops-tag">${counts.today} today · ${counts.requested} requested</span>`
      )}
      ${smilemorePracticeRibbon()}
      <div class="dental-command-note" role="note">
        <i class="fa-solid fa-circle-info"></i>
        <span>Published hours: ${escapeHtml(SMILEMORE_HOURS)}. A request is not a confirmed booking. One 30-minute hold per location. The schedule shows the visit on the diary. Fees and scheme benefits are not calculated here.</span>
      </div>
      <div class="dental-bookings__stats">
        ${stat('Requested', counts.requested, 'fa-hourglass-half')}
        ${stat('Confirmed', counts.confirmed, 'fa-circle-check')}
        ${stat('Today', counts.today, 'fa-calendar-day')}
        ${stat('All records', bookings.length, 'fa-book-open')}
      </div>
      ${canEdit ? `
      <section class="card dental-bookings__composer">
        <div class="card-body">
          <h2><i class="fa-solid fa-calendar-plus"></i> Record a booking</h2>
          <form id="dentalBookingForm">
            <div class="dental-bookings__form">
              <label>Patient<input name="customerName" required maxlength="120" autocomplete="name" /></label>
              <label>Phone<input name="phone" required maxlength="40" autocomplete="tel" /></label>
              <label>Location<select name="locationId" required>${locationOptions}</select></label>
              <label>Visit<select name="serviceId" required>${serviceOptions}</select></label>
              <label>Channel<select name="channel" required>${channelOptions}</select></label>
              <label>Date<input name="diaryDate" type="date" required value="${today}" /></label>
              <label>Preference<select name="providerPreference">${teamOptions}</select></label>
              <label class="dental-bookings__status-field">Save as
                <select name="status">
                  <option value="requested">Requested</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </label>
            </div>
            <div id="dentalSlotPicker" class="dental-bookings__slots" aria-live="polite"></div>
            <input type="hidden" name="scheduledAt" required />
            <label class="dental-bookings__notes">Note<textarea name="notes" maxlength="500" rows="2" placeholder="Optional. No fees or clinical notes."></textarea></label>
            <p id="dentalBookingError" class="dental-bookings__error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primary">Save on the diary</button>
          </form>
        </div>
      </section>` : ''}
      <section class="card dental-bookings__schedule">
        <div class="card-body">
          <div class="dental-booking__top">
            <h2><i class="fa-solid fa-calendar-day"></i> Schedule</h2>
            <label>Day <input id="dentalScheduleDate" type="date" value="${today}" /></label>
          </div>
          <div id="dentalSchedule"></div>
        </div>
      </section>
      <div class="dental-bookings__filters" role="tablist">
        ${filterButton('active', 'Open', true)}
        ${filterButton('requested', 'Requested')}
        ${filterButton('confirmed', 'Confirmed')}
        ${filterButton('today', 'Today')}
        ${filterButton('all', 'All records')}
      </div>
      <div id="dentalBookingList"></div>
    </div>`;

  const form = container.querySelector('#dentalBookingForm');
  const errorEl = container.querySelector('#dentalBookingError');
  const slotHost = container.querySelector('#dentalSlotPicker');
  const scheduleHost = container.querySelector('#dentalSchedule');
  const scheduleDate = container.querySelector('#dentalScheduleDate');

  function paintSchedule() {
    if (!scheduleHost) return;
    const day = scheduleDate?.value || today;
    const rows = bookings
      .filter((booking) => practiceWall(booking.scheduledAt).slice(0, 10) === day)
      .sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')));
    scheduleHost.innerHTML = rows.length
      ? `<div class="dental-schedule">${rows.map((booking) => scheduleRow(booking, patientByPhone)).join('')}</div>`
      : '<p class="dental-bookings__empty-copy">No bookings on this day. Requests from Sarah Sales and the desk will show here with the client, time, and visit.</p>';
    scheduleHost.querySelectorAll('[data-open-client]').forEach((button) => {
      button.addEventListener('click', () => openPractice(button.dataset.openClient, 'dentalPatients'));
    });
    scheduleHost.querySelectorAll('[data-open-till]').forEach((button) => {
      button.addEventListener('click', () => openPractice(button.dataset.openTill, 'dentalPos'));
    });
    scheduleHost.querySelectorAll('[data-open-aid]').forEach((button) => {
      button.addEventListener('click', () => openPractice(button.dataset.openAid, 'dentalMedicalAid'));
    });
  }
  scheduleDate?.addEventListener('change', paintSchedule);
  paintSchedule();

  const draftRaw = sessionStorage.getItem(`smilemore-booking-draft-${companyId}`);
  if (draftRaw && form) {
    try {
      const draft = JSON.parse(draftRaw);
      if (draft.customerName) form.customerName.value = draft.customerName;
      if (draft.phone) form.phone.value = draft.phone;
      sessionStorage.removeItem(`smilemore-booking-draft-${companyId}`);
    } catch {
      sessionStorage.removeItem(`smilemore-booking-draft-${companyId}`);
    }
  }

  function showError(message) {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
  }

  function paintSlots() {
    if (!form || !slotHost) return;
    const date = form.diaryDate.value;
    const locationId = form.locationId.value;
    const chosen = form.scheduledAt.value;
    const slots = slotsForDate(date);
    if (!date) {
      slotHost.innerHTML = '<p>Choose a date.</p>';
      return;
    }
    if (!slots.length) {
      slotHost.innerHTML = '<p>Sunday is closed. Published hours are Monday to Friday and Saturday morning.</p>';
      form.scheduledAt.value = '';
      return;
    }
    if (!locationId) {
      slotHost.innerHTML = '<p>Choose a location to see which times are still open.</p>';
      return;
    }
    slotHost.innerHTML = slots.map((slot) => {
      const taken = slotTaken(bookings, slot.wall, locationId);
      const selected = chosen === slot.wall;
      return `<button type="button" class="dental-slot${selected ? ' is-selected' : ''}" data-slot="${slot.wall}" ${taken ? 'disabled' : ''}>${slot.label}${taken ? ' held' : ''}</button>`;
    }).join('');
    slotHost.querySelectorAll('[data-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        form.scheduledAt.value = button.dataset.slot;
        paintSlots();
      });
    });
  }

  form?.querySelector('[name="diaryDate"]')?.addEventListener('change', () => {
    form.scheduledAt.value = '';
    paintSlots();
  });
  form?.querySelector('[name="locationId"]')?.addEventListener('change', paintSlots);
  paintSlots();

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.scheduledAt) {
      showError('Choose an open time.');
      return;
    }
    const result = await createAppointmentApi(companyId, {
      customerName: data.customerName,
      phone: data.phone,
      locationId: data.locationId,
      serviceId: data.serviceId,
      scheduledAt: data.scheduledAt,
      channel: data.channel,
      providerPreference: data.providerPreference || null,
      notes: data.notes || '',
      status: data.status || 'requested',
      source: 'portal',
    });
    if (result.error) {
      showError(result.error);
      return;
    }
    renderDentalBookings(container);
  });

  const list = container.querySelector('#dentalBookingList');
  let filter = 'active';

  function paintList() {
    const rows = bookings.filter((booking) => {
      const status = String(booking.status || '').toLowerCase();
      if (filter === 'all') return true;
      if (filter === 'today') return practiceWall(booking.scheduledAt).slice(0, 10) === today;
      if (filter === 'confirmed') return status === 'confirmed' || status === 'scheduled';
      if (filter === 'requested') return status === 'requested';
      return !['cancelled', 'no_show', 'completed'].includes(status);
    });
    list.innerHTML = rows.length
      ? `<div class="dental-bookings__list">${rows.map((booking) => bookingCard(booking, canEdit)).join('')}</div>`
      : '<div class="card dental-bookings__empty"><div class="card-body"><h2>No bookings in this view</h2><p>New requests from Sarah Sales, WhatsApp, and the practice desk will appear here.</p></div></div>';

    list.querySelectorAll('[data-apply]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.apply;
        const card = button.closest('[data-booking]');
        const status = card.querySelector('[data-next-status]')?.value || '';
        const scheduledAt = card.querySelector('[data-move-time]')?.value || '';
        if (!status && !scheduledAt) return;
        button.disabled = true;
        const result = await updateAppointmentApi(companyId, id, {
          ...(status ? { status } : {}),
          ...(scheduledAt ? { scheduledAt } : {}),
        });
        if (result.error) {
          button.disabled = false;
          const note = card.querySelector('.dental-bookings__error');
          if (note) {
            note.hidden = false;
            note.textContent = result.error;
          }
          return;
        }
        renderDentalBookings(container);
      });
    });
  }

  container.querySelectorAll('[data-booking-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.bookingFilter;
      container.querySelectorAll('[data-booking-filter]').forEach((item) => {
        item.classList.toggle('is-selected', item === button);
        item.setAttribute('aria-selected', item === button ? 'true' : 'false');
      });
      paintList();
    });
  });
  paintList();
}

function openPractice(phone, page) {
  const companyId = state.companyId;
  if (page === 'dentalPos') sessionStorage.setItem(`smilemore-pos-patient-${companyId}`, phone);
  else sessionStorage.setItem(`smilemore-client-${companyId}`, phone);
  navigateTo(page);
}

function scheduleRow(booking, patientByPhone) {
  const phone = digitsPhone(booking.phone || booking.customerId);
  const patient = patientByPhone.get(phone);
  const aid = patient?.medicalAid?.scheme || 'No medical aid on file';
  const status = STATUS_LABEL[String(booking.status || '').toLowerCase()] || booking.status || 'Requested';
  const statusClass = String(booking.status || 'requested').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `<article class="dental-schedule__row">
    <div class="dental-schedule__time">
      <time datetime="${escapeHtml(booking.scheduledAt || '')}">${escapeHtml(practiceLabel(booking.scheduledAt))}</time>
      <span class="dental-schedule__status dental-schedule__status--${escapeHtml(statusClass)}">${escapeHtml(status)}</span>
    </div>
    <div class="dental-schedule__client">
      <strong>${escapeHtml(booking.customerName || 'Unnamed patient')}</strong>
      <span>${escapeHtml(booking.phone || 'No phone')}</span>
    </div>
    <div class="dental-schedule__field"><span>Visit</span><strong>${escapeHtml(booking.service || 'Not recorded')}</strong></div>
    <div class="dental-schedule__field"><span>Location</span><strong>${escapeHtml(booking.locationLabel || 'Not recorded')}</strong></div>
    <div class="dental-schedule__field"><span>Channel</span><strong>${escapeHtml(channelLabel(booking.channel || booking.source))}</strong></div>
    <div class="dental-schedule__field"><span>Medical aid</span><strong>${escapeHtml(aid)}</strong></div>
    ${phone ? `<div class="dental-schedule__actions"><button type="button" class="btn btn-secondary btn-sm" data-open-client="${escapeHtml(phone)}">Client</button><button type="button" class="btn btn-secondary btn-sm" data-open-till="${escapeHtml(phone)}">Till</button><button type="button" class="btn btn-secondary btn-sm" data-open-aid="${escapeHtml(phone)}">Aid</button></div>` : ''}
  </article>`;
}

function stat(label, value, icon) {
  return `<article class="dental-bookings__stat"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`;
}

function filterButton(id, label, selected = false) {
  return `<button type="button" data-booking-filter="${id}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected ? 'true' : 'false'}">${label}</button>`;
}

function bookingCard(booking, canEdit) {
  const status = String(booking.status || 'requested').toLowerCase();
  const label = STATUS_LABEL[status] || status;
  const next = NEXT_STATUS[status] || [];
  const preference = booking.providerPreference
    ? `<span>Preference: ${escapeHtml(booking.providerPreference)} — not a confirmed clinician</span>`
    : '';
  return `<article class="card dental-booking dental-booking--${escapeHtml(status)}" data-booking="${escapeHtml(booking.id)}">
    <div class="card-body">
      <div class="dental-booking__top">
        <div>
          <h2>${escapeHtml(booking.customerName || 'Unnamed patient')}</h2>
          <p>${escapeHtml(booking.phone || 'No phone recorded')}</p>
        </div>
        <span class="dental-booking__status">${escapeHtml(label)}</span>
      </div>
      <dl>
        <div><dt>When</dt><dd>${escapeHtml(booking.scheduledLabel || practiceLabel(booking.scheduledAt))}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(booking.locationLabel || 'Location not recorded')}</dd></div>
        <div><dt>Visit</dt><dd>${escapeHtml(booking.service || 'Visit not recorded')}</dd></div>
        <div><dt>Channel</dt><dd>${escapeHtml(channelLabel(booking.channel || booking.source))}</dd></div>
      </dl>
      ${preference}
      ${booking.notes ? `<p class="dental-booking__note">${escapeHtml(booking.notes)}</p>` : ''}
      ${canEdit && (next.length || !['completed', 'cancelled', 'no_show'].includes(status)) ? `
        <div class="dental-booking__actions">
          ${next.length ? `<select data-next-status aria-label="Change status"><option value="">Change status</option>${next.map((item) => `<option value="${item}">${STATUS_LABEL[item]}</option>`).join('')}</select>` : ''}
          ${!['completed', 'cancelled', 'no_show'].includes(status) ? `<input data-move-time type="datetime-local" aria-label="Move to another time" />` : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-apply="${escapeHtml(booking.id)}">Update</button>
        </div>
        <p class="dental-bookings__error" role="alert" hidden></p>` : ''}
    </div>
  </article>`;
}
