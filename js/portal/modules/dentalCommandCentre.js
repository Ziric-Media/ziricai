import { state } from '../core/dataStore.js';
import { escapeHtml, errorState, formatNumber } from '../../admin/ui.js';
import { renderLoadingSkeleton } from '../core/widgets/loadingSkeleton.js';
import { renderKpiCard } from '../core/widgets/kpiCard.js';
import { summarizeDentalPosRevenue } from '../dental/dentalPosRevenue.js';
import {
  fetchAiEmployees,
  fetchAppointments,
  fetchCrmCustomers,
  fetchCrmLeads,
  fetchIntegrationsHealth,
  fetchKnowledgeDocuments,
  fetchTenantConversations,
  fetchDentalPatients,
  fetchDentalClaims,
  fetchDentalSales,
} from '../api.js';
import { isSmilemoreDentalCommandCentreTenant, smilemorePracticeRibbon } from '../dental/smilemoreDentalGate.js';
import { SMILEMORE_HOURS, SMILEMORE_LOCATIONS, SMILEMORE_PUBLIC_TEAM, practiceWall } from '../dental/smilemorePractice.js';

let renderGeneration = 0;

function items(result) {
  const data = result?.data ?? result;
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
}

function cancelled(status) {
  return ['cancelled', 'canceled'].includes(String(status || '').toLowerCase());
}

function activeBooking(status) {
  return ['requested', 'confirmed', 'checked_in', 'scheduled'].includes(String(status || '').toLowerCase());
}

function metric(label, value) {
  return `<div class="dental-command-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

const STATUS_LABEL = {
  connected: 'Connected',
  pending: 'Pending check',
  empty: 'No records',
  unavailable: 'Not connected',
  error: 'Could not load',
};

function section({ icon, title, state: status, body, action }) {
  const label = STATUS_LABEL[status] || 'Status';
  return `<article class="card dental-command-card dental-command-card--${escapeHtml(status)}">
    <div class="card-body">
      <div class="dental-command-card__heading">
        <span class="dental-command-card__icon" aria-hidden="true"><i class="fa-solid ${escapeHtml(icon)}"></i></span>
        <div class="dental-command-card__titles">
          <h2>${escapeHtml(title)}</h2>
          <span class="dental-command-card__status">${escapeHtml(label)}</span>
        </div>
      </div>
      <div class="dental-command-card__body">${body}</div>
      ${action ? `<div class="dental-command-card__action"><button type="button" class="btn btn-secondary btn-sm" data-nav="${escapeHtml(action.page)}">${escapeHtml(action.label)}</button></div>` : ''}
    </div>
  </article>`;
}

function errorResult(result, label, action) {
  return result?.error
    ? { state: 'error', body: `<p class="form-hint" role="alert">${escapeHtml(result.error || `${label} could not be loaded.`)}</p>`, action }
    : null;
}

function unavailable(message) {
  return { state: 'unavailable', body: `<p class="form-hint">${escapeHtml(message)}</p>` };
}

function appointments(result) {
  const failed = errorResult(result, 'Bookings', { page: 'appointments', label: 'Open bookings' });
  if (failed) return failed;
  const records = items(result);
  const today = practiceWall(new Date()).slice(0, 10);
  const requested = records.filter((record) => String(record.status || '').toLowerCase() === 'requested').length;
  const confirmed = records.filter((record) => ['confirmed', 'scheduled'].includes(String(record.status || '').toLowerCase())).length;
  const todayCount = records.filter((record) => activeBooking(record.status) && practiceWall(record.scheduledAt).slice(0, 10) === today).length;
  return {
    state: records.length ? 'connected' : 'empty',
    body: `${metric('Today', todayCount)}${metric('Requested', requested)}${metric('Confirmed', confirmed)}<p class="form-hint">Sarah Sales writes requests here. A request stays requested until the diary says confirmed. ${records.filter((record) => cancelled(record.status)).length} cancelled.</p>`,
    action: { page: 'appointments', label: 'Open bookings' },
  };
}

function crm(customersResult, leadsResult) {
  const failed = errorResult(customersResult, 'CRM contacts', { page: 'customers', label: 'Open CRM' })
    || errorResult(leadsResult, 'CRM enquiries', { page: 'customers', label: 'Open CRM' });
  if (failed) return failed;
  const customers = items(customersResult);
  const leads = items(leadsResult);
  return {
    state: customers.length || leads.length ? 'connected' : 'empty',
    body: `${metric('CRM contacts', customers.length)}${metric('Open enquiries', leads.length)}<p class="form-hint">CRM contacts are not clinical records.</p>`,
    action: { page: 'customers', label: 'Open CRM' },
  };
}

function reception(employeesResult, conversationsResult) {
  const failed = errorResult(employeesResult, 'AI employee status', { page: 'agents', label: 'Open AI Employees' })
    || errorResult(conversationsResult, 'Conversation activity', { page: 'conversations', label: 'Open Conversations' });
  if (failed) return failed;
  const employees = items(employeesResult);
  const conversations = items(conversationsResult);
  const active = employees.filter((employee) => String(employee.status || '').toLowerCase() === 'active');
  const employee = employees.find((item) => item.isDefault || item.default || item.isDefaultEmployee) || active[0];
  return {
    state: employees.length ? 'connected' : 'empty',
    body: `${metric('Configured AI employees', employees.length)}${metric('Conversation records', conversations.length)}<p class="form-hint">${employee?.name ? `${escapeHtml(employee.name)} is configured. ` : ''}Sarah Sales can request, confirm, move, and cancel diary bookings. She must not invent fees, medical-aid benefits, or a treating dentist.</p>`,
    action: { page: 'agents', label: 'Open AI Employees' },
  };
}

function knowledge(result) {
  const failed = errorResult(result, 'Knowledge documents', { page: 'knowledge', label: 'Open Knowledge Base' });
  if (failed) return failed;
  const documents = items(result);
  const active = documents.filter((document) => String(document.status || '').toLowerCase() === 'active').length;
  return {
    state: documents.length ? 'pending' : 'empty',
    body: `${metric('Knowledge documents', documents.length)}${metric('Active documents', active)}<p class="form-hint" role="status">Retrieval verification is pending. Active documents do not prove Sarah can retrieve them.</p>`,
    action: { page: 'knowledge', label: 'Open Knowledge Base' },
  };
}

function recordCount(result, label, page, actionLabel, hint) {
  const failed = errorResult(result, label, { page, label: actionLabel });
  if (failed) return failed;
  const records = items(result);
  return {
    state: records.length ? 'connected' : 'empty',
    body: `${metric(label, records.length)}<p class="form-hint">${hint}</p>`,
    action: { page, label: actionLabel },
  };
}

function integrations(result) {
  const failed = errorResult(result, 'Integration status', { page: 'integrations', label: 'Open Integrations' });
  if (failed) return failed;
  const records = items(result);
  if (!records.length) return { ...unavailable('No connected integration records are available for this workspace.'), action: { page: 'integrations', label: 'Open Integrations' } };
  const connected = records.filter((record) => ['connected', 'active', 'healthy'].includes(String(record.status || '').toLowerCase())).length;
  return {
    state: 'connected',
    body: `${metric('Reported integrations', records.length)}${metric('Connected', connected)}<p class="form-hint">Connection state is reported by the existing integration service.</p>`,
    action: { page: 'integrations', label: 'Open Integrations' },
  };
}

export async function renderDentalCommandCentre(container) {
  const companyId = state.companyId;
  if (!isSmilemoreDentalCommandCentreTenant(companyId)) {
    container.innerHTML = errorState('Command Center is not available for this workspace.');
    return;
  }

  const generation = ++renderGeneration;
  const companyName = state.company?.name || 'SmileMore Dentists';
  const userName = state.profile?.fullName || state.profile?.name || state.user?.email?.split('@')[0] || 'there';
  container.innerHTML = renderLoadingSkeleton({ label: 'Loading Command Center…', cards: 7, rows: 2 });
  const settled = await Promise.allSettled([
    fetchAppointments(companyId, { upcoming: false }),
    fetchCrmCustomers(companyId),
    fetchCrmLeads(companyId),
    fetchAiEmployees(companyId),
    fetchTenantConversations(companyId),
    fetchKnowledgeDocuments(companyId),
    fetchIntegrationsHealth(companyId),
    fetchDentalPatients(companyId),
    fetchDentalClaims(companyId),
    fetchDentalSales(companyId),
  ]);
  const results = settled.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : { error: 'The connected service could not be reached.' }
  );
  if (generation !== renderGeneration || !isSmilemoreDentalCommandCentreTenant(state.companyId)) return;

  const [appointmentResult, customerResult, leadResult, employeeResult, conversationResult, knowledgeResult, integrationResult, patientResult, claimResult, saleResult] = results;
  const location = {
    state: 'connected',
    body: `${SMILEMORE_LOCATIONS.map((item) => `<p class="form-hint">${escapeHtml(item.label)}</p>`).join('')}<p class="form-hint">${escapeHtml(SMILEMORE_HOURS)}</p><p class="form-hint">Public names: ${escapeHtml(SMILEMORE_PUBLIC_TEAM.join(', '))}.</p><p class="form-hint">These are the published practice facts used by the diary. Chair counts and dentist rotas are not connected. A named preference is not a confirmed clinician.</p>`,
  };
  const safety = unavailable('No authorised safety or escalation source is connected. No incidents have been inferred.');
  const appt = appointments(appointmentResult);
  const patients = items(patientResult);
  const claims = items(claimResult);
  const sales = items(saleResult);
  const posSummary = summarizeDentalPosRevenue(sales);
  const today = practiceWall(new Date()).slice(0, 10);
  const apptRecords = items(appointmentResult);
  const todayBookings = apptRecords.filter((record) => activeBooking(record.status) && practiceWall(record.scheduledAt).slice(0, 10) === today).length;
  const conversations = items(conversationResult);
  const kpiPrimary = [
    renderKpiCard({ label: 'Diary today', value: formatNumber(todayBookings), icon: 'fa-calendar-day', color: 'blue', dataNav: 'appointments', live: todayBookings > 0 }),
    renderKpiCard({ label: 'Client files', value: formatNumber(patients.length), icon: 'fa-folder-open', color: 'purple', dataNav: 'dentalPatients', live: patients.length > 0 }),
    renderKpiCard({ label: 'Medical-aid worksheets', value: formatNumber(claims.length), icon: 'fa-file-medical', color: 'yellow', dataNav: 'dentalMedicalAid', live: claims.length > 0 }),
    renderKpiCard({ label: 'Till receipts', value: formatNumber(posSummary.receiptCount), icon: 'fa-cash-register', color: 'green', dataNav: 'dentalPos', live: posSummary.receiptCount > 0 }),
  ].join('');
  const kpiSecondary = [
    renderKpiCard({ label: 'Recorded revenue', value: `R ${posSummary.recordedAll.toLocaleString('en-ZA')}`, icon: 'fa-coins', color: 'yellow', dataNav: 'finance', live: posSummary.recordedAll > 0 }),
    renderKpiCard({ label: 'Collected (cash/card)', value: `R ${posSummary.collectedAll.toLocaleString('en-ZA')}`, icon: 'fa-wallet', color: 'green', dataNav: 'finance', live: posSummary.collectedAll > 0 }),
    renderKpiCard({ label: 'Sarah conversations', value: formatNumber(conversations.length), icon: 'fa-inbox', color: 'purple', dataNav: 'conversations', live: conversations.length > 0 }),
    renderKpiCard({ label: 'CRM contacts', value: formatNumber(items(customerResult).length), icon: 'fa-users', color: 'blue', dataNav: 'customers', live: items(customerResult).length > 0 }),
  ].join('');
  container.innerHTML = `
    <div class="bos-overview-page dental-command-centre">
    <header class="bos-overview-hero dashboard-header portal-header bos-overview-header">
      <div class="dashboard-header-left bos-overview-hero-copy">
        <p class="bos-overview-eyebrow"><i class="fa-solid fa-tooth"></i> Command Center</p>
        <h1>${escapeHtml(companyName)}</h1>
        <div class="bos-overview-meta welcome-text">
          <span class="bos-overview-greeting">Practice ops for <strong>${escapeHtml(userName)}</strong></span>
          <span class="bos-company-chip"><i class="fa-solid fa-building"></i> ${escapeHtml(companyName)}</span>
          <span class="ops-tag">Booking diary · till · client file</span>
        </div>
      </div>
    </header>
    ${smilemorePracticeRibbon()}
    <div class="portal-limit-banner dental-command-note" role="status"><i class="fa-solid fa-circle-info"></i><span>WhatsApp, the diary, the client file, the till, and medical-aid worksheets share one phone number. Knowledge retrieval is not marked ready.</span></div>
    <section class="bos-overview-section" aria-labelledby="dental-command-metrics-title">
      <div class="bos-section-head">
        <h2 id="dental-command-metrics-title" class="bos-section-title">Practice snapshot</h2>
        <p class="bos-section-sub">Live counts from connected SmileMore modules</p>
      </div>
      <div class="kpi-grid kpi-grid-ops bos-live-grid bos-metrics-primary">${kpiPrimary}</div>
      <div class="kpi-grid kpi-grid-ops bos-live-grid bos-metrics-secondary">${kpiSecondary}</div>
    </section>
    <section class="bos-overview-section" aria-label="Operational modules">
      <div class="bos-section-head">
        <h2 class="bos-section-title">Modules</h2>
        <p class="bos-section-sub">Open a module or review its connection status</p>
      </div>
      <div class="dental-command-grid">
      ${section({ icon: 'fa-calendar-check', title: 'Appointments and bookings', ...appt })}
      ${section({ icon: 'fa-users', title: 'Patients and enquiries', ...crm(customerResult, leadResult) })}
      ${section({ icon: 'fa-folder-open', title: 'Client database', ...recordCount(patientResult, 'Client files', 'dentalPatients', 'Open client database', 'Each file is the phone used by WhatsApp, the diary, the till, and CRM.') })}
      ${section({ icon: 'fa-file-medical', title: 'Medical aid worksheets', ...recordCount(claimResult, 'Worksheets', 'dentalMedicalAid', 'Open medical aid', 'A worksheet is stored here. It is not a submitted or paid claim.') })}
      ${section({ icon: 'fa-headset', title: 'Sarah AI Reception', ...reception(employeeResult, conversationResult) })}
      ${section({ icon: 'fa-book-medical', title: 'Knowledge quality', ...knowledge(knowledgeResult) })}
      ${section({ icon: 'fa-plug-circle-check', title: 'Integration status', ...integrations(integrationResult) })}
      ${section({ icon: 'fa-cash-register', title: 'Point of Sale', ...recordCount(saleResult, 'Receipts on record', 'dentalPos', 'Open the till', 'A receipt is a payment already taken. It does not submit a medical-aid claim, and Sarah does not quote the till price list.') })}
      ${section({ icon: 'fa-location-dot', title: 'Practice locations and team', ...location })}
      ${section({ icon: 'fa-triangle-exclamation', title: 'Safety and escalations', ...safety })}
      </div>
    </section>
    </div>`;
}
