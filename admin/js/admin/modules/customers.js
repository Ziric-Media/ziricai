import { state, setState } from '../state.js';
import {
  pageHeader,
  emptyState,
  loadingState,
  errorState,
} from '../ui.js';
import { listCustomers, normalizeCustomerPhone } from '../services/customers.js';
import {
  renderCustomerListShell,
  filterCustomers,
} from './customers-ui.js';
import { openCustomerDetail } from './customers-detail.js';

let listCache = [];
let listSource = 'api';
let listLoadState = 'ok';
let listError = null;
let activeFilter = 'All';
let searchQuery = '';

export async function renderCustomers(container) {
  container.innerHTML = loadingState('Loading customers...');

  const companyId = state.selectedCompanyId || null;
  const result = await listCustomers(companyId);
  listCache = result.items || [];
  listSource = result.source || 'api';
  listLoadState = result.loadState || (listCache.length ? 'ok' : 'empty');
  listError = result.error || null;

  if (result.loadState === 'scope_required') {
    container.innerHTML = `
      ${pageHeader(
        'Customers',
        'Rich CRM profiles powered by WhatsApp conversations and AI intelligence.',
        '<span class="crm-source-badge">Live API</span>'
      )}
      ${emptyState(
        'Select a company to view customers.',
        '<button class="btn btn-primary" type="button" id="selectCompanyScope"><i class="fa-solid fa-building"></i> Select company</button>'
      )}
    `;
    container.querySelector('#selectCompanyScope')?.addEventListener('click', () => {
      const select = document.getElementById('companySelector');
      select?.focus();
      select?.click();
    });
    return;
  }

  if (result.loadState === 'error') {
    container.innerHTML = `
      ${pageHeader(
        'Customers',
        'Rich CRM profiles powered by WhatsApp conversations and AI intelligence.',
        '<span class="crm-source-badge">Live API</span>'
      )}
      ${errorState('Unable to load customers. Please check your connection and try again.')}
      <div style="text-align:center;margin-top:-24px;padding-bottom:32px;">
        <button class="btn btn-primary" type="button" id="retryCustomers">
          <i class="fa-solid fa-rotate-right"></i> Retry
        </button>
      </div>
    `;
    container.querySelector('#retryCustomers')?.addEventListener('click', () => renderCustomers(container));
    return;
  }

  if (state.selectedCustomerPhone) {
    const phone = state.selectedCustomerPhone;
    setState({ selectedCustomerPhone: null });
    return openCustomerDetail(container, phone, () => renderCustomers(container));
  }

  paintList(container);
}

function sourceBadgeLabel() {
  if (listSource === 'demo') return 'Demo fallback';
  return 'Live API';
}

function paintList(container) {
  const filtered = filterCustomers(listCache, { search: searchQuery, filter: activeFilter });

  container.innerHTML = `
    ${pageHeader(
      'Customers',
      'Rich CRM profiles powered by WhatsApp conversations and AI intelligence.',
      `<span class="crm-source-badge">${sourceBadgeLabel()}</span>`
    )}
    ${renderCustomerListShell({
      customers: filtered,
      search: searchQuery,
      activeFilter,
      sourceLabel: `${filtered.length} customer${filtered.length === 1 ? '' : 's'}`,
    })}
  `;

  bindListEvents(container, filtered);
}

function bindListEvents(container, visibleCustomers) {
  const rerender = () => paintList(container);

  container.querySelector('#customerSearch')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    rerender();
  });

  container.querySelectorAll('.crm-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter || 'All';
      rerender();
    });
  });

  container.querySelectorAll('.crm-name-link, .crm-row').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.crm-delete-note')) return;
      const phone = el.dataset.phone || el.closest('[data-phone]')?.dataset.phone;
      if (!phone) return;
      openCustomerDetail(container, phone, () => {
        searchQuery = container.querySelector('#customerSearch')?.value || searchQuery;
        renderCustomers(container);
      });
    });
  });

  if (!visibleCustomers.length && !listCache.length) {
    container.querySelector('#customerTableBody').innerHTML = `
      <tr><td colspan="8">${emptyState('No customers yet. WhatsApp inbound messages create profiles automatically.')}</td></tr>`;
  }
}

/** Open CRM detail from Live Conversations inbox. */
export function navigateToCustomer(phone) {
  const key = normalizeCustomerPhone(phone);
  setState({ selectedCustomerPhone: key, currentPage: 'customers' });
  import('../router.js').then(({ navigateTo }) => navigateTo('customers'));
}

export { openCustomerDetail };
