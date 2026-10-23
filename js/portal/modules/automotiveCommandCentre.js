import { state } from '../core/dataStore.js';
import { escapeHtml, errorState, formatNumber } from '../../admin/ui.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { renderKpiCard } from '../core/widgets/kpiCard.js';
import { fetchAutomotiveDashboard } from '../api.js';
import { isAutomotivePresetActive } from '../automotive/automotivePreset.js';
import { buildAutomotiveCommandCentreViewModel } from '../automotive/automotiveCommandCentreModel.js';
import {
  shouldApplyAutomotiveDashboardResponse,
  salesMetricCardTitle,
} from '../automotive/automotiveMetricDisplay.js';
import { renderBarChart, renderSwChartCard } from '../sarahWorkspaceUi.js';

let loadGeneration = 0;
let activeCompanyId = null;
let dateFrom = '';
let dateTo = '';

function defaultPeriodDays() {
  return '30';
}

function validateIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function renderMetricKpi({ label, display, kind, ariaLabel }) {
  const value =
    kind === 'unavailable'
      ? 'Unavailable'
      : display != null
        ? String(display)
        : '—';
  const color = kind === 'unavailable' ? 'gray' : 'blue';
  return renderKpiCard({
    label: ariaLabel ? `${label} (${kind})` : label,
    value,
    icon: kind === 'unavailable' ? 'fa-circle-question' : 'fa-chart-simple',
    color,
  });
}

function renderFinancialRow(item) {
  const title = salesMetricCardTitle(item.title, item);
  const value =
    item.kind === 'unavailable'
      ? 'Unavailable'
      : item.display != null
        ? formatNumber(Number(item.display)) || String(item.display)
        : '—';
  return `<div class="automotive-fin-row" role="group" aria-label="${escapeHtml(title)}">
    <span class="automotive-fin-label">${escapeHtml(title)}</span>
    <strong class="automotive-fin-value automotive-metric-${escapeHtml(item.kind)}">${escapeHtml(value)}</strong>
  </div>`;
}

function renderChartsSection(charts) {
  return charts
    .map((chart) => {
      if (chart.unavailable) {
        return renderSwChartCard(
          chart.title,
          'Source unavailable',
          `<p class="form-hint">This breakdown is not available from current stock records.</p>`
        );
      }
      if (!chart.rows || !chart.rows.length) {
        return renderSwChartCard(chart.title, 'No data', `<p class="form-hint">No records to chart.</p>`);
      }
      return renderSwChartCard(chart.title, 'Current tracked stock', renderBarChart(chart.rows));
    })
    .join('');
}

function renderDashboardBody(viewModel) {
  const kpiHtml = viewModel.kpis.map((k) => renderMetricKpi(k)).join('');
  const financialHtml = [
    renderFinancialRow(viewModel.financial.realised),
    renderFinancialRow(viewModel.financial.listing),
    renderFinancialRow(viewModel.financial.gross),
  ].join('');

  const appt = viewModel.appointments;
  const apptHtml = `<div class="automotive-appt-summary">
    <p><strong>Appointments in period:</strong> ${escapeHtml(appt.upcoming.display ?? (appt.upcoming.kind === 'unavailable' ? 'Unavailable' : '0'))}</p>
    <p><strong>Test drives today (UTC):</strong> ${escapeHtml(appt.testDrivesToday.display ?? (appt.testDrivesToday.kind === 'unavailable' ? 'Unavailable' : '0'))}</p>
  </div>`;

  return `
    <section class="bos-overview-section">
      <div class="kpi-grid kpi-grid-ops bos-live-grid">${kpiHtml}</div>
    </section>
    <section class="bos-overview-section automotive-fin-section">
      <h2 class="bos-section-title">Sales &amp; financial (period)</h2>
      <p class="form-hint">Listing price totals are not realised revenue. CRM "won" is not counted as a vehicle sale.</p>
      ${financialHtml}
    </section>
    <section class="bos-overview-section automotive-charts-section">
      <h2 class="bos-section-title">Inventory &amp; CRM breakdown</h2>
      <div class="automotive-chart-grid">${renderChartsSection(viewModel.charts)}</div>
    </section>
    <section class="bos-overview-section">
      <h2 class="bos-section-title">Appointments</h2>
      ${apptHtml}
    </section>`;
}

async function loadAndRender(container, companyId, generation) {
  const query = {};
  if (validateIsoDate(dateFrom) && validateIsoDate(dateTo)) {
    query.from = dateFrom;
    query.to = dateTo;
  } else {
    query.periodDays = defaultPeriodDays();
  }

  const res = await fetchAutomotiveDashboard(companyId, query);
  if (!shouldApplyAutomotiveDashboardResponse(generation, loadGeneration)) return;
  if (activeCompanyId !== companyId) return;

  if (res.error) {
    const status = res.status;
    if (status === 401 || status === 403) {
      container.innerHTML = errorState(res.error || 'Access denied');
      return;
    }
    container.innerHTML = `
      ${errorState(res.error || 'Failed to load Automotive dashboard')}
      <p class="form-hint"><button type="button" class="btn btn-secondary btn-sm" id="automotiveRetryLoad">Retry</button></p>`;
    container.querySelector('#automotiveRetryLoad')?.addEventListener('click', () => {
      renderAutomotiveCommandCentre(container);
    });
    return;
  }

  const viewModel = buildAutomotiveCommandCentreViewModel(res.data);
  const companyName = state.company?.name || 'Dealership';
  const synced = viewModel.generatedAt
    ? new Date(viewModel.generatedAt).toLocaleString()
    : 'just now';

  container.innerHTML = `
    <div class="bos-overview-page automotive-command-centre">
      <header class="dashboard-header portal-header bos-overview-header">
        <div>
          <p class="bos-overview-eyebrow"><i class="fa-solid fa-car"></i> Automotive Command Centre</p>
          <h1>${escapeHtml(companyName)}</h1>
          <p class="form-hint">${escapeHtml(viewModel.periodLabel)}</p>
          <p class="form-hint">Synced ${escapeHtml(synced)}</p>
        </div>
        <div class="dashboard-header-actions">
          <label class="form-hint">From <input type="date" id="automotiveDateFrom" value="${escapeHtml(dateFrom)}" /></label>
          <label class="form-hint">To <input type="date" id="automotiveDateTo" value="${escapeHtml(dateTo)}" /></label>
          <button type="button" class="btn btn-secondary btn-sm" id="automotiveApplyDates">Apply</button>
          <button type="button" class="btn btn-secondary btn-sm" id="automotiveRefresh">
            <i class="fa-solid fa-rotate"></i> Refresh
          </button>
        </div>
      </header>
      ${renderDashboardBody(viewModel)}
    </div>`;

  container.querySelector('#automotiveRefresh')?.addEventListener('click', () => {
    renderAutomotiveCommandCentre(container);
  });
  container.querySelector('#automotiveApplyDates')?.addEventListener('click', () => {
    dateFrom = container.querySelector('#automotiveDateFrom')?.value || '';
    dateTo = container.querySelector('#automotiveDateTo')?.value || '';
    if (dateFrom && dateTo && dateFrom > dateTo) {
      container.querySelector('.automotive-command-centre')?.insertAdjacentHTML(
        'afterbegin',
        `<p class="form-hint" role="alert">From date must be on or before to date.</p>`
      );
      return;
    }
    renderAutomotiveCommandCentre(container);
  });
}

export async function renderAutomotiveCommandCentre(container) {
  const companyId = state.companyId;
  if (!companyId) {
    container.innerHTML = errorState('No company selected');
    return;
  }
  if (!isAutomotivePresetActive(state.company)) {
    container.innerHTML = errorState('Automotive industry preset is not active for this workspace.');
    return;
  }

  loadGeneration += 1;
  const generation = loadGeneration;
  activeCompanyId = companyId;

  container.innerHTML = renderLoadingSkeleton({ label: 'Loading Automotive Command Centre…', cards: 6, rows: 2 });

  await loadAndRender(container, companyId, generation);
}
