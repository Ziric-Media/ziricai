/**
 * Reporting service — weekly/monthly summaries (JSON + HTML + CSV).
 */
import { getDashboardSnapshot } from "../analytics/dashboardService.js";
import { listTenantCustomers, listLeads } from "../tenants/crmService.js";
import { listTenantConversations } from "../tenants/conversationService.js";
import { listUpcomingAppointments } from "../tenants/appointmentService.js";
import { listAutomationRuns } from "../automation/automationEngine.js";

const REPORT_TYPES = ["weekly", "monthly", "conversations", "crm", "usage"];

/**
 * @param {string} companyId
 * @param {string} type
 * @param {string} [format] json | html | csv
 */
export async function generateReport(companyId, type = "weekly", format = "json") {
    const normalizedType = REPORT_TYPES.includes(type) ? type : "weekly";
    const days = normalizedType === "monthly" ? 30 : 7;

    const [dashboard, customers, leads, conversations, appointments, runs] = await Promise.all([
        getDashboardSnapshot(companyId, { days }),
        listTenantCustomers(companyId, { limit: 200 }),
        listLeads(companyId),
        listTenantConversations(companyId, { limit: 100 }),
        listUpcomingAppointments(companyId),
        listAutomationRuns(companyId, { limit: 50 }),
    ]);

    const report = {
        companyId,
        reportType: normalizedType,
        periodDays: days,
        generatedAt: new Date().toISOString(),
        summary: {
            conversations: dashboard.kpis?.conversations ?? dashboard.summary?.conversations7d ?? 0,
            leads: dashboard.kpis?.leads ?? leads.length,
            appointments: dashboard.kpis?.appointments ?? appointments.length,
            revenue: dashboard.kpis?.revenue ?? dashboard.summary?.revenue7d ?? 0,
            conversions: dashboard.kpis?.conversions ?? 0,
            aiAccuracy: dashboard.kpis?.aiAccuracy ?? 85,
            automationSuccessRate: dashboard.kpis?.automationSuccessRate ?? 0,
            customers: customers.length,
        },
        highlights: buildHighlights(dashboard, conversations, appointments, runs),
        channelBreakdown: buildChannelBreakdown(conversations),
        topLeads: leads.slice(0, 5).map((l) => ({
            name: l.name || l.contactName,
            phone: l.phone,
            score: l.leadScore,
            stage: l.stage || "new",
        })),
        dailyRows: dashboard.rows?.slice(-days) || [],
    };

    if (format === "html") {
        return { ...report, html: renderHtmlReport(report) };
    }
    if (format === "csv") {
        return { ...report, csv: renderCsvReport(report) };
    }
    return report;
}

function buildHighlights(dashboard, conversations, appointments, runs) {
    const highlights = [];
    const kpis = dashboard.kpis || {};
    if (kpis.leads > 0) highlights.push(`${kpis.leads} new leads captured`);
    if (kpis.appointments > 0) highlights.push(`${kpis.appointments} appointments booked`);
    if (conversations.length) highlights.push(`${conversations.length} active conversations`);
    if (runs.length) {
        const ok = runs.filter((r) => r.success).length;
        highlights.push(`${ok}/${runs.length} automation runs succeeded`);
    }
    if (appointments.length) highlights.push(`${appointments.length} upcoming appointments scheduled`);
    return highlights.length ? highlights : ["No significant activity in this period."];
}

function buildChannelBreakdown(conversations) {
    const counts = {};
    for (const c of conversations) {
        const ch = c.channel || "whatsapp";
        counts[ch] = (counts[ch] || 0) + 1;
    }
    return Object.entries(counts).map(([channel, count]) => ({ channel, count }));
}

function renderHtmlReport(report) {
    const rows = report.dailyRows
        .map(
            (r) =>
                `<tr><td>${r.date}</td><td>${r.conversations}</td><td>${r.leads}</td><td>${r.appointments}</td><td>${r.revenue}</td></tr>`
        )
        .join("");
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${report.reportType} Report — ${report.companyId}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a2e}
h1{color:#6366f1}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}
th{background:#f8fafc}.kpi{display:inline-block;margin:8px 16px 8px 0;padding:12px 20px;background:#f1f5f9;border-radius:8px}
.kpi strong{display:block;font-size:1.4em;color:#6366f1}</style></head>
<body>
<h1>${report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1)} Report</h1>
<p>Generated ${report.generatedAt} · ${report.periodDays}-day period</p>
<div>
  <div class="kpi"><strong>${report.summary.conversations}</strong>Conversations</div>
  <div class="kpi"><strong>${report.summary.leads}</strong>Leads</div>
  <div class="kpi"><strong>${report.summary.appointments}</strong>Appointments</div>
  <div class="kpi"><strong>${report.summary.revenue}</strong>Revenue</div>
</div>
<h2>Highlights</h2><ul>${report.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
<h2>Daily Breakdown</h2>
<table><thead><tr><th>Date</th><th>Conversations</th><th>Leads</th><th>Appointments</th><th>Revenue</th></tr></thead>
<tbody>${rows || "<tr><td colspan='5'>No data</td></tr>"}</tbody></table>
</body></html>`;
}

function renderCsvReport(report) {
    const header = "date,conversations,leads,appointments,revenue,conversions";
    const rows = (report.dailyRows || [])
        .map((r) => `${r.date},${r.conversations},${r.leads},${r.appointments},${r.revenue},${r.conversions || 0}`)
        .join("\n");
    return `${header}\n${rows}`;
}

export { REPORT_TYPES };
