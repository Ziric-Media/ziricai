import { state, setState } from './state.js';
import { applyTheme, toggleTheme, showToast } from './ui.js';
import { initRouter, navigateTo } from './router.js';
import { initAuthGuard, bindLoginForm, bindLogout } from './auth-guard.js';
import { listCompanies } from './services/companies.js';
import { withTimeout } from './utils.js';
import { DEMO_COMPANIES } from './demo-data.js';

export async function bootstrap() {
  if (location.protocol === 'file:') {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;">Run a local HTTP server (e.g. <code>npm run dev</code> or <code>npx serve .</code>) — ES modules cannot load from file://.</p>';
    return;
  }

  try {
    applyTheme(state.theme);
    bindLoginForm();
    bindLogout();
    initRouter();
    bindShellEvents();
    document.addEventListener('ziric:companies-updated', refreshCompanies);

    initAuthGuard({
      onReady: () => {
        setState({ companies: DEMO_COMPANIES });
        // Render dashboard immediately — do not block on Firestore (can hang when billing/rules fail)
        navigateTo('dashboard');
        refreshCompanies().catch((err) => console.warn('Companies refresh:', err));
      },
    });
  } catch (err) {
    console.error('[admin] Bootstrap failed:', err);
    const status = document.getElementById('loginStatus');
    const message = err?.message || 'Failed to load console. Refresh the page or contact support.';
    if (status) status.textContent = message;
    showToast?.(message, 'error');
  }
}

async function refreshCompanies() {
  const result = await withTimeout(listCompanies());
  const items = result.items?.length ? result.items : DEMO_COMPANIES;
  setState({ companies: items });
  updateCompanySelector();
  const companyCount = document.getElementById('companyCount');
  if (companyCount) companyCount.textContent = String(state.companies.length || '—');
  const agentCount = document.getElementById('agentCount');
  if (agentCount) agentCount.textContent = state.companies.length ? '—' : '4';
}

function updateCompanySelector() {
  const select = document.getElementById('companySelector');
  if (!select) return;
  select.innerHTML = `
    <option value="">All Companies</option>
    ${state.companies.map((c) => `<option value="${c.id}" ${state.selectedCompanyId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
  `;
}

function bindShellEvents() {
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = toggleTheme();
    setState({ theme: next });
    showToast(`Theme: ${next}`, 'info');
  });

  document.getElementById('companySelector')?.addEventListener('change', (e) => {
    const value = e.target.value || null;
    setState({ selectedCompanyId: value });
    showToast(value ? `Scoped to selected company` : 'Showing all companies', 'info');
    navigateTo(state.currentPage);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
    if (e.key === 'Escape') {
      document.getElementById('overlay')?.classList.remove('open');
      document.querySelectorAll('.wizard-overlay.open, .slide-over.open').forEach((el) => el.classList.remove('open'));
    }
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
