import { escapeHtml, pageHeader, loadingState, emptyState } from '../ui.js';
import { fetchPlatformSupportCases } from '../services/platformConsole.js';
import { navigateTo } from '../router.js';

const COLUMNS = [
  { id: 'open', label: 'Open' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'waiting', label: 'Waiting for Customer' },
  { id: 'resolved', label: 'Resolved' },
];

export async function renderSupportPanel(container) {
  container.innerHTML = loadingState('Loading support panel…');
  const { data, error } = await fetchPlatformSupportCases();
  if (!data) {
    container.innerHTML = pageHeader('Support', 'First-class support operations.') + emptyState(error || 'Failed to load support.');
    return;
  }

  const cases = data.cases || [];
  const byStatus = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
  for (const ticket of cases) {
    const key = String(ticket.status || 'open').toLowerCase().replace(/\s+/g, '_');
    if (byStatus[key]) byStatus[key].push(ticket);
    else byStatus.open.push(ticket);
  }

  container.innerHTML = `
    ${pageHeader(
      'Support',
      'Each case links company → tenant → user → conversation → issue area (billing, integrations, AI employee, etc.).',
      '<button class="btn btn-secondary btn-sm" type="button" id="openInbox">Support inbox</button>'
    )}
    ${data.meta?.unavailable ? `<p class="panel-hint">${escapeHtml(data.meta.note || '')}</p>` : ''}
    <div class="mc-support-board">
      ${COLUMNS.map(
        (col) => `
        <div class="mc-support-column">
          <h4>${escapeHtml(col.label)} <span class="badge">${(byStatus[col.id] || []).length}</span></h4>
          ${(byStatus[col.id] || []).length
            ? byStatus[col.id].map(renderTicketCard).join('')
            : '<div class="empty-panel">None</div>'}
        </div>`
      ).join('')}
    </div>
    <div class="panel-card" style="margin-top:1rem">
      <div class="panel-header"><h3>Example layout</h3></div>
      <p class="welcome-text ops-subtitle">
        Ticket #1042 — Company: Central Motors Rustenburg · User: John Smith · Category: WhatsApp · Status: Open · Assigned: Operator · Last activity: 12m ago
      </p>
      <button class="btn btn-primary btn-sm" type="button" id="jumpRtb">Jump to pilot tenant context</button>
    </div>
  `;

  container.querySelector('#openInbox')?.addEventListener('click', () => navigateTo('supportInbox'));
  container.querySelector('#jumpRtb')?.addEventListener('click', () => {
    const select = document.getElementById('companySelector');
    if (select) {
      const opt = [...select.options].find((o) => o.value === 'central-motors-rtb');
      if (opt) {
        select.value = 'central-motors-rtb';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    navigateTo('crm');
  });
}

function renderTicketCard(ticket) {
  return `
    <div class="mc-support-card">
      <div class="rank-name">${escapeHtml(ticket.subject || ticket.id)}</div>
      <div class="panel-hint">${escapeHtml(ticket.companyName || ticket.companyId)} · ${escapeHtml(ticket.category || 'General')}</div>
    </div>`;
}
