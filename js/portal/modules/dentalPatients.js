import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState } from '../../admin/ui.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { can } from '../permissions.js';
import { fetchAppointments, fetchDentalPatients, fetchDentalSales, saveDentalPatientApi } from '../api.js';
import { navigateTo } from '../router.js';
import {
  SA_MEDICAL_SCHEMES,
  digitsPhone,
  practiceLabel,
} from '../dental/smilemorePractice.js';
import { isSmilemoreDentalCommandCentreTenant, smilemorePracticeRibbon } from '../dental/smilemoreDentalGate.js';

export async function renderDentalPatients(container) {
  if (!isSmilemoreDentalCommandCentreTenant(state.companyId)) {
    container.innerHTML = errorState('The client database is not available for this workspace.');
    return;
  }
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = errorState('You do not have permission to view client files.');
    return;
  }

  container.innerHTML = renderLoadingSkeleton({ label: 'Loading client files…', cards: 2, rows: 3 });
  const companyId = state.companyId;
  const [patientRes, bookingRes, salesRes] = await Promise.all([
    fetchDentalPatients(companyId),
    fetchAppointments(companyId, { upcoming: false }),
    fetchDentalSales(companyId),
  ]);
  if (patientRes.error) {
    container.innerHTML = `${pageHeader('Client database', 'SmileMore patient files.')}${errorState(patientRes.error)}`;
    return;
  }

  const patients = patientRes.data?.items || [];
  const bookings = bookingRes.data?.items || [];
  const sales = salesRes.data?.items || [];
  const selected = sessionStorage.getItem(`smilemore-client-${companyId}`) || '';
  const canEdit = can(state.profile?.role, 'canReply');

  container.innerHTML = `
    <div class="dental-patients">
      ${pageHeader('Client database', 'One file per person. WhatsApp bookings, the diary, the till, and medical-aid worksheets use the same phone number.')}
      ${smilemorePracticeRibbon()}
      <div class="dental-command-note"><i class="fa-solid fa-circle-info"></i><span>The next-step line is written by the practice. This file does not diagnose, recommend treatment, or calculate a fee.</span></div>
      <div class="dental-patients__layout">
        <section class="card">
          <div class="card-body">
            <label class="dental-patients__search">Find a client<input id="dentalPatientSearch" type="search" placeholder="Name or phone" /></label>
            <div id="dentalPatientList"></div>
          </div>
        </section>
        <section class="card">
          <div class="card-body" id="dentalPatientFile"><p>Select a client, or save a new file from their phone number.</p></div>
        </section>
      </div>
    </div>`;

  const listHost = container.querySelector('#dentalPatientList');
  const fileHost = container.querySelector('#dentalPatientFile');
  const search = container.querySelector('#dentalPatientSearch');
  let current = selected;

  function salesFor(phone) {
    const id = digitsPhone(phone);
    return sales
      .filter((sale) => digitsPhone(sale.phone) === id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function visitsFor(phone) {
    const id = digitsPhone(phone);
    return bookings
      .filter((booking) => digitsPhone(booking.phone || booking.customerId) === id)
      .sort((a, b) => String(b.scheduledAt || '').localeCompare(String(a.scheduledAt || '')));
  }

  function paintList() {
    const query = search.value.trim().toLowerCase();
    const rows = patients.filter((patient) => {
      const hay = `${patient.fullName || ''} ${patient.phone || ''}`.toLowerCase();
      return !query || hay.includes(query);
    });
    listHost.innerHTML = rows.length
      ? rows.map((patient) => {
          const id = digitsPhone(patient.phone || patient.id);
          const count = visitsFor(id).length;
          return `<button type="button" class="dental-patients__person${id === current ? ' is-selected' : ''}" data-patient="${escapeHtml(id)}">
            <strong>${escapeHtml(patient.fullName || 'Unnamed')}</strong>
            <span>${escapeHtml(patient.phone || '')} · ${count} visit${count === 1 ? '' : 's'}</span>
          </button>`;
        }).join('')
      : '<p>No client files yet. Add a client on the till, or save a booking.</p>';
    listHost.querySelectorAll('[data-patient]').forEach((button) => {
      button.addEventListener('click', () => {
        current = button.dataset.patient;
        sessionStorage.setItem(`smilemore-client-${companyId}`, current);
        paintList();
        paintFile();
      });
    });
  }

  function paintFile() {
    const patient = patients.find((item) => digitsPhone(item.phone || item.id) === current);
    if (!patient) {
      fileHost.innerHTML = '<p>Select a client from the list.</p>';
      return;
    }
    const visits = visitsFor(patient.phone);
    const receipts = salesFor(patient.phone);
    const aid = patient.medicalAid || {};
    fileHost.innerHTML = `
      <h2>${escapeHtml(patient.fullName)}</h2>
      <form id="dentalPatientForm" class="dental-patients__form">
        <label>Name<input name="fullName" required value="${escapeHtml(patient.fullName || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>Phone<input name="phone" required value="${escapeHtml(patient.phone || '')}" disabled /></label>
        <label>Gender<select name="gender" ${canEdit ? '' : 'disabled'}>
          <option value="">Not recorded</option>
          <option value="male"${patient.gender === 'male' ? ' selected' : ''}>Male</option>
          <option value="female"${patient.gender === 'female' ? ' selected' : ''}>Female</option>
        </select></label>
        <label class="dental-patients__wide">Address<input name="address" value="${escapeHtml(patient.address || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>Paying with<select name="paymentPreference" ${canEdit ? '' : 'disabled'}>
          <option value="">Not recorded</option>
          <option value="cash"${patient.paymentPreference === 'cash' ? ' selected' : ''}>Cash</option>
          <option value="medical_aid"${patient.paymentPreference === 'medical_aid' ? ' selected' : ''}>Medical aid</option>
        </select></label>
        <label>Email<input name="email" type="email" value="${escapeHtml(patient.email || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>ID number<input name="idNumber" inputmode="numeric" maxlength="13" value="${escapeHtml(patient.idNumber || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>Date of birth<input name="dateOfBirth" type="date" value="${escapeHtml(patient.dateOfBirth || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>Medical scheme<select name="scheme" ${canEdit ? '' : 'disabled'}>${schemeOptions(aid.scheme)}</select></label>
        <label>Option<input name="option" value="${escapeHtml(aid.option || '')}" placeholder="As on the card" ${canEdit ? '' : 'disabled'} /></label>
        <label>Membership number<input name="membershipNumber" value="${escapeHtml(aid.membershipNumber || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>Dependant code<input name="dependantCode" value="${escapeHtml(aid.dependantCode || '')}" placeholder="As on the card" ${canEdit ? '' : 'disabled'} /></label>
        <label>Principal member<input name="principalMemberName" value="${escapeHtml(aid.principalMemberName || '')}" ${canEdit ? '' : 'disabled'} /></label>
        <label>Relationship<select name="relationship" ${canEdit ? '' : 'disabled'}>
          <option value="">Not recorded</option>
          <option value="principal"${aid.relationship === 'principal' ? ' selected' : ''}>Principal member</option>
          <option value="dependant"${aid.relationship === 'dependant' ? ' selected' : ''}>Dependant</option>
        </select></label>
        <label class="dental-patients__wide">Next step for the practice<textarea name="nextStep" rows="2" ${canEdit ? '' : 'disabled'}>${escapeHtml(patient.nextStep || '')}</textarea></label>
        <label class="dental-patients__wide">File note<textarea name="notes" rows="3" ${canEdit ? '' : 'disabled'}>${escapeHtml(patient.notes || '')}</textarea></label>
        <p id="dentalPatientError" class="dental-bookings__error" role="alert" hidden></p>
        <div class="dental-booking__actions">
          ${canEdit ? '<button class="btn btn-primary btn-sm" type="submit">Save file</button>' : ''}
          <button class="btn btn-secondary btn-sm" type="button" id="bookReturningClient">Book again</button>
          <button class="btn btn-secondary btn-sm" type="button" id="useOnTill">Use on till</button>
          <button class="btn btn-secondary btn-sm" type="button" id="openAidFromFile">Medical aid</button>
        </div>
      </form>
      <h3>On the till</h3>
      ${receipts.length ? `<div class="dental-schedule">${receipts.slice(0, 8).map((sale) => `
        <article class="dental-schedule__row">
          <time>${escapeHtml(sale.receiptNo || 'Receipt')}</time>
          <div><span>Treatments</span><strong>${escapeHtml((sale.items || []).map((item) => item.name).join(', ') || 'Not recorded')}</strong></div>
          <div><span>Payment</span><strong>${escapeHtml(sale.method || '')}</strong></div>
        </article>`).join('')}</div>` : '<p>No till receipts for this phone yet.</p>'}
      <h3>Visits on the diary</h3>
      ${visits.length ? `<div class="dental-schedule">${visits.map((visit) => `
        <article class="dental-schedule__row">
          <time>${escapeHtml(visit.scheduledLabel || practiceLabel(visit.scheduledAt))}</time>
          <div><span>Procedure</span><strong>${escapeHtml(visit.service || 'Not recorded')}</strong></div>
          <div><span>Location</span><strong>${escapeHtml(visit.locationLabel || 'Not recorded')}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(visit.status || 'requested')}</strong></div>
        </article>`).join('')}</div>` : '<p>No diary visits for this phone yet.</p>'}`;

    fileHost.querySelector('#bookReturningClient')?.addEventListener('click', () => {
      sessionStorage.setItem(`smilemore-booking-draft-${companyId}`, JSON.stringify({
        customerName: patient.fullName,
        phone: patient.phone,
      }));
      navigateTo('appointments');
    });
    fileHost.querySelector('#openAidFromFile')?.addEventListener('click', () => {
      sessionStorage.setItem(`smilemore-client-${companyId}`, digitsPhone(patient.phone));
      navigateTo('dentalMedicalAid');
    });
    fileHost.querySelector('#useOnTill')?.addEventListener('click', () => {
      sessionStorage.setItem(`smilemore-pos-patient-${companyId}`, digitsPhone(patient.phone));
      navigateTo('dentalPos');
    });
    fileHost.querySelector('#dentalPatientForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      const errorEl = fileHost.querySelector('#dentalPatientError');
      const result = await saveDentalPatientApi(companyId, patient.phone, {
        fullName: data.fullName,
        email: data.email,
        gender: data.gender,
        address: data.address,
        paymentPreference: data.paymentPreference,
        idNumber: data.idNumber,
        dateOfBirth: data.dateOfBirth,
        nextStep: data.nextStep,
        notes: data.notes,
        medicalAid: {
          scheme: data.scheme,
          option: data.option,
          membershipNumber: data.membershipNumber,
          dependantCode: data.dependantCode,
          principalMemberName: data.principalMemberName,
          relationship: data.relationship,
        },
      });
      if (result.error) {
        errorEl.hidden = false;
        errorEl.textContent = result.error;
        return;
      }
      renderDentalPatients(container);
    });
  }

  search.addEventListener('input', paintList);
  paintList();
  paintFile();
}

function schemeOptions(selected) {
  return `<option value="">No scheme recorded</option>${SA_MEDICAL_SCHEMES.map((scheme) => `<option value="${escapeHtml(scheme)}"${scheme === selected ? ' selected' : ''}>${escapeHtml(scheme)}</option>`).join('')}`;
}
