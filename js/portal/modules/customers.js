import { state, setState } from '../state.js';
import { escapeHtml, pageHeader, emptyState, loadingState } from '../../admin/ui.js';
import { fetchCrmCustomers, fetchCrmLeads, fetchCrmPipeline } from '../api.js';
import { can } from '../permissions.js';
import { navigateTo } from '../router.js';

export async function renderCustomers(container) {
  if (!can(state.profile?.role, 'canViewInbox')) {
    container.innerHTML = emptyState('You do not have permission to view customers.');
    return;
  }

  container.innerHTML = loadingState('Loading CRM...');
  const companyId = state.companyId;

  const [custRes, leadsRes, pipelineRes] = await Promise.all([
    fetchCrmCustomers(companyId),
    fetchCrmLeads(companyId),
    fetchCrmPipeline(companyId),
  ]);

  const rows = custRes.data?.items || [];
  const leads = leadsRes.data?.items || [];
  const pipeline = pipelineRes.data?.stages || [];

  container.innerHTML = `
    ${pageHeader('CRM', `Contacts, leads & customers for ${escapeHtml(state.company?.name || 'your company')}.`)}

    <div class="kpi-grid kpi-grid-ops" style="margin-bottom:1.5rem;">
      <div class="kpi-card"><div class="header"><div><div class="label">Customers</div><div class="value">${rows.length}</div></div><div class="icon-wrapper blue"><i class="fa-solid fa-users"></i></div></div></div>
      <div class="kpi-card"><div class="header"><div><div class="label">Leads</div><div class="value">${leads.length}</div></div><div class="icon-wrapper green"><i class="fa-solid fa-user-plus"></i></div></div></div>
      <div class="kpi-card"><div class="header"><div><div class="label">Pipeline</div><div class="value">${pipeline.reduce((a, s) => a + s.count, 0)}</div></div><div class="icon-wrapper purple"><i class="fa-solid fa-filter"></i></div></div></div>
    </div>

    ${pipeline.length ? `
    <div class="portal-pipeline-row" style="display:flex;gap:12px;margin-bottom:1.5rem;overflow-x:auto;">
      ${pipeline.map((s) => `
        <div class="card" style="min-width:120px;padding:12px;text-align:center;">
          <div class="muted" style="font-size:0.75rem;text-transform:uppercase;">${escapeHtml(s.stage)}</div>
          <div style="font-size:1.5rem;font-weight:700;">${s.count}</div>
        </div>`).join('')}
    </div>` : ''}

    <div class="table-container">
      <table class="org-table">
        <thead>
          <tr><th>Name</th><th>Phone</th><th>Lead Score</th><th>Sentiment</th><th>AI Employee</th><th>Last Message</th><th></th></tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map((c) => `
              <tr>
                <td><strong>${escapeHtml(c.name || 'Unknown')}</strong></td>
                <td>${escapeHtml(c.phoneDisplay || c.phone || '—')}</td>
                <td><span class="score-badge">${c.leadScore ?? '—'}</span></td>
                <td>${escapeHtml(c.sentimentLabel || c.averageSentiment || '—')}</td>
                <td>${escapeHtml(c.assignedAiEmployee || '—')}</td>
                <td class="truncate">${escapeHtml((c.lastMessage || '').slice(0, 60))}</td>
                <td><button class="btn btn-secondary btn-sm view-customer-btn" data-phone="${escapeHtml(c.phone || c.id)}" type="button">View</button></td>
              </tr>
            `).join('')
            : `<tr><td colspan="7">${emptyState('No customers yet.')}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div id="customerDetailPanel" class="card" style="margin-top:24px;display:none;"></div>
  `;

  container.querySelectorAll('.view-customer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const phone = btn.dataset.phone;
      setState({ selectedCustomerPhone: phone });
      showCustomerDetail(container, phone, rows);
    });
  });

  if (state.selectedCustomerPhone) {
    showCustomerDetail(container, state.selectedCustomerPhone, rows);
  }
}

function showCustomerDetail(container, phone, rows) {
  const panel = container.querySelector('#customerDetailPanel');
  const customer = rows.find((c) => c.phone === phone || c.id === phone);
  if (!panel || !customer) return;
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="card-header"><h3>${escapeHtml(customer.name)}</h3></div>
    <div class="card-body">
      <div class="info-row"><span class="label">Phone</span><span class="value">${escapeHtml(customer.phoneDisplay || customer.phone)}</span></div>
      <div class="info-row"><span class="label">Email</span><span class="value">${escapeHtml(customer.email || '—')}</span></div>
      <div class="info-row"><span class="label">Lead Score</span><span class="value">${customer.leadScore ?? '—'}</span></div>
      <div class="info-row"><span class="label">Tags</span><span class="value">${(customer.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ') || '—'}</span></div>
      <button class="btn btn-primary btn-sm" type="button" id="openInInboxBtn" style="margin-top:12px;">Open in Inbox</button>
    </div>
  `;
  panel.querySelector('#openInInboxBtn')?.addEventListener('click', () => navigateTo('conversations'));
}
