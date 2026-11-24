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

function statusCssClass(status) {
  const s = String(status || 'new');
  if (s === 'ready_for_review') return 'sach-status--review';
  if (s === 'awaiting_documents' || s === 'client_action_required') return 'sach-status--action';
  if (s === 'in_progress' || s === 'assigned') return 'sach-status--progress';
  if (s === 'completed' || s === 'closed') return 'sach-status--done';
  return 'sach-status--new';
}

function formatShortDate(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value);
    const d = s.length >= 10 ? s.slice(0, 10) : s;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString().slice(0, 10);
    }
    return d || '—';
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return value.toDate().toISOString().slice(0, 10);
    }
    if (Number.isFinite(value.seconds)) {
      return new Date(value.seconds * 1000).toISOString().slice(0, 10);
    }
  }
  try {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  return '—';
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serviceTypeLabel(type) {
  const t = String(type || '').replace(/_/g, ' ');
  return t ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
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
      <header class="sach-requests-hero">
        <div class="sach-requests-hero__text">
          <p class="sach-requests-eyebrow">Sach Accounting · Client intake</p>
          <h2 class="sach-requests-title">Client service requests</h2>
          <p class="sach-requests-lead">Structured intake from Company Sarah — VAT, payroll, CIPC, bookkeeping, and related workflows.</p>
          <p class="sach-requests-meta" id="sachPackSummary"></p>
        </div>
        <div class="sach-requests-hero__accent" aria-hidden="true">
          <i class="fa-solid fa-clipboard-list"></i>
        </div>
      </header>
      <div class="sach-requests-toolbar bos-card">
        <div class="sach-filter-bar" id="sachFilterBar" role="tablist" aria-label="Service request filters">
          ${FILTER_STATUSES.map(
            (s) =>
              `<button type="button" class="sach-filter-chip${s === filterStatus ? ' is-active' : ''}" data-filter="${escHtml(s)}">${s ? statusLabel(s) : 'All'}</button>`
          ).join('')}
        </div>
      </div>
      <div class="sach-requests-layout">
        <div class="bos-card sach-panel sach-panel-queue" id="sachQueue">
          <div class="sach-panel-head">
            <h3>Queue</h3>
            <span class="sach-panel-hint" id="sachQueueCount"></span>
          </div>
          <div class="sach-panel-body"><p class="text-muted">Loading requests…</p></div>
        </div>
        <div class="bos-card sach-panel sach-panel-detail" id="sachDetail">
          <div class="sach-panel-body">
            <p class="text-muted sach-detail-placeholder">Select a request to review intake, checklist, and status.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const queuePanel = container.querySelector('#sachQueue');
  const queueBody = queuePanel?.querySelector('.sach-panel-body');
  const queueCount = container.querySelector('#sachQueueCount');
  const detailEl = container.querySelector('#sachDetail .sach-panel-body');

  async function renderQueue() {
    if (!queueBody) return;
    queueBody.innerHTML = '<p class="text-muted">Loading…</p>';
    try {
      const data = await fetchQueue(filterStatus);
      const rows = Array.isArray(data.requests) ? data.requests : [];
      if (queueCount) {
        queueCount.textContent = rows.length ? `${rows.length} request${rows.length === 1 ? '' : 's'}` : 'Empty';
      }
      if (!rows.length) {
        queueBody.innerHTML = `
          <div class="sach-empty-state">
            <i class="fa-solid fa-inbox" aria-hidden="true"></i>
            <p>No service requests match this filter.</p>
            <p class="text-muted">New enquiries appear here when clients chat with Company Sarah on the Sarah App.</p>
          </div>`;
        return;
      }
      queueBody.innerHTML = `
        <div class="sach-queue-table-wrap">
          <table class="sach-queue-table">
            <thead>
              <tr><th>Reference</th><th>Service</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr class="sach-queue-row${r.requestId === selectedId ? ' is-selected' : ''}" data-id="${escHtml(r.requestId)}">
                  <td><span class="sach-ref">${escHtml(r.reference)}</span></td>
                  <td>${escHtml(serviceTypeLabel(r.serviceType))}</td>
                  <td><span class="sach-status-pill ${statusCssClass(r.status)}">${escHtml(statusLabel(r.status))}</span></td>
                  <td class="sach-date">${escHtml(formatShortDate(r.updatedAt))}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
      queueBody.querySelectorAll('.sach-queue-row').forEach((row) => {
        row.addEventListener('click', () => {
          selectedId = row.getAttribute('data-id');
          renderQueue();
          renderDetail();
        });
      });
    } catch (err) {
      queueBody.innerHTML = `<p class="text-danger sach-error-banner">${escHtml(err.message)}</p>`;
    }
  }

  async function renderDetail() {
    if (!detailEl) return;
    if (!selectedId) {
      detailEl.innerHTML =
        '<p class="text-muted sach-detail-placeholder">Select a request to review intake, checklist, and status.</p>';
      return;
    }
    detailEl.innerHTML = '<p class="text-muted">Loading detail…</p>';
    try {
      const req = await fetchDetail(selectedId);
      const intake =
        req.intakeAnswers && Object.keys(req.intakeAnswers).length
          ? `<section class="sach-detail-block"><h4>Intake answers</h4><ul class="sach-detail-list">${Object.entries(
              req.intakeAnswers
            )
              .map(([k, v]) => `<li><strong>${escHtml(k)}:</strong> ${escHtml(v)}</li>`)
              .join('')}</ul></section>`
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
        <header class="sach-detail-header">
          <span class="sach-status-pill ${statusCssClass(req.status)}">${escHtml(statusLabel(req.status))}</span>
          <h3>${escHtml(req.reference)}</h3>
          <p class="sach-detail-service">${escHtml(serviceTypeLabel(req.serviceType))}</p>
        </header>
        <p class="sach-detail-summary">${escHtml(req.summary || '')}</p>
        <dl class="sach-detail-meta">
          ${req.business?.legalName ? `<div><dt>Business</dt><dd>${escHtml(req.business.legalName)}</dd></div>` : ''}
          ${req.reportingPeriod ? `<div><dt>Period</dt><dd>${escHtml(req.reportingPeriod)}</dd></div>` : ''}
          ${
            req.contact
              ? `<div><dt>Contact</dt><dd>${escHtml(
                  [req.contact.fullName, req.contact.phone, req.contact.email].filter(Boolean).join(' · ')
                )}</dd></div>`
              : ''
          }
          ${req.assignedDepartment ? `<div><dt>Department</dt><dd>${escHtml(statusLabel(req.assignedDepartment))}</dd></div>` : ''}
          ${req.nextAction ? `<div><dt>Next action</dt><dd>${escHtml(req.nextAction)}</dd></div>` : ''}
        </dl>
        ${intake}
        ${checklist ? `<section class="sach-detail-block"><h4>Document checklist</h4><ul class="sach-detail-list">${checklist}</ul></section>` : ''}
        ${docs ? `<section class="sach-detail-block"><h4>Uploaded files</h4><ul class="sach-detail-list">${docs}</ul></section>` : ''}
        <section class="sach-detail-actions">
          <h4>Update status</h4>
          <div class="sach-detail-actions__row">
            <select id="sachStatusSelect" class="bos-input">
              ${[
                'ready_for_review',
                'awaiting_assignment',
                'assigned',
                'in_progress',
                'awaiting_documents',
                'client_action_required',
                'completed',
                'closed',
              ]
                .map((s) => `<option value="${s}"${s === req.status ? ' selected' : ''}>${statusLabel(s)}</option>`)
                .join('')}
            </select>
            <input id="sachNextAction" class="bos-input" placeholder="Next action" value="${escHtml(req.nextAction || '')}" />
            <button type="button" class="btn btn-primary" id="sachSaveStatus">Save changes</button>
          </div>
        </section>`;
      detailEl.querySelector('#sachSaveStatus')?.addEventListener('click', async () => {
        const status = detailEl.querySelector('#sachStatusSelect')?.value;
        const nextAction = detailEl.querySelector('#sachNextAction')?.value;
        await postTransition(selectedId, { status, nextAction });
        await renderQueue();
        await renderDetail();
      });
    } catch (err) {
      detailEl.innerHTML = `<p class="text-danger sach-error-banner">${escHtml(err.message)}</p>`;
    }
  }

  container.querySelector('#sachFilterBar')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    filterStatus = btn.getAttribute('data-filter') || '';
    container.querySelectorAll('#sachFilterBar .sach-filter-chip').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-filter') === filterStatus);
    });
    renderQueue();
  });

  try {
    const cid = companyId();
    const res = await apiRequest(`/api/sach/v1/orgs/${encodeURIComponent(cid)}/workflow-packs`, { silent: true });
    const data = parseSachResponse(res);
    const packs = Array.isArray(data.packs) ? data.packs : [];
    const el = container.querySelector('#sachPackSummary');
    if (el && packs.length) {
      el.textContent = `${packs.length} workflow packs configured — tax, accounting, payroll, CIPC, CSD, COIDA, CIDB, RMA, and more.`;
    }
  } catch {
    /* optional */
  }

  await renderQueue();
}