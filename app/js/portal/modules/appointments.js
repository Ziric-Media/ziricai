import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, emptyState, loadingState, statusBadge } from '../../admin/ui.js';
import { can } from '../permissions.js';
import {
  fetchAppointments,
  createAppointmentApi,
  cancelAppointmentApi,
} from '../api.js';

export async function renderAppointments(container) {
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = emptyState('You do not have permission to view appointments.');
    return;
  }

  container.innerHTML = loadingState('Loading appointments...');
  const companyId = state.companyId;

  const res = await fetchAppointments(companyId, { upcoming: true });
  const items = res.data?.items || [];

  const today = new Date().toISOString().slice(0, 10);
  const todayItems = items.filter((a) => a.scheduledAt?.slice(0, 10) === today);
  const upcomingItems = items.filter((a) => a.scheduledAt?.slice(0, 10) !== today);

  container.innerHTML = `
    ${pageHeader(
      'Appointments',
      `Scheduling for ${escapeHtml(state.company?.name || 'your company')}.`,
      `<span class="ops-tag">${todayItems.length} today</span>`
    )}

    <div class="kpi-grid kpi-grid-ops" style="margin-bottom:1.5rem;">
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">Today</div><div class="value">${todayItems.length}</div></div>
          <div class="icon-wrapper green"><i class="fa-solid fa-calendar-day"></i></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="header">
          <div><div class="label">Upcoming</div><div class="value">${items.length}</div></div>
          <div class="icon-wrapper blue"><i class="fa-solid fa-calendar-check"></i></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><h3><i class="fa-solid fa-plus"></i> Book Appointment</h3></div>
      <div class="card-body">
        <form id="bookApptForm" class="portal-form-row">
          <input type="text" name="customerName" placeholder="Customer name" required />
          <input type="text" name="phone" placeholder="Phone (optional)" />
          <input type="datetime-local" name="scheduledAt" required />
          <input type="text" name="service" placeholder="Service type" value="Consultation" />
          <button type="submit" class="btn btn-primary btn-sm">Book</button>
        </form>
        <p class="muted" style="margin-top:8px;font-size:0.85rem;">
          <i class="fa-brands fa-google"></i> Google Calendar ·
          <i class="fa-brands fa-microsoft"></i> Microsoft 365 —
          <a href="#" data-nav="integrations">Connect calendars</a> to sync bookings.
        </p>
      </div>
    </div>

    ${renderSection('Today', todayItems)}
    ${renderSection('Upcoming', upcomingItems)}
  `;

  container.querySelector('#bookApptForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const scheduledAt = fd.get('scheduledAt');
    const result = await createAppointmentApi(companyId, {
      customerName: fd.get('customerName'),
      phone: fd.get('phone') || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      service: fd.get('service') || 'Consultation',
      source: 'portal',
    });
    if (result.error) {
      alert(result.error);
      return;
    }
    renderAppointments(container);
  });

  container.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancel this appointment?')) return;
      await cancelAppointmentApi(companyId, btn.dataset.cancel);
      renderAppointments(container);
    });
  });
}

function renderSection(title, items) {
  return `
    <div class="table-container" style="margin-bottom:1.5rem;">
      <div class="table-header"><h3><i class="fa-solid fa-calendar"></i> ${title}</h3></div>
      <table class="org-table">
        <thead><tr><th>Customer</th><th>Service</th><th>Scheduled</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${items.length
            ? items.map((a) => `
              <tr>
                <td><strong>${escapeHtml(a.customerName || '—')}</strong><br><span class="muted">${escapeHtml(a.phone || '')}</span></td>
                <td>${escapeHtml(a.service || '—')}</td>
                <td>${escapeHtml(a.scheduledAt?.slice(0, 16).replace('T', ' ') || '—')}</td>
                <td>${statusBadge(a.status || 'scheduled')}</td>
                <td>${a.status === 'scheduled' ? `<button class="btn btn-secondary btn-sm" data-cancel="${escapeHtml(a.id)}" type="button">Cancel</button>` : '—'}</td>
              </tr>
            `).join('')
            : `<tr><td colspan="5">${emptyState(`No ${title.toLowerCase()} appointments.`)}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}
