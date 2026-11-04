import { state } from '../core/dataStore.js';
import { escapeHtml, pageHeader, errorState } from '../../admin/ui.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { can } from '../permissions.js';
import {
  fetchAppointments,
  fetchDentalClaims,
  fetchDentalPatients,
  prepareDentalClaimApi,
  updateDentalClaimApi,
} from '../api.js';
import { navigateTo } from '../router.js';
import { digitsPhone } from '../dental/smilemorePractice.js';
import { isSmilemoreDentalCommandCentreTenant, smilemorePracticeRibbon } from '../dental/smilemoreDentalGate.js';

const CLAIM_LABEL = {
  draft: 'Draft',
  ready: 'Ready for the practice to send',
  submitted: 'Marked sent by the practice',
  rejected: 'Recorded as rejected',
  paid: 'Recorded as paid',
};

export async function renderDentalMedicalAid(container) {
  if (!isSmilemoreDentalCommandCentreTenant(state.companyId)) {
    container.innerHTML = errorState('Medical aid is not available for this workspace.');
    return;
  }
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = errorState('You do not have permission to view medical aid.');
    return;
  }

  container.innerHTML = renderLoadingSkeleton({ label: 'Loading medical aid…', cards: 2, rows: 3 });
  const companyId = state.companyId;
  const [claimRes, patientRes, bookingRes] = await Promise.all([
    fetchDentalClaims(companyId),
    fetchDentalPatients(companyId),
    fetchAppointments(companyId, { upcoming: false }),
  ]);
  const error = claimRes.error || patientRes.error;
  if (error) {
    container.innerHTML = `${pageHeader('Medical aid', 'SmileMore claim worksheets.')}${errorState(error)}`;
    return;
  }

  const claims = claimRes.data?.items || [];
  const patients = patientRes.data?.items || [];
  const completed = (bookingRes.data?.items || []).filter((item) => item.status === 'completed');
  const canEdit = can(state.profile?.role, 'canReply');
  const missing = patients.filter((patient) => !aidReady(patient.medicalAid));

  container.innerHTML = `
    <div class="dental-aid">
      ${pageHeader('Medical aid', 'Capture the card details a South African dental claim needs, then prepare a worksheet from a completed visit.')}
      ${smilemorePracticeRibbon()}
      <div class="dental-command-note"><i class="fa-solid fa-circle-info"></i><span>GoodX and Healthbridge send claims to the scheme and can check benefits. This portal stores the worksheet only. It does not submit a claim, look up a tariff, or say what the scheme will pay. Mark it sent only after your switch or bureau has actually submitted it.</span></div>
      <div class="dental-bookings__stats">
        ${stat('Client files', patients.length)}
        ${stat('Card details missing', missing.length)}
        ${stat('Worksheets', claims.length)}
        ${stat('Completed visits', completed.length)}
      </div>
      <section class="card">
        <div class="card-body">
          <h2>Prepare a worksheet</h2>
          <p>Choose a completed visit. The client file must already have the scheme, membership number, and dependant code.</p>
          ${canEdit ? `<form id="dentalClaimForm" class="dental-booking__actions">
            <select name="bookingId" required aria-label="Completed visit">
              <option value="">Completed visit</option>
              ${completed.map((booking) => `<option value="${escapeHtml(booking.id)}">${escapeHtml(booking.customerName || 'Patient')} · ${escapeHtml(booking.service || 'Visit')} · ${escapeHtml(booking.scheduledLabel || '')}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" type="submit">Prepare worksheet</button>
          </form>` : ''}
          <p id="dentalClaimError" class="dental-bookings__error" role="alert" hidden></p>
          <button class="btn btn-secondary btn-sm" type="button" id="openClientsFromAid">Open client database</button>
        </div>
      </section>
      <section class="dental-bookings__list" id="dentalClaimList">
        ${claims.length ? claims.map((claim) => claimCard(claim, canEdit)).join('') : '<article class="card dental-bookings__empty"><div class="card-body"><h2>No claim worksheets</h2><p>Complete a visit, save the card details on the client file, then prepare the worksheet.</p></div></article>'}
      </section>
    </div>`;

  container.querySelector('#openClientsFromAid')?.addEventListener('click', () => navigateTo('dentalPatients'));
  container.querySelector('#dentalClaimForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorEl = container.querySelector('#dentalClaimError');
    const bookingId = new FormData(event.target).get('bookingId');
    const result = await prepareDentalClaimApi(companyId, bookingId);
    if (result.error) {
      errorEl.hidden = false;
      errorEl.textContent = result.error;
      return;
    }
    renderDentalMedicalAid(container);
  });
  container.querySelectorAll('[data-claim-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const card = button.closest('[data-claim]');
      const result = await updateDentalClaimApi(companyId, button.dataset.claimAction, {
        status: button.dataset.status,
        tariffCode: card.querySelector('[data-tariff]')?.value || '',
        icd10: card.querySelector('[data-icd]')?.value || '',
        note: card.querySelector('[data-claim-note]')?.value || '',
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
      renderDentalMedicalAid(container);
    });
  });
  container.querySelectorAll('[data-open-till]').forEach((button) => {
    button.addEventListener('click', () => {
      sessionStorage.setItem(`smilemore-pos-patient-${companyId}`, digitsPhone(button.dataset.openTill));
      navigateTo('dentalPos');
    });
  });
  container.querySelectorAll('[data-open-patient]').forEach((button) => {
    button.addEventListener('click', () => {
      sessionStorage.setItem(`smilemore-client-${companyId}`, digitsPhone(button.dataset.openPatient));
      navigateTo('dentalPatients');
    });
  });
}

function aidReady(aid) {
  return Boolean(aid?.scheme && aid.scheme !== 'Private / cash' && aid.membershipNumber && aid.dependantCode);
}

function stat(label, value) {
  return `<article class="dental-bookings__stat"><i class="fa-solid fa-file-medical" aria-hidden="true"></i><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`;
}

function claimCard(claim, canEdit) {
  const next = { draft: 'ready', ready: 'submitted', submitted: 'paid' }[claim.status];
  const reject = claim.status === 'submitted' ? 'rejected' : '';
  return `<article class="card dental-booking" data-claim="${escapeHtml(claim.id)}">
    <div class="card-body">
      <div class="dental-booking__top">
        <div>
          <h2>${escapeHtml(claim.patientName || 'Client')}</h2>
          <p>${escapeHtml(claim.scheme || '')} · member ${escapeHtml(claim.membershipNumber || '—')} · dependant ${escapeHtml(claim.dependantCode || '—')}</p>
        </div>
        <span class="dental-booking__status">${escapeHtml(CLAIM_LABEL[claim.status] || claim.status)}</span>
      </div>
      <dl>
        <div><dt>Visit</dt><dd>${escapeHtml(claim.visitLabel || claim.visitAt || '—')}</dd></div>
        <div><dt>Procedure</dt><dd>${escapeHtml(claim.procedure || '—')}</dd></div>
        <div><dt>Option</dt><dd>${escapeHtml(claim.option || 'Not recorded')}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(claim.locationLabel || '—')}</dd></div>
      </dl>
      ${canEdit ? `<div class="dental-patients__form">
        <label>Tariff code the practice already uses<input data-tariff value="${escapeHtml(claim.tariffCode || '')}" placeholder="Leave blank if unknown" /></label>
        <label>ICD-10 the practice already uses<input data-icd value="${escapeHtml(claim.icd10 || '')}" placeholder="Leave blank if unknown" /></label>
        <label class="dental-patients__wide">Note<input data-claim-note value="${escapeHtml(claim.note || '')}" /></label>
      </div>` : ''}
      <p class="form-hint">Switch connected: no. This status is the practice record, not a response from the scheme.</p>
      <div class="dental-booking__actions">
        <button type="button" class="btn btn-secondary btn-sm" data-open-patient="${escapeHtml(claim.patientId || '')}">Client file</button>
        <button type="button" class="btn btn-secondary btn-sm" data-open-till="${escapeHtml(claim.patientId || '')}">Till</button>
        <button type="button" class="btn btn-secondary btn-sm" data-nav="appointments">Bookings</button>
        ${canEdit && next ? `<button type="button" class="btn btn-primary btn-sm" data-claim-action="${escapeHtml(claim.id)}" data-status="${next}">${escapeHtml(CLAIM_LABEL[next])}</button>` : ''}
        ${canEdit && reject ? `<button type="button" class="btn btn-secondary btn-sm" data-claim-action="${escapeHtml(claim.id)}" data-status="rejected">Record rejection</button>` : ''}
      </div>
      <p class="dental-bookings__error" role="alert" hidden></p>
    </div>
  </article>`;
}
