import { escapeHtml, pageHeader, loadingState, emptyState, showToast } from '../ui.js';
import { fetchGovernanceAnnouncements, postGovernanceAnnouncement, patchGovernanceAnnouncement } from '../services/platformGovernanceClient.js';

export async function renderMcPlatformComms(container) {
  container.innerHTML = loadingState('Loading platform communications…');
  const { data, error } = await fetchGovernanceAnnouncements();
  const list = data?.data?.announcements || [];
  container.innerHTML = `
    ${pageHeader('Platform Communications', 'Official ZiricAI announcements to Sarah users.', '<span class="ops-tag">MC-PO-07</span>')}
    <div class="panel-card mc-po-panel" style="margin-bottom:16px">
      <h3 class="mc-po-panel-title">Draft announcement</h3>
      <div class="mc-po-form">
        <div class="form-group"><label for="mcAnnTitle">Title</label><input id="mcAnnTitle" class="form-control" autocomplete="off" /></div>
        <div class="form-group"><label for="mcAnnBody">Body</label><textarea id="mcAnnBody" class="form-control" rows="4"></textarea></div>
      </div>
      <div class="mc-po-form-actions">
        <button type="button" class="btn btn-primary btn-sm" id="mcAnnCreate">Save draft</button>
      </div>
    </div>
    <div class="table-container">
      <table class="org-table"><thead><tr><th>Title</th><th>Type</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((a) => `<tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.type)}</td><td>${escapeHtml(a.status)}</td>
          <td>${a.status === 'draft' ? `<button type="button" class="btn btn-secondary btn-sm mc-ann-pub" data-id="${escapeHtml(a.announcementId)}">Publish</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="4">${emptyState(error || 'No announcements.')}</td></tr>`}
        </tbody></table>
    </div>`;
  container.querySelector('#mcAnnCreate')?.addEventListener('click', async () => {
    const title = container.querySelector('#mcAnnTitle')?.value?.trim();
    const body = container.querySelector('#mcAnnBody')?.value?.trim();
    const res = await postGovernanceAnnouncement({ title, body, type: 'product' });
    if (res.error) return showToast(res.error, 'error');
    showToast('Draft saved', 'success');
    renderMcPlatformComms(container);
  });
  container.querySelectorAll('.mc-ann-pub').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const res = await patchGovernanceAnnouncement(id, { status: 'published' });
      if (res.error) return showToast(res.error, 'error');
      showToast('Published (store only — delivery fan-out is a follow-up)', 'success');
      renderMcPlatformComms(container);
    });
  });
}
