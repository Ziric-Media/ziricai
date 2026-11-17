/**
 * EDU Stage 4 — Admissions workspace (queue, review, decisions).
 */
import { state } from '../core/dataStore.js';
import { apiRequest } from '../../shared/apiRequest.js';

function companyId() {
  return state.companyId;
}

function parseEducationResponse(res) {
  if (res.error) {
    const msg = typeof res.error === 'object' ? res.error.message || res.error.code : res.error;
    throw new Error(msg || 'Request failed');
  }
  const body = res.data || {};
  if (body.ok === false) {
    throw new Error(body.error?.message || 'Request failed');
  }
  return body.data ?? body;
}

async function fetchQueue(status = '') {
  const cid = companyId();
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiRequest(`/api/education/v1/orgs/${encodeURIComponent(cid)}/admission-applications${q}`, {
    silent: true,
  });
  return parseEducationResponse(res);
}

async function fetchDetail(applicationId) {
  const cid = companyId();
  const res = await apiRequest(
    `/api/education/v1/orgs/${encodeURIComponent(cid)}/admission-applications/${encodeURIComponent(applicationId)}/staff`,
    { silent: true }
  );
  const data = parseEducationResponse(res);
  return data.application;
}

async function postAction(applicationId, path, body) {
  const cid = companyId();
  const res = await apiRequest(
    `/api/education/v1/orgs/${encodeURIComponent(cid)}/admission-applications/${encodeURIComponent(applicationId)}/${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      silent: true,
    }
  );
  return parseEducationResponse(res);
}

function statusLabel(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderCounts(counts = {}) {
  const keys = [
    'submitted',
    'documents_pending',
    'under_review',
    'assessment_required',
    'provisional_offer',
    'accepted',
    'declined',
    'waitlisted',
  ];
  return keys
    .filter((k) => counts[k])
    .map((k) => `<span class="bos-pill">${statusLabel(k)}: ${counts[k]}</span>`)
    .join(' ');
}

export async function renderSchoolAdmissions(container) {
  if (!container) return;
  let filterStatus = '';
  let selectedId = '';

  container.innerHTML = `
    <section class="bos-module-head">
      <h2>Admissions</h2>
      <p class="text-muted">Review learner applications, documents, and authorised decisions. Pilot workspace — school sign-off required before live intake.</p>
    </section>
    <div class="bos-card" style="margin-bottom:12px">
      <div class="bos-inline-actions" id="admFilterBar">
        <button type="button" class="btn btn-secondary btn-sm" data-filter="">All active</button>
        <button type="button" class="btn btn-secondary btn-sm" data-filter="submitted">Submitted</button>
        <button type="button" class="btn btn-secondary btn-sm" data-filter="under_review">Under review</button>
        <button type="button" class="btn btn-secondary btn-sm" data-filter="documents_pending">Documents</button>
        <button type="button" class="btn btn-secondary btn-sm" data-filter="provisional_offer">Offers</button>
      </div>
      <div id="admCounts" class="text-muted" style="margin-top:10px"></div>
    </div>
    <div class="bos-grid bos-grid-2" style="gap:16px">
      <div class="bos-card" id="admQueue"><p>Loading applications…</p></div>
      <div class="bos-card" id="admDetail"><p class="text-muted">Select an application to review.</p></div>
    </div>
  `;

  const queueHost = container.querySelector('#admQueue');
  const detailHost = container.querySelector('#admDetail');
  const countsHost = container.querySelector('#admCounts');

  const bindFilters = () => {
    container.querySelectorAll('#admFilterBar [data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterStatus = btn.getAttribute('data-filter') || '';
        selectedId = '';
        renderQueue();
        detailHost.innerHTML = '<p class="text-muted">Select an application to review.</p>';
      });
    });
  };

  const renderDetail = async (applicationId) => {
    if (!applicationId) return;
    detailHost.innerHTML = '<p>Loading…</p>';
    try {
      const app = await fetchDetail(applicationId);
      selectedId = applicationId;
      const docs = (app.documents || [])
        .map(
          (d) => `<li><strong>${d.label}</strong> — ${d.status}${d.fileName ? ` (${d.fileName})` : ''}</li>`
        )
        .join('');
      detailHost.innerHTML = `
        <h3>${app.reference}</h3>
        <p><span class="bos-pill">${statusLabel(app.status)}</span>
          ${app.duplicateReviewFlag ? '<span class="bos-pill bos-pill-warn">Possible duplicate</span>' : ''}</p>
        <p><strong>Learner:</strong> ${app.learner?.legalFirstName || ''} ${app.learner?.legalSurname || ''} · Grade ${app.gradeApplyingFor || '—'} · ${app.campusId || '—'} · ${app.academicYear || '—'}</p>
        <p><strong>Guardian:</strong> ${app.guardian?.fullName || '—'} · ${app.guardian?.mobile || app.guardian?.email || ''}</p>
        <h4>Documents</h4>
        <ul>${docs || '<li class="text-muted">No documents registered</li>'}</ul>
        <h4>Actions</h4>
        <div class="bos-inline-actions" style="flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-sm" data-act="under_review">Mark under review</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="assessment_required">Assessment required</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="provisional_offer">Provisional offer</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="waitlisted">Waitlist</button>
          <button type="button" class="btn btn-danger btn-sm" data-act="declined">Decline</button>
          <button type="button" class="btn btn-primary btn-sm" data-act="accepted">Accept (authorised)</button>
        </div>
        <p class="text-muted" style="margin-top:8px;font-size:0.85rem">Only authorised staff should record final acceptance. Sarah never issues decisions autonomously.</p>
      `;

      detailHost.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const act = btn.getAttribute('data-act');
          const note = window.prompt('Optional note for audit trail:', '') || '';
          btn.disabled = true;
          try {
            const terminal = ['accepted', 'declined', 'waitlisted', 'provisional_offer'];
            if (terminal.includes(act)) {
              await postAction(applicationId, 'decision', { outcome: act, notes: note });
            } else {
              await postAction(applicationId, 'transition', { status: act, note });
            }
            await renderQueue();
            await renderDetail(applicationId);
          } catch (e) {
            alert(e.message);
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      detailHost.innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  };

  const renderQueue = async () => {
    queueHost.innerHTML = '<p>Loading…</p>';
    try {
      const data = await fetchQueue(filterStatus);
      countsHost.innerHTML = renderCounts(data.countsByStatus) || 'No applications yet.';
      const rows = data.applications || [];
      const visible = rows.filter((r) => !['withdrawn', 'closed'].includes(r.status));
      if (!visible.length) {
        queueHost.innerHTML = '<p class="text-muted">No applications in this view.</p>';
        return;
      }
      queueHost.innerHTML = `
        <table class="bos-table">
          <thead>
            <tr><th>Reference</th><th>Learner</th><th>Grade</th><th>Campus</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (a) => `
              <tr data-app-id="${a.applicationId}" class="${a.applicationId === selectedId ? 'is-selected' : ''}">
                <td>${a.reference}</td>
                <td>${a.learner?.legalFirstName || '—'} ${a.learner?.legalSurname || ''}</td>
                <td>${a.gradeApplyingFor || '—'}</td>
                <td>${a.campusId || '—'}</td>
                <td>${statusLabel(a.status)}${a.duplicateReviewFlag ? ' ⚠' : ''}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
      queueHost.querySelectorAll('tr[data-app-id]').forEach((tr) => {
        tr.addEventListener('click', () => renderDetail(tr.getAttribute('data-app-id')));
      });
    } catch (e) {
      queueHost.innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  };

  bindFilters();
  await renderQueue();
}