import { formatAutomotiveMetric, breakdownToChartRows, formatReportingPeriodLabel } from './automotiveMetricDisplay.js';

/**
 * @param {object|null} payload — API dashboard response
 */
export function buildAutomotiveCommandCentreViewModel(payload) {
  if (!payload) {
    return { error: 'No data', periodLabel: '', kpis: [], charts: [], crm: null, appointments: null };
  }

  const period = payload.period || {};
  const periodLabel = formatReportingPeriodLabel(period.from, period.to);

  const inv = payload.inventory || {};
  const sales = payload.sales || {};
  const crm = payload.crm || {};
  const appt = payload.appointments || {};

  const kpis = [
    { id: 'total', label: 'Total tracked vehicles', ...formatAutomotiveMetric(inv.totals) },
    { id: 'available', label: 'Available', ...formatAutomotiveMetric(inv.byAvailability?.available) },
    { id: 'reserved', label: 'Reserved', ...formatAutomotiveMetric(inv.byAvailability?.reserved) },
    { id: 'soldStock', label: 'Sold (stock status)', ...formatAutomotiveMetric(inv.byAvailability?.sold) },
    {
      id: 'unitsSoldPeriod',
      label: 'Units sold (period)',
      ...formatAutomotiveMetric(sales.unitsSoldInPeriod),
    },
    {
      id: 'testDrives',
      label: 'Test drives (period)',
      ...formatAutomotiveMetric(appt.testDrivesInPeriod),
    },
    {
      id: 'openOpps',
      label: 'Open opportunities',
      ...formatAutomotiveMetric(crm.openOpportunities),
    },
  ];

  const charts = [
    {
      id: 'byMake',
      title: 'Stock by make',
      rows: breakdownToChartRows(inv.byMake),
      unavailable: formatAutomotiveMetric(inv.byMake).kind === 'unavailable',
    },
    {
      id: 'byBody',
      title: 'Stock by body type',
      rows: breakdownToChartRows(inv.byBodyType),
      unavailable: formatAutomotiveMetric(inv.byBodyType).kind === 'unavailable',
    },
    {
      id: 'byCondition',
      title: 'New vs used (when recorded)',
      rows: breakdownToChartRows(inv.byCondition),
      unavailable: formatAutomotiveMetric(inv.byCondition).kind === 'unavailable',
    },
    {
      id: 'crmStage',
      title: 'CRM pipeline',
      rows: breakdownToChartRows(crm.byStage),
      unavailable: formatAutomotiveMetric(crm.byStage).kind === 'unavailable',
    },
  ];

  const realised = formatAutomotiveMetric(sales.realisedSalesValue);
  const listing = formatAutomotiveMetric(sales.listingPriceSumForSoldInPeriod);
  const gross = formatAutomotiveMetric(sales.grossProfit);

  return {
    periodLabel,
    generatedAt: payload.generatedAt,
    kpis,
    charts,
    financial: {
      realised: { title: 'Realised sales value', ...realised },
      listing: {
        title: 'Listing price total (sold in period)',
        ...listing,
        notRealisedRevenue: true,
      },
      gross: { title: 'Gross profit', ...gross },
    },
    appointments: {
      upcoming: formatAutomotiveMetric(appt.upcomingInPeriod),
      testDrivesToday: formatAutomotiveMetric(appt.testDrivesTodayUtc),
    },
  };
}
