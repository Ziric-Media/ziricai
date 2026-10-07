/**
 * PI-4E — Platform Intelligence dashboard sections (read-model display only).
 */
import { escapeHtml, formatNumber } from '../ui.js';
import {
  ORG_TYPE_LABELS,
  PI_PERIOD_PRESETS,
  formatGrowthPct,
} from '../services/platformIntelligenceClient.js';

const PENDING_CHANNELS = [
  { id: 'messenger', label: 'Messenger', status: 'pending' },
  { id: 'email', label: 'Email', status: 'pending' },
  { id: 'web_chat', label: 'Web', status: 'pending' },
];

const SECTOR_RANK_METRICS = [
  { id: 'organisations', label: 'Organisations' },
  { id: 'messages', label: 'Messages' },
  { id: 'people', label: 'People' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'growth', label: 'Growth' },
];

function pct(part, whole) {
  const p = Number(part || 0);
  const w = Number(whole || 0);
  if (w <= 0) return '—';
  return `${Math.round((p / w) * 1000) / 10}%`;
}

function assessmentIcon(level) {
  if (level === 'healthy') return '🟢';
  if (level === 'growing') return '📈';
  if (level === 'risk') return '🔴';
  return '🟡';
}

export function renderPiPeriodToolbar(activePresetId, periodLabel) {
  const buttons = PI_PERIOD_PRESETS.map(
    (p) =>
      `<button type="button" class="pi-period-btn${p.id === activePresetId ? ' active' : ''}" data-pi-preset="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`
  ).join('');
  return `
    <div class="pi-global-period">
      <div class="pi-period-buttons">${buttons}</div>
      <div class="pi-period-custom" id="piCustomPeriod" hidden>
        <input type="date" id="piCustomDate" class="pi-custom-date" />
        <select id="piCustomGrain" class="pi-custom-grain">
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <button type="button" class="btn btn-secondary btn-sm" id="piApplyCustom">Apply</button>
      </div>
      <p class="pi-period-label"><strong>Platform Intelligence</strong> — ${escapeHtml(periodLabel)}</p>
    </div>`;
}

export function renderChannelCoverage(intel) {
  const live = intel?.meta?.channelsIncluded || ['whatsapp'];
  const rows = [
    ...live.map((ch) => ({
      id: ch,
      label: ch === 'whatsapp' ? 'WhatsApp' : ch,
      status: 'live',
    })),
    ...PENDING_CHANNELS.filter((p) => !live.includes(p.id)),
  ];
  return `
    <div class="pi-channel-coverage" aria-label="Channel measurement coverage">
      ${rows
        .map(
          (r) =>
            `<span class="pi-channel-chip pi-channel-${r.status}">${escapeHtml(r.label)} — ${r.status === 'live' ? 'Live' : 'Pending'}</span>`
        )
        .join('')}
      <span class="pi-channel-note">Pending channels are not shown as zero activity — ingestion not live yet.</span>
    </div>`;
}

export function renderOrganisationNetwork(intel) {
  if (!intel) return '';
  const census = intel.organisationNetwork || {};
  const types = intel.communications?.byOrganisationType || [];
  const typeMap = new Map(types.map((t) => [t.organisationType, t]));
  const growthOrg = intel.growthVersusPreviousPeriod?.organisationsActive;

  const rows = ['company', 'government', 'political_public_service'].map((type) => {
    const comm = typeMap.get(type) || {};
    const orgCount = census.byOrganisationType?.[type] ?? 0;
    return {
      type,
      label: ORG_TYPE_LABELS[type] || type,
      organisations: orgCount,
      active: comm.all > 0 ? '—' : '—',
      messages: comm.all ?? 0,
      people: comm.uniquePlatformUsersActive ?? 0,
    };
  });

  const activeFromIntel = intel.communications?.totals?.organisationsActive ?? 0;

  return `
    <section class="pi-network-panel" aria-labelledby="pi-org-network-title">
      <header class="pi-panel-header">
        <h2 id="pi-org-network-title"><i class="fa-solid fa-building"></i> Organisation Network</h2>
      </header>
      <div class="pi-kpi-row">
        ${piKpi('Total organisations', census.totalOrganisations)}
        ${piKpi('Active this period', activeFromIntel)}
        ${piKpi('Growth (active orgs)', formatGrowthPct(growthOrg))}
      </div>
      <div class="pi-table-wrap">
        <table class="pi-data-table">
          <thead>
            <tr>
              <th>Organisation type</th>
              <th>Organisations</th>
              <th>Messages</th>
              <th>People</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
              <td>${escapeHtml(r.label)}</td>
              <td>${formatNumber(r.organisations)}</td>
              <td>${formatNumber(r.messages)}</td>
              <td>${formatNumber(r.people)}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

export function renderPeopleNetwork(intel) {
  if (!intel) return '';
  const u = intel.userNetwork?.totals || {};
  const growth = intel.growthVersusPreviousPeriod?.uniquePlatformUsersActive;
  return `
    <section class="pi-network-panel" aria-labelledby="pi-people-network-title">
      <header class="pi-panel-header">
        <h2 id="pi-people-network-title"><i class="fa-solid fa-users"></i> People Network</h2>
      </header>
      <div class="pi-kpi-row">
        ${piKpi('Unique people', u.uniquePlatformUsersActive)}
        ${piKpi('New', u.newPlatformUsers)}
        ${piKpi('Returning', u.returningPlatformUsersActive)}
        ${piKpi('Multi-organisation', u.multiOrganisationUsersActive)}
        ${piKpi('Multi-channel', u.multiChannelUsersActive)}
        ${piKpi('Growth', formatGrowthPct(growth))}
      </div>
      <p class="pi-panel-hint">Multi-channel counts use strong identity matches only (WhatsApp today).</p>
    </section>`;
}

export function renderCommunicationsNetwork(intel, snapshots, globalLabel) {
  const msg = intel?.communications?.totals?.messages || {};
  const growth = intel?.growthVersusPreviousPeriod?.messages?.all;
  const snapRow = (label, data) => {
    const m = data?.communications?.totals?.messages || {};
    return `<div class="pi-comms-snap">
      <span class="pi-comms-snap-label">${escapeHtml(label)}</span>
      <span class="pi-comms-snap-value">${formatNumber(m.all ?? 0)}</span>
      <span class="pi-comms-snap-sub">${formatNumber(m.inbound ?? 0)} in · ${formatNumber(m.outbound ?? 0)} out</span>
    </div>`;
  };

  const wa = intel?.communications?.byChannel?.whatsapp || intel?.communications?.totals || {};

  return `
    <section class="pi-network-panel" aria-labelledby="pi-comms-network-title">
      <header class="pi-panel-header">
        <h2 id="pi-comms-network-title"><i class="fa-solid fa-comments"></i> Communications Network</h2>
        <span class="pi-panel-scope">Selected period: ${escapeHtml(globalLabel)}</span>
      </header>
      <div class="pi-comms-snapshots">
        ${snapRow('Today', snapshots?.day)}
        ${snapRow('This week', snapshots?.week)}
        ${snapRow('This month', snapshots?.month)}
      </div>
      <div class="pi-kpi-row">
        ${piKpi('Messages (period)', msg.all)}
        ${piKpi('Inbound', msg.inbound)}
        ${piKpi('Outbound', msg.outbound)}
        ${piKpi('Conversations', intel?.communications?.totals?.conversationsActive)}
        ${piKpi('Growth', formatGrowthPct(growth))}
      </div>
      <div class="pi-table-wrap">
        <table class="pi-data-table pi-comms-channel-table">
          <thead>
            <tr><th>Channel</th><th>Status</th><th>Messages</th><th>Conversations</th><th>People</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>WhatsApp</td>
              <td><span class="pi-channel-chip pi-channel-live">Live</span></td>
              <td>${formatNumber(wa.all ?? msg.all ?? 0)}</td>
              <td>${formatNumber(intel?.communications?.totals?.conversationsActive ?? 0)}</td>
              <td>${formatNumber(intel?.userNetwork?.totals?.uniquePlatformUsersActive ?? 0)}</td>
            </tr>
            ${PENDING_CHANNELS.map(
              (ch) => `<tr class="pi-row-pending">
              <td>${escapeHtml(ch.label)}</td>
              <td><span class="pi-channel-chip pi-channel-pending">Pending</span></td>
              <td colspan="3">Not instrumented — not shown as zero</td>
            </tr>`
            ).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

export function renderSectorIntelligence(intel, rankBy = 'organisations') {
  if (!intel) return '';
  const census = intel.organisationNetwork?.bySector || {};
  const commSectors = intel.communications?.bySector || [];

  let rows = commSectors.map((s) => ({
    sectorId: s.sectorId,
    sectorLabel: s.sectorLabel || s.sectorId,
    organisations: s.organisations ?? 0,
    messages: s.all ?? 0,
    people: s.uniquePlatformUsersActive ?? 0,
    conversations: s.conversationsActive ?? 0,
    growth: s.all ?? 0,
  }));

  if (rankBy === 'organisations') {
    rows = Object.entries(census)
      .map(([key, count]) => {
        const sectorId = key.split('::')[1] || key;
        const comm = commSectors.find((s) => s.sectorId === sectorId);
        return {
          sectorId,
          sectorLabel: comm?.sectorLabel || sectorId,
          organisations: count,
          messages: comm?.all ?? 0,
          people: comm?.uniquePlatformUsersActive ?? 0,
          conversations: comm?.conversationsActive ?? 0,
          growth: comm?.all ?? 0,
        };
      })
      .sort((a, b) => b.organisations - a.organisations);
  } else {
    const key = rankBy === 'people' ? 'people' : rankBy === 'conversations' ? 'conversations' : rankBy === 'growth' ? 'messages' : 'messages';
    rows.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  }

  const top = rows.slice(0, 10);
  const rankButtons = SECTOR_RANK_METRICS.map(
    (m) =>
      `<button type="button" class="pi-rank-btn${m.id === rankBy ? ' active' : ''}" data-pi-rank="${m.id}">${escapeHtml(m.label)}</button>`
  ).join('');

  return `
    <section class="pi-network-panel pi-sector-panel" aria-labelledby="pi-sector-title">
      <header class="pi-panel-header">
        <h2 id="pi-sector-title"><i class="fa-solid fa-chart-pie"></i> Sector Intelligence</h2>
        <div class="pi-rank-buttons">Rank by: ${rankButtons}</div>
      </header>
      <ol class="pi-sector-list">
        ${top
          .map(
            (s, i) => `<li>
          <span class="pi-sector-rank">${i + 1}</span>
          <span class="pi-sector-name">${escapeHtml(s.sectorLabel)}</span>
          <span class="pi-sector-metrics">
            ${formatNumber(s.organisations)} orgs · ${formatNumber(s.messages)} msgs · ${formatNumber(s.people)} people
          </span>
        </li>`
          )
          .join('')}
      </ol>
    </section>`;
}

export function renderSarahAssessment(facts) {
  if (!facts?.length) return '';
  return `
    <section class="pi-assessment-panel" aria-label="Platform assessment">
      <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Platform assessment</h3>
      <ul class="pi-assessment-list">
        ${facts.map((f) => `<li>${assessmentIcon(f.level)} ${escapeHtml(f.text)}</li>`).join('')}
      </ul>
      <p class="pi-panel-hint">Derived from read models — same facts Sarah uses in operations reports.</p>
    </section>`;
}

function piKpi(label, value) {
  return `<div class="pi-kpi-card">
    <span class="pi-kpi-value">${value == null || value === '' ? '—' : escapeHtml(String(value))}</span>
    <span class="pi-kpi-label">${escapeHtml(label)}</span>
  </div>`;
}

export function bindPiDashboardEvents(container, { onPresetChange, onCustomApply, onRankChange }) {
  container.querySelectorAll('[data-pi-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.piPreset;
      const customEl = container.querySelector('#piCustomPeriod');
      if (customEl) customEl.hidden = id !== 'custom';
      onPresetChange?.(id);
    });
  });
  container.querySelector('#piApplyCustom')?.addEventListener('click', () => {
    const date = container.querySelector('#piCustomDate')?.value;
    const grain = container.querySelector('#piCustomGrain')?.value || 'day';
    onCustomApply?.({ date, grain });
  });
  container.querySelectorAll('[data-pi-rank]').forEach((btn) => {
    btn.addEventListener('click', () => onRankChange?.(btn.dataset.piRank));
  });
}
