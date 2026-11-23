/**
 * Sach Accounting — service request queue (Company Sarah intake).
 */
import { state } from '../core/dataStore.js';
import { apiRequest } from '../../shared/apiRequest.js';

function companyId() {
  return state.companyId;
}

function parseSachResponse(res) {
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
  const res = await apiRequest(`/api/sach/v1/orgs/${encodeURIComponent(cid)}/service-requests${q}`, {
    silent: true,
  });
  return parseSachResponse(res);
}

async function fetchDetail(requestId) {
  const cid = companyId();
  const res = await apiRequest(
    `/api/sach/v1/orgs/${encodeURIComponent(cid)}/service-requests/${encodeURIComponent(requestId)}/staff`,
    { silent: true }
  );
  const data = parseSachResponse(res);
  return data.request;
}

async function postTransition(requestId, body) {
  const cid = companyId();
  const res = await apiRequest(
    `/api/sach/v1/orgs/${encodeURIComponent(cid)}/service-requests/${encodeURIComponent(requestId)}/transition`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      silent: true,
    }
  );
  return parseSachResponse(res);
}

function statusLabel(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FILTER_STATUSES = [
  '',
  'ready_for_review',
  'awaiting_documents',
  'awaiting_assignment',
  'in_progress',
  'client_action_required',
];

export async function renderSachServiceRequests(container) {
  if (!container) return;
  let filterStatus = '';
  let selectedId = '';

  container.innerHTML = `
    <div class="bos-sach-requests">
      <section class="bos-module-head">
        <h2>Client service requests</h2>
        <p class="text-muted">Structured intake from Company Sarah — workflow packs for VAT, payroll, CIPC, bookkeeping, and related services.</p>
        <p class="text-muted" id="sachPackSummary"></p>
      </section>
      <div class="bos-card adm-toolbar-card">
        <div class="adm-filter-bar" id="sachFilterBar" role="tablist" aria-label="Service request filters">
          ${FILTER_STATUSES.map(
            (s) =>
              `<button type="button" class="adm-filter-btn${s === filterStatus ? ' is-active' : ''}" data-filter="${escHtml(s)}">${s ? statusLabel(s) : 'All'}</button>`
          ).join('')}
        </div>
      </div>
      <div class="adm-layout">
        <div class="bos-card adm-panel adm-panel-queue" id="sachQueue"><p>Loading requests…</p></div>
        <div class="bos-card adm-panel adm-panel-detail" id="sachDetail"><p class="text-muted adm-detail-placeholder">Select a request to review.</p></div>
      </div>
    </div>
  `;

  const queueEl = container.querySelector('#sachQueue');
  const detailEl = container.querySelector('#sachDetail');

  async function renderQueue() {
    queueEl.innerHTML = '<p>Loading…</p>';
    try {
      const data = await fetchQueue(filterStatus);
      const rows = data.requests || [];
      if (!rows.length) {
        queueEl.innerHTML = '<p class="text-muted">No service requests match this filter.</p>';
        return;
      }
      queueEl.innerHTML = `
        <table class="bos-table bos-table--compact adm-queue-table">
          <thead><tr><th>Reference</th><th>Service</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr class="adm-queue-row${r.requestId === selectedId ? ' is-selected' : ''}" data-id="${escHtml(r.requestId)}">
                <td><strong>${escHtml(r.reference)}</strong></td>
                <td>${escHtml(r.serviceType || '—')}</td>
                <td><span class="adm-status-pill">${escHtml(statusLabel(r.status))}</span></td>
                <td>${escHtml((r.updatedAt || '').slice(0, 10))}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
      queueEl.querySelectorAll('.adm-queue-row').forEach((row) => {
        row.addEventListener('click', () => {
          selectedId = row.getAttribute('data-id');
          renderQueue();
          renderDetail();
        });
      });
    } catch (err) {
      queueEl.innerHTML = `<p class="text-danger">${escHtml(err.message)}</p>`;
    }
  }

  async function renderDetail() {
    if (!selectedId) {
      detailEl.innerHTML = '<p class="text-muted adm-detail-placeholder">Select a request to review.</p>';
      return;
    }
    detailEl.innerHTML = '<p>Loading detail…</p>';
    try {
      const req = await fetchDetail(selectedId);
      const intake = req.intakeAnswers && Object.keys(req.intakeAnswers).length
        ? `<h4>Intake answers</h4><ul>${Object.entries(req.intakeAnswers)
            .map(([k, v]) => `<li><strong>${escHtml(k)}:</strong> ${escHtml(v)}</li>`)
            .join('')}</ul>`
        : '';
      const checklist = (req.documentChecklist || [])
        .map(
          (d) =>
            `<li>${escHtml(d.label)} — ${escHtml(statusLabel(d.status))}${d.required ? ' <em>(required)</em>' : ''}</li>`
        )
        .join('');
      const docs = (req.documents || [])
        .map((d) => `<li>${escHtml(d.label || d.type)} — ${escHtml(statusLabel(d.status))}</li>`)
        .join('');
      detailEl.innerHTML = `
        <h3>${escHtml(req.reference)}</h3>
        <p><strong>Service:</strong> ${escHtml(req.serviceType)} · <strong>Status:</strong> ${escHtml(statusLabel(req.status))}</p>
        <p>${escHtml(req.summary || '')}</p>
        ${req.business?.legalName ? `<p><strong>Business:</strong> ${escHtml(req.business.legalName)}</p>` : ''}
        ${req.reportingPeriod ? `<p><strong>Period:</strong> ${escHtml(req.reportingPeriod)}</p>` : ''}
        ${req.contact ? `<p><strong>Contact:</strong> ${escHtml([req.contact.fullName, req.contact.phone, req.contact.email].filter(Boolean).join(' · '))}</p>` : ''}
        ${req.assignedDepartment ? `<p><strong>Department:</strong> ${escHtml(statusLabel(req.assignedDepartment))}</p>` : ''}
        ${req.nextAction ? `<p><strong>Next action:</strong> ${escHtml(req.nextAction)}</p>` : ''}
        ${intake}
        ${checklist ? `<h4>Document checklist</h4><ul>${checklist}</ul>` : ''}
        ${docs ? `<h4>Uploaded files</h4><ul>${docs}</ul>` : ''}
        <div class="sach-detail-actions">
          <label class="bos-label">Update status</label>
          <select id="sachStatusSelect" class="bos-input">
            ${['ready_for_review', 'awaiting_assignment', 'assigned', 'in_progress', 'awaiting_documents', 'client_action_required', 'completed', 'closed']
              .map((s) => `<option value="${s}"${s === req.status ? ' selected' : ''}>${statusLabel(s)}</option>`)
              .join('')}
          </select>
          <input id="sachNextAction" class="bos-input" placeholder="Next action" value="${escHtml(req.nextAction || '')}" />
          <button type="button" class="btn btn-primary btn-sm" id="sachSaveStatus">Save</button>
        </div>`;
      detailEl.querySelector('#sachSaveStatus')?.addEventListener('click', async () => {
        const status = detailEl.querySelector('#sachStatusSelect')?.value;
        const nextAction = detailEl.querySelector('#sachNextAction')?.value;
        await postTransition(selectedId, { status, nextAction });
        await renderQueue();
        await renderDetail();
      });
    } catch (err) {
      detailEl.innerHTML = `<p class="text-danger">${escHtml(err.message)}</p>`;
    }
  }

  container.querySelector('#sachFilterBar')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    filterStatus = btn.getAttribute('data-filter') || '';
    container.querySelectorAll('#sachFilterBar .adm-filter-btn').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-filter') === filterStatus);
    });
    renderQueue();
  });

  try {
    const cid = companyId();
    const res = await apiRequest(`/api/sach/v1/orgs/${encodeURIComponent(cid)}/workflow-packs`, { silent: true });
    const data = parseSachResponse(res);
    const packs = data.packs || [];
    const el = container.querySelector('#sachPackSummary');
    if (el && packs.length) {
      el.textContent = `${packs.length} configured service workflows — tax, accounting, payroll, CIPC, CSD, COIDA, CIDB, RMA, beneficial ownership, and more.`;
    }
  } catch {
    /* optional */
  }

  await renderQueue();
}