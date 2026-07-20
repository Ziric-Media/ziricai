import { state, setState } from '../state.js';
import {
  pageHeader,
  emptyState,
  loadingState,
} from '../ui.js';
import { listCustomers, normalizeCustomerPhone } from '../services/customers.js';
import {
  renderCustomerListShell,
  filterCustomers,
} from './customers-ui.js';
import { openCustomerDetail } from './customers-detail.js';

let listCache = [];
let listSource = 'demo';
let activeFilter = 'All';
let searchQuery = '';

export async function renderCustomers(container) {
  container.innerHTML = loadingState('Loading customers...');

  const companyId = state.selectedCompanyId || null;
  const result = await listCustomers(companyId);
  listCache = result.items || [];
  listSource = result.source || 'demo';

  if (state.selectedCustomerPhone) {
    const phone = state.selectedCustomerPhone;
    setState({ selectedCustomerPhone: null });
    return openCustomerDetail(container, phone, () => renderCustomers(container));
  }

  paintList(container);
}

function paintList(container) {
  const filtered = filterCustomers(listCache, { search: searchQuery, filter: activeFilter });

  container.innerHTML = `
    ${pageHeader(
      'Customers',
      'Rich CRM profiles powered by WhatsApp conversations and AI intelligence.',
      `<span class="crm-source-badge">${listSource === 'api' ? 'Live API' : 'Demo fallback'}</span>`
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
