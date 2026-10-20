/**
 * Finance Overview — Chart.js graphs (global Chart from company portal index.html).
 */
import { minorToMajor } from './financeDisplay.js';

function destroyCharts(fin) {
  if (Array.isArray(fin._overviewCharts)) {
    for (const c of fin._overviewCharts) {
      try {
        c.destroy();
      } catch {
        /* ignore */
      }
    }
  }
  fin._overviewCharts = [];
}

function majorFromMinor(minor, currency) {
  return minorToMajor(Number(minor) || 0, currency);
}

function moneyTooltipLabel(context, currency) {
  const v = context.parsed?.y ?? context.parsed ?? 0;
  try {
    return `${context.dataset.label}: ${new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(v)}`;
  } catch {
    return `${context.dataset.label}: ${v}`;
  }
}

/**
 * @param {object} fin
 * @param {HTMLElement} container
 * @param {{ movement: object[], series: object, primaryCurrency: string }} data
 */
export function mountFinanceOverviewCharts(fin, container, data) {
  destroyCharts(fin);
  if (typeof Chart === 'undefined') return;

  const { movement, series, primaryCurrency } = data;
  const gridColor = 'rgba(148, 163, 184, 0.15)';
  const textColor = '#64748b';
  const incomeColor = '#059669';
  const expenseColor = '#dc2626';
  const netColor = '#1e40af';

  const barCtx = container.querySelector('#finChartCurrencyBar');
  if (barCtx && movement.length) {
    const labels = movement.map((m) => m.currency);
    const incomeData = movement.map((m) => majorFromMinor(m.incomeMinor, m.currency));
    const expenseData = movement.map((m) => majorFromMinor(m.expenseMinor, m.currency));
    const chart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: 'rgba(5, 150, 105, 0.75)',
            borderRadius: 4,
          },
          {
            label: 'Expenses',
            data: expenseData,
            backgroundColor: 'rgba(220, 38, 38, 0.75)',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label(ctx) {
                const cur = labels[ctx.dataIndex] || primaryCurrency;
                return moneyTooltipLabel(ctx, cur);
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true },
        },
      },
    });
    fin._overviewCharts.push(chart);
  }

  const netCtx = container.querySelector('#finChartNetByCurrency');
  if (netCtx && movement.length) {
    const labels = movement.map((m) => m.currency);
    const netData = movement.map((m) => majorFromMinor(m.netMinor, m.currency));
    const barColors = movement.map((m) =>
      (Number(m.netMinor) || 0) >= 0 ? 'rgba(5, 150, 105, 0.8)' : 'rgba(220, 38, 38, 0.8)'
    );
    const chart = new Chart(netCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Net',
            data: netData,
            backgroundColor: barColors,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const cur = labels[ctx.dataIndex] || primaryCurrency;
                return moneyTooltipLabel(ctx, cur);
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor } },
        },
      },
    });
    fin._overviewCharts.push(chart);
  }

  const lineCtx = container.querySelector('#finChartTrendLine');
  if (lineCtx && series?.labels?.length) {
    const cur = series.currency || primaryCurrency;
    const chart = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Income',
            data: series.incomeMinor.map((m) => majorFromMinor(m, cur)),
            borderColor: incomeColor,
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
          },
          {
            label: 'Expenses',
            data: series.expenseMinor.map((m) => majorFromMinor(m, cur)),
            borderColor: expenseColor,
            backgroundColor: 'rgba(220, 38, 38, 0.06)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
          },
          {
            label: 'Net',
            data: series.netMinor.map((m) => majorFromMinor(m, cur)),
            borderColor: netColor,
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label(ctx) {
                return moneyTooltipLabel(ctx, cur);
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 12 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true },
        },
      },
    });
    fin._overviewCharts.push(chart);
  }

  const doughCtx = container.querySelector('#finChartExpenseMix');
  if (doughCtx && movement.length) {
    const primary = movement.find((m) => m.currency === primaryCurrency) || movement[0];
    const cur = primary.currency;
    const income = majorFromMinor(primary.incomeMinor, cur);
    const expense = majorFromMinor(primary.expenseMinor, cur);
    if (income + expense > 0) {
      const chart = new Chart(doughCtx, {
        type: 'doughnut',
        data: {
          labels: ['Income', 'Expenses'],
          datasets: [
            {
              data: [income, expense],
              backgroundColor: ['rgba(5, 150, 105, 0.85)', 'rgba(220, 38, 38, 0.85)'],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor } },
            tooltip: {
              callbacks: {
                label(ctx) {
                  return moneyTooltipLabel(ctx, cur);
                },
              },
            },
          },
        },
      });
      fin._overviewCharts.push(chart);
    }
  }
}

export function refreshOverviewCharts(fin, container) {
  if (!container || (fin.workspace || 'overview') !== 'overview') {
    destroyCharts(fin);
    return;
  }
  const payload = fin._overviewChartPayload;
  if (!payload) return;
  mountFinanceOverviewCharts(fin, container, payload);
}
