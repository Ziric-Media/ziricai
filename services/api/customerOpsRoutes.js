/**
 * Phase 3–6 tenant-scoped Customer Operations API routes.
 * CRM, Conversations, Appointments, Notifications, Reports.
 */
import { requireTenantScope, requireAuthenticatedTenantMember } from "../core/tenantContext.js";
import {
    listTenantCustomers,
    listContacts,
    listLeads,
    createContact,
    createLead,
    getCustomerProfile,
    updateCustomer,
    addNote,
    addTask,
    getTimeline,
    normalizePhone,
    syncCustomerToTenant,
} from "../tenants/crmService.js";
import { updateTask, deleteNote } from "../customerService.js";
import {
    listTenantConversations,
    getTenantConversation,
    sendConversationReply,
    setHumanTakeover,
    markConversationRead,
} from "../tenants/conversationService.js";
import { resolveStaffSenderName } from "../conversation/inboxStaffIdentity.js";
import { resolvePilotDataCompanyId } from "../storage/centralMotorsPilot.js";
import {
    listAppointments,
    listUpcomingAppointments,
    createAppointment,
    updateAppointment,
    cancelAppointment,
} from "../tenants/appointmentService.js";

/** Portal showcase tenant → live WhatsApp/CRM data tenant when pilot mode is on. */
function dataCompanyId(req) {
    return resolvePilotDataCompanyId(req.params.companyId);
}
import {
    listTenantNotifications,
    listUnreadNotifications,
    createNotification,
    markNotificationRead,
    markAllNotificationsRead,
} from "../tenants/notificationService.js";
import { listTasks, createTask } from "../tenants/taskService.js";
import { listWorkflows, upsertWorkflow } from "../automation/workflowRegistry.js";
import { listAutomationRuns } from "../automation/automationEngine.js";
import { generateReport } from "../reporting/reportService.js";
import { publish, EventTypes } from "../events/index.js";
import { mountSupportCaseRoutes } from "./supportCaseRoutes.js";

const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];

/**
 * @param {import('express').Express} app
 */
export function mountCustomerOpsRoutes(app) {
    /* ── CRM ── */
    app.get("/api/companies/:companyId/crm/customers", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const items = await listTenantCustomers(companyId, {
                limit: parseInt(req.query.limit || "100", 10),
            });
            res.json({ items, companyId: req.params.companyId, dataCompanyId: companyId });
        } catch (err) {
            console.error("[crm/customers] error:", err.message);
            res.status(500).json({ error: err.message || "Failed to list customers" });
        }
    });

    app.get("/api/companies/:companyId/crm/contacts", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const items = await listContacts(companyId);
            res.json({ items, companyId: req.params.companyId, dataCompanyId: companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list contacts" });
        }
    });

    app.post("/api/companies/:companyId/crm/contacts", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const contact = await createContact(companyId, req.body || {});
            res.status(201).json({ contact });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create contact" });
        }
    });

    app.get("/api/companies/:companyId/crm/leads", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const items = await listLeads(companyId);
            res.json({ items, companyId: req.params.companyId, dataCompanyId: companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list leads" });
        }
    });

    app.post("/api/companies/:companyId/crm/leads", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const lead = await createLead(companyId, {
                stage: "new",
                leadScore: 50,
                ...req.body,
            });
            await publish(companyId, EventTypes.LEAD_CAPTURED, {
                leadId: lead.id,
                phone: lead.phone,
                contactName: lead.name,
                leadScore: lead.leadScore,
                source: lead.source || "portal",
            });
            res.status(201).json({ lead });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create lead" });
        }
    });

    app.get("/api/companies/:companyId/crm/pipeline", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const [leads, customers] = await Promise.all([
                listLeads(companyId),
                listTenantCustomers(companyId),
            ]);
            const stages = PIPELINE_STAGES.map((stage) => ({
                stage,
                count: leads.filter((l) => (l.stage || "new") === stage).length,
                items: leads.filter((l) => (l.stage || "new") === stage).slice(0, 20),
            }));
            res.json({
                companyId: req.params.companyId,
                dataCompanyId: companyId,
                stages,
                totals: { leads: leads.length, customers: customers.length },
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load pipeline" });
        }
    });

    app.get("/api/companies/:companyId/crm/tasks", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const items = await listTasks(companyId);
            res.json({ items, companyId: req.params.companyId, dataCompanyId: companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list tasks" });
        }
    });

    app.post("/api/companies/:companyId/crm/tasks", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const task = await createTask(companyId, req.body || {});
            res.status(201).json({ task });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create task" });
        }
    });

    app.get("/api/companies/:companyId/crm/customers/:customerId/timeline", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const phone = normalizePhone(req.params.customerId);
            const items = await getTimeline(phone, { companyId });
            res.json({ items, customerId: req.params.customerId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load timeline" });
        }
    });

    app.get("/api/companies/:companyId/crm/customers/:customerId", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const phone = normalizePhone(req.params.customerId);
            const profile = await getCustomerProfile(phone, { companyId });
            if (!profile) return res.status(404).json({ error: "Customer not found" });
            await syncCustomerToTenant(companyId, phone, profile);
            res.json({ customer: profile });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load customer" });
        }
    });

    app.patch("/api/companies/:companyId/crm/customers/:customerId", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const phone = normalizePhone(req.params.customerId);
            const body = req.body || {};
            if (body.note?.text) {
                const note = await addNote(phone, body.note, { companyId });
                return res.json({
                    success: true,
                    note,
                    customer: await getCustomerProfile(phone, { companyId }),
                });
            }
            if (body.task?.title) {
                const task = await addTask(phone, body.task, { companyId });
                return res.json({
                    success: true,
                    task,
                    customer: await getCustomerProfile(phone, { companyId }),
                });
            }
            if (body.deleteNoteId) {
                await deleteNote(phone, body.deleteNoteId, { companyId });
                return res.json({
                    success: true,
                    customer: await getCustomerProfile(phone, { companyId }),
                });
            }
            if (body.updateTask?.id) {
                const task = await updateTask(phone, body.updateTask.id, body.updateTask, { companyId });
                return res.json({
                    success: true,
                    task,
                    customer: await getCustomerProfile(phone, { companyId }),
                });
            }
            const patch = {};
            if (body.tags) patch.tags = body.tags;
            if (body.status) patch.status = body.status;
            if (body.aiSummary != null) patch.aiSummary = body.aiSummary;
            if (Object.keys(patch).length) await updateCustomer(phone, patch);
            res.json({ success: true, customer: await getCustomerProfile(phone, { companyId }) });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to update customer" });
        }
    });

    /* ── Conversations (unified inbox) ── */
    app.get("/api/companies/:companyId/conversations", requireTenantScope(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const items = await listTenantConversations(dataCompanyId, {
                limit: parseInt(req.query.limit || "50", 10),
            });
            const unreadCount = items.filter((c) => c.unread).length;
            res.json({ items, unreadCount, companyId: req.params.companyId });
        } catch (err) {
            console.error("[conversations] error:", err.message);
            res.status(500).json({ error: err.message || "Failed to list conversations" });
        }
    });

    app.get("/api/companies/:companyId/conversations/:conversationId", requireTenantScope(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const detail = await getTenantConversation(dataCompanyId, req.params.conversationId);
            if (!detail) return res.status(404).json({ error: "Conversation not found" });
            res.json(detail);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load conversation" });
        }
    });

    app.post("/api/companies/:companyId/conversations/:conversationId/reply", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const { text, channel } = req.body || {};
            if (!text?.trim()) return res.status(400).json({ error: "text is required" });
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const result = await sendConversationReply(dataCompanyId, req.params.conversationId, {
                text,
                channel,
                senderName: resolveStaffSenderName(req.tenant),
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to send reply" });
        }
    });

    app.post("/api/companies/:companyId/conversations/:conversationId/read", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const result = await markConversationRead(dataCompanyId, req.params.conversationId);
            res.json(result);
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Failed to mark conversation read" });
        }
    });

    app.post("/api/companies/:companyId/conversations/:conversationId/takeover", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const { humanAgent, enabled = true } = req.body || {};
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const result = await setHumanTakeover(dataCompanyId, req.params.conversationId, {
                enabled,
                humanAgent: humanAgent || "Staff",
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to set takeover" });
        }
    });

    /* ── Appointments ── */
    app.get("/api/companies/:companyId/appointments", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const upcoming = req.query.upcoming === "true";
            const items = upcoming
                ? await listUpcomingAppointments(companyId)
                : await listAppointments(companyId);
            res.json({ items, companyId: req.params.companyId, dataCompanyId: companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list appointments" });
        }
    });

    app.post("/api/companies/:companyId/appointments", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const appointment = await createAppointment(companyId, req.body || {});
            await publish(companyId, EventTypes.APPOINTMENT_BOOKED, {
                appointmentId: appointment.id,
                customerName: appointment.customerName,
                scheduledAt: appointment.scheduledAt,
                service: appointment.service,
            });
            res.status(201).json({ appointment });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create appointment" });
        }
    });

    app.patch("/api/companies/:companyId/appointments/:appointmentId", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const appointment = await updateAppointment(
                companyId,
                req.params.appointmentId,
                req.body || {}
            );
            res.json({ appointment });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to update appointment" });
        }
    });

    app.post("/api/companies/:companyId/appointments/:appointmentId/cancel", requireTenantScope(), async (req, res) => {
        try {
            const companyId = dataCompanyId(req);
            const appointment = await cancelAppointment(companyId, req.params.appointmentId);
            res.json({ appointment, cancelled: true });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to cancel appointment" });
        }
    });

    /* ── Notifications ── */
    app.get("/api/companies/:companyId/notifications", requireTenantScope(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const unreadOnly = req.query.unread === "true";
            const items = unreadOnly
                ? await listUnreadNotifications(dataCompanyId)
                : await listTenantNotifications(dataCompanyId);
            res.json({
                items,
                unreadCount: items.filter((n) => !n.read).length,
                companyId: req.params.companyId,
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list notifications" });
        }
    });

    app.post("/api/companies/:companyId/notifications", requireTenantScope(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const notification = await createNotification(dataCompanyId, req.body || {});
            res.status(201).json({ notification });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create notification" });
        }
    });

    app.patch("/api/companies/:companyId/notifications/:notificationId/read", requireTenantScope(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const notification = await markNotificationRead(dataCompanyId, req.params.notificationId);
            res.json({ notification });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to mark notification read" });
        }
    });

    app.post("/api/companies/:companyId/notifications/mark-all-read", requireTenantScope(), async (req, res) => {
        try {
            const dataCompanyId = resolvePilotDataCompanyId(req.params.companyId);
            const count = await markAllNotificationsRead(dataCompanyId);
            res.json({ success: true, marked: count });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to mark all read" });
        }
    });

    /* ── Reports ── */
    app.get("/api/companies/:companyId/reports/weekly", requireTenantScope(), async (req, res) => {
        try {
            const format = req.query.format || "json";
            const report = await generateReport(req.params.companyId, "weekly", format);
            if (format === "html") {
                res.setHeader("Content-Type", "text/html");
                return res.send(report.html);
            }
            res.json(report);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to generate report" });
        }
    });

    app.get("/api/companies/:companyId/reports/:reportType", requireTenantScope(), async (req, res) => {
        try {
            const format = req.query.format || "json";
            const report = await generateReport(req.params.companyId, req.params.reportType, format);
            if (format === "html") {
                res.setHeader("Content-Type", "text/html");
                return res.send(report.html);
            }
            if (format === "csv") {
                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", `attachment; filename="${req.params.reportType}-report.csv"`);
                return res.send(report.csv);
            }
            res.json(report);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to generate report" });
        }
    });

    /* ── Ops summary (hub helper) ── */
    app.get("/api/companies/:companyId/ops/summary", requireTenantScope(), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const dataCompanyId = resolvePilotDataCompanyId(companyId);
            const today = new Date().toISOString().slice(0, 10);
            const [customers, conversations, appointments, runs, workflows] = await Promise.all([
                listTenantCustomers(dataCompanyId, { limit: 500 }),
                listTenantConversations(dataCompanyId, { limit: 100 }),
                listAppointments(dataCompanyId),
                listAutomationRuns(dataCompanyId, { limit: 20 }),
                listWorkflows(dataCompanyId),
            ]);
            const nowMs = Date.now();
            const isActive = (a) => {
                const status = String(a.status || "").toLowerCase();
                return status !== "cancelled" && status !== "canceled";
            };
            const active = appointments.filter(isActive);
            const appointmentsToday = active.filter((a) => a.scheduledAt?.slice(0, 10) === today);
            const appointmentsUpcoming = active.filter((a) => {
                const ms = new Date(a.scheduledAt || a.dateTime || 0).getTime();
                return Number.isFinite(ms) && ms >= nowMs;
            });
            res.json({
                companyId,
                crm: { customers: customers.length, leads: customers.filter((c) => (c.leadScore ?? 0) >= 50).length },
                inbox: { total: conversations.length, unread: conversations.filter((c) => c.unread).length },
                appointments: {
                    today: appointmentsToday.length,
                    upcoming: appointmentsUpcoming.length,
                    booked: active.length,
                },
                automation: {
                    active: workflows.filter((w) => w.status === "active").length,
                    recentRuns: runs.length,
                    successRate: runs.length
                        ? Math.round((runs.filter((r) => r.success).length / runs.length) * 100)
                        : 0,
                },
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load ops summary" });
        }
    });

    mountSupportCaseRoutes(app);
}
