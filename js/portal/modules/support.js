import { state, requireCompanyId } from '../core/dataStore.js';
import { escapeHtml, pageHeader, loadingState, emptyState, errorState, showToast } from '../../admin/ui.js';
import { renderQuickActions } from '../core/widgets/quickActions.js';
import { fetchSupportCases, createSupportCase, patchSupportCase } from '../api.js';
import { normalizeRole } from '../permissions.js';

const FAQ = [
  { q: 'How do I connect WhatsApp?', a: 'Open Integrations or ask Sarah: "Connect WhatsApp". You will need your Meta Business credentials.' },
  { q: 'How do I add an AI Employee?', a: 'Go to AI Employees → Create, or ask Sarah to create one for your department.' },
  { q: 'Where is my billing history?', a: 'Billing shows invoices, plan usage, and renewal dates for your tenant.' },
  { q: 'Can I invite team members?', a: 'Owners and managers can invite users from Team with role-based permissions.' },
];

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'billing', label: 'Billing' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'ai_employee', label: 'AI Employee' },
  { value: 'knowledge', label: 'Knowledge Base' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'account', label: 'Account' },
  { value: 'other', label: 'Other' },
];

const STATUSES = ['open', 'assigned', 'waiting', 'resolved'];

function canPatchSupport(role) {
  return ['owner', 'manager', 'support', 'superadmin'].includes(normalizeRole(role));
}

function statusLabel(status) {
  const map = {
    open: 'Open',
    assigned: 'Assigned',
    waiting: 'Waiting',
    resolved: 'Resolved',
  };
  return map[String(status || '').toLowerCase()] || status;
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderCaseRow(c, canPatch) {
  const statusOptions = STATUSES.map(
    (s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
  ).join('');
  return `
    <tr data-case-id="${escapeHtml(c.id)}">
      <td>${escapeHtml(c.subject)}</td>
      <td>${escapeHtml(c.category || 'general')}</td>
      <td>${escapeHtml(c.priority || 'medium')}</td>
      <td>
        ${
          canPatch && c.status !== 'resolved'
            ? `<select class="form-input bos-support-status" data-case-id="${escapeHtml(c.id)}" aria-label="Status">${statusOptions}</select>`
            : escapeHtml(statusLabel(c.status))
        }
      </td>
      <td>${escapeHtml(formatWhen(c.updatedAt))}</td>
    </tr>`;
}

export async function renderSupport(container) {
  container.innerHTML = loadingState('Loading support…');

  let companyId;
  try {
    companyId = requireCompanyId();
  } catch {
    container.innerHTML = pageHeader('Support', 'Help center and support cases.') + emptyState('Sign in to a company workspace to view support.');
    return;
  }

  const role = state.profile?.role || state.user?.role;
  const canPatch = canPatchSupport(role);

  const { data, error } = await fetchSupportCases(companyId);
  const cases = data?.items || [];

  container.innerHTML = `
    ${pageHeader('Support', 'Open a support case for your company or browse FAQs and contact options.')}
    ${renderQuickActions([
      { label: 'Email Support', icon: 'fa-envelope', action: 'email', color: 'blue' },
      { label: 'View Documentation', icon: 'fa-book-open', action: 'docs', color: 'purple' },
      { label: 'Ask Sarah', icon: 'fa-sparkles', action: 'sarah', color: 'green' },
    ])}

    <div class="panel-card bos-panel" style="margin-bottom:1rem">
      <div class="panel-header"><h3><i class="fa-solid fa-ticket"></i> Your support cases</h3></div>
      ${
        error
          ? errorState(error)
          : cases.length
            ? `<div class="table-container"><table class="org-table bos-support-table">
              <thead><tr><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>${cases.map((c) => renderCaseRow(c, canPatch)).join('')}</tbody>
            </table></div>`
            : emptyState('No support cases yet. Submit a request below and our team will follow up.')
      }
    </div>

    <div class="panel-card bos-panel" style="margin-bottom:1rem">
      <div class="panel-header"><h3><i class="fa-solid fa-plus"></i> New support case</h3></div>
      <form id="bosSupportForm" class="bos-support-form">
        <label class="form-label">Subject <span class="required">*</span></label>
        <input class="form-input" name="subject" required maxlength="200" placeholder="Brief summary" />
        <label class="form-label">Category</label>
        <select class="form-input" name="category">
          ${CATEGORIES.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join('')}
        </select>
        <label class="form-label">Priority</label>
        <select class="form-input" name="priority">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
        <label class="form-label">Description</label>
        <textarea class="form-input" name="description" rows="4" placeholder="What do you need help with?"></textarea>
        <button type="submit" class="btn btn-primary">Submit case</button>
      </form>
    </div>

    <div class="bos-support-grid">
      <div class="panel-card bos-panel">
        <div class="panel-header"><h3><i class="fa-solid fa-circle-question"></i> FAQ</h3></div>
        <div class="bos-faq-list">
          ${FAQ.map((item) => `
            <details class="bos-faq-item">
              <summary>${escapeHtml(item.q)}</summary>
              <p>${escapeHtml(item.a)}</p>
            </details>`).join('')}
        </div>
      </div>
      <div class="panel-card bos-panel">
        <div class="panel-header"><h3><i class="fa-solid fa-headset"></i> Contact</h3></div>
        <div class="bos-support-contact">
          <p><strong>Email:</strong> support@ziricai.com</p>
          <p><strong>Hours:</strong> Mon–Fri, 8:00–17:00 SAST</p>
          <p><strong>Priority:</strong> Business plan includes same-day response.</p>
        </div>
      </div>
    </div>
  `;

  container.querySelector('[data-action="email"]')?.addEventListener('click', () => {
    window.location.href = 'mailto:support@ziricai.com?subject=Company%20Portal%20Support';
  });
  container.querySelector('[data-action="docs"]')?.addEventListener('click', () => {
    window.open('docs/architecture/PORTAL_BOS.md', '_blank');
  });
  container.querySelector('[data-action="sarah"]')?.addEventListener('click', async () => {
    const { openPortalSarah } = await import('../sarah/sarah-ui.js');
    openPortalSarah();
  });

  container.querySelector('#bosSupportForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const subject = form.subject.value.trim();
    const description = form.description.value.trim();
    const category = form.category.value;
    const priority = form.priority.value;
    const profile = state.profile || {};
    const result = await createSupportCase(companyId, {
      subject,
      description: description || null,
      category,
      priority,
      source: 'portal',
      requesterName: profile.fullName || profile.displayName || null,
      requesterEmail: profile.email || state.user?.email || null,
    });
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    showToast('Support case submitted', 'success');
    await renderSupport(container);
  });

  container.querySelectorAll('.bos-support-status').forEach((select) => {
    select.addEventListener('change', async () => {
      const caseId = select.dataset.caseId;
      const status = select.value;
      const result = await patchSupportCase(companyId, caseId, { status });
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Case updated', 'success');
    });
  });
}
