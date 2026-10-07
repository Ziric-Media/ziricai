import { escapeHtml, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchPlatformSupportCases } from '../services/platformConsole.js';
import { navigateTo } from '../router.js';

export async function renderSupportInbox(container) {
  container.innerHTML = loadingState('Loading support inbox…');
  const { data, error } = await fetchPlatformSupportCases();
  if (!data) {
    container.innerHTML = pageHeader('Support Inbox', 'Tenant → Portal → Support') + emptyState(error || 'Unable to load inbox.');
    return;
  }

  const cases = data.cases || [];
  const meta = data.meta || {};

  container.innerHTML = `
    ${pageHeader(
      'Support Inbox',
      'Mission Control receives tenant support conversations from the authoritative support pipeline (not a second messaging database).',
      '<button class="btn btn-secondary btn-sm" type="button" id="openSupportPanel">Support panel</button>'
    )}
    ${meta.unavailable ? `<div class="panel-card" style="margin-bottom:1rem"><p class="welcome-text ops-subtitle">${escapeHtml(meta.note || 'Support feed not connected yet.')}</p></div>` : ''}
    <div class="table-container">
      <table class="org-table">
        <thead><tr><th>Company</th><th>Subject</th><th>Status</th><th>Priority</th><th>Updated</th></tr></thead>
        <tbody>
          ${
            cases.length
              ? cases
                  .map(
                    (c) => `<tr>
                <td>${escapeHtml(c.companyName || c.companyId)}</td>
                <td>${escapeHtml(c.subject || '—')}</td>
                <td>${escapeHtml(c.status || '—')}</td>
                <td>${escapeHtml(c.priority || '—')}</td>
                <td>${escapeHtml(c.updatedAt || '—')}</td>
              </tr>`
                  )
                  .join('')
              : `<tr><td colspan="5">${emptyState('No open support conversations yet. When Portal Support is wired, cases will appear here.')}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#openSupportPanel')?.addEventListener('click', () => navigateTo('support'));
}
