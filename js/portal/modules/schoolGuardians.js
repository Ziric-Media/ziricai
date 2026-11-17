/**
 * EDU-03 — Parent & guardian verification queue.
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

async function fetchPending() {
  const cid = companyId();
  const res = await apiRequest(
    `/api/education/v1/orgs/${encodeURIComponent(cid)}/guardian-links?status=pending`,
    { silent: true }
  );
  const data = parseEducationResponse(res);
  return data.links || [];
}

async function decide(linkId, action, reason) {
  const cid = companyId();
  const res = await apiRequest(
    `/api/education/v1/orgs/${encodeURIComponent(cid)}/guardian-links/${encodeURIComponent(linkId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' }),
      silent: true,
    }
  );
  return parseEducationResponse(res);
}

export async function renderSchoolGuardians(container) {
  if (!container) return;
  container.innerHTML = `
    <section class="bos-module-head">
      <h2>Parents &amp; guardians</h2>
      <p class="text-muted">Verify guardian applications before they enter the school communication audience.</p>
    </section>
    <div id="schoolGuardianQueue" class="bos-card"><p>Loading pending applications…</p></div>
  `;
  const host = container.querySelector('#schoolGuardianQueue');
  const renderList = async () => {
    try {
      const links = await fetchPending();
      if (!links.length) {
        host.innerHTML = '<p class="text-muted">No pending guardian applications.</p>';
        return;
      }
      host.innerHTML = `
        <table class="bos-table">
          <thead><tr><th>Learner</th><th>Campus</th><th>Grade</th><th>Relationship</th><th></th></tr></thead>
          <tbody>
            ${links
              .map(
                (l) => `
              <tr data-link-id="${l.linkId}">
                <td>${l.learner?.name || '—'}</td>
                <td>${l.campusId || '—'}</td>
                <td>${l.learner?.grade || '—'}</td>
                <td>${l.relationship || 'parent'}</td>
                <td class="bos-table-actions">
                  <button type="button" class="btn btn-primary btn-sm" data-approve="${l.linkId}">Approve</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-reject="${l.linkId}">Reject</button>
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
      host.querySelectorAll('[data-approve]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await decide(btn.getAttribute('data-approve'), 'approve');
            await renderList();
          } catch (e) {
            alert(e.message);
            btn.disabled = false;
          }
        });
      });
      host.querySelectorAll('[data-reject]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const reason = window.prompt('Rejection reason (optional):', '') || '';
          btn.disabled = true;
          try {
            await decide(btn.getAttribute('data-reject'), 'reject', reason);
            await renderList();
          } catch (e) {
            alert(e.message);
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      host.innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  };
  await renderList();
}
