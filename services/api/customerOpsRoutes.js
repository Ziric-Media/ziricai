/**
 * Phase 3–6 tenant-scoped Customer Operations API routes.
 * CRM, Conversations, Appointments, Notifications, Reports.
 */
import { requireTenantScope } from "../core/tenantContext.js";
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
import {
    listTenantConversations,
    getTenantConversation,
    sendConversationReply,
    setHumanTakeover,
} from "../tenants/conversationService.js";
import {
    listAppointments,
    listUpcomingAppointments,
    createAppointment,
    updateAppointment,
    cancelAppointment,
} from "../tenants/appointmentService.js";
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

const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];

/**
 * @param {import('express').Express} app
 */
export function mountCustomerOpsRoutes(app) {
    /* ── CRM ── */
    app.get("/api/companies/:companyId/crm/customers", requireTenantScope(), async (req, res) => {
        try {
            const items = await listTenantCustomers(req.params.companyId, {
                limit: parseInt(req.query.limit || "100", 10),
            });
            res.json({ items, companyId: req.params.companyId });
        } catch (err) {
            console.error("[crm/customers] error:", err.message);
            res.status(500).json({ error: err.message || "Failed to list customers" });
        }
    });

    app.get("/api/companies/:companyId/crm/contacts", requireTenantScope(), async (req, res) => {
        try {
            const items = await listContacts(req.params.companyId);
            res.json({ items, companyId: req.params.companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list contacts" });
        }
    });

    app.post("/api/companies/:companyId/crm/contacts", requireTenantScope(), async (req, res) => {
        try {
            const contact = await createContact(req.params.companyId, req.body || {});
            res.status(201).json({ contact });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create contact" });
        }
    });

    app.get("/api/companies/:companyId/crm/leads", requireTenantScope(), async (req, res) => {
        try {
            const items = await listLeads(req.params.companyId);
            res.json({ items, companyId: req.params.companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list leads" });
        }
    });

    app.post("/api/companies/:companyId/crm/leads", requireTenantScope(), async (req, res) => {
        try {
            const companyId = req.params.companyId;
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
            const [leads, customers] = await Promise.all([
                listLeads(req.params.companyId),
                listTenantCustomers(req.params.companyId),
            ]);
            const stages = PIPELINE_STAGES.map((stage) => ({
                stage,
                count: leads.filter((l) => (l.stage || "new") === stage).length,
                items: leads.filter((l) => (l.stage || "new") === stage).slice(0, 20),
            }));
            res.json({
                companyId: req.params.companyId,
                stages,
                totals: { leads: leads.length, customers: customers.length },
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load pipeline" });
        }
    });

    app.get("/api/companies/:companyId/crm/tasks", requireTenantScope(), async (req, res) => {
        try {
            const items = await listTasks(req.params.companyId);
            res.json({ items, companyId: req.params.companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list tasks" });
        }
    });

    app.post("/api/companies/:companyId/crm/tasks", requireTenantScope(), async (req, res) => {
        try {
            const task = await createTask(req.params.companyId, req.body || {});
            res.status(201).json({ task });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create task" });
        }
    });

    app.get("/api/companies/:companyId/crm/customers/:customerId/timeline", requireTenantScope(), async (req, res) => {
        try {
            const phone = normalizePhone(req.params.customerId);
            const items = await getTimeline(phone);
            res.json({ items, customerId: req.params.customerId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load timeline" });
        }
    });

    app.get("/api/companies/:companyId/crm/customers/:customerId", requireTenantScope(), async (req, res) => {
        try {
            const phone = normalizePhone(req.params.customerId);
            const profile = await getCustomerProfile(phone);
            if (!profile) return res.status(404).json({ error: "Customer not found" });
            await syncCustomerToTenant(req.params.companyId, phone, profile);
            res.json({ customer: profile });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load customer" });
        }
    });

    app.patch("/api/companies/:companyId/crm/customers/:customerId", requireTenantScope(), async (req, res) => {
        try {
            const phone = normalizePhone(req.params.customerId);
            const body = req.body || {};
            if (body.note?.text) {
                const note = await addNote(phone, body.note);
                return res.json({ success: true, note, customer: await getCustomerProfile(phone) });
            }
            if (body.task?.title) {
                const task = await addTask(phone, body.task);
                return res.json({ success: true, task, customer: await getCustomerProfile(phone) });
            }
            const patch = {};
            if (body.tags) patch.tags = body.tags;
            if (body.status) patch.status = body.status;
            if (body.aiSummary != null) patch.aiSummary = body.aiSummary;
            if (Object.keys(patch).length) await updateCustomer(phone, patch);
            res.json({ success: true, customer: await getCustomerProfile(phone) });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to update customer" });
        }
    });

    /* ── Conversations (unified inbox) ── */
    app.get("/api/companies/:companyId/conversations", requireTenantScope(), async (req, res) => {
        try {
            const items = await listTenantConversations(req.params.companyId, {
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
            const detail = await getTenantConversation(req.params.companyId, req.params.conversationId);
            if (!detail) return res.status(404).json({ error: "Conversation not found" });
            res.json(detail);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load conversation" });
        }
    });

    app.post("/api/companies/:companyId/conversations/:conversationId/reply", requireTenantScope(), async (req, res) => {
        try {
            const { text, channel } = req.body || {};
            if (!text?.trim()) return res.status(400).json({ error: "text is required" });
            const result = await sendConversationReply(req.params.companyId, req.params.conversationId, {
                text,
                channel,
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to send reply" });
        }
    });

    app.post("/api/companies/:companyId/conversations/:conversationId/takeover", requireTenantScope(), async (req, res) => {
        try {
            const { humanAgent, enabled = true } = req.body || {};
            const result = await setHumanTakeover(req.params.companyId, req.params.conversationId, {
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
            const upcoming = req.query.upcoming === "true";
            const items = upcoming
                ? await listUpcomingAppointments(req.params.companyId)
                : await listAppointments(req.params.companyId);
            res.json({ items, companyId: req.params.companyId });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list appointments" });
        }
    });

    app.post("/api/companies/:companyId/appointments", requireTenantScope(), async (req, res) => {
        try {
            const appointment = await createAppointment(req.params.companyId, req.body || {});
            await publish(req.params.companyId, EventTypes.APPOINTMENT_BOOKED, {
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
            const appointment = await updateAppointment(
                req.params.companyId,
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
            const appointment = await cancelAppointment(req.params.companyId, req.params.appointmentId);
            res.json({ appointment, cancelled: true });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to cancel appointment" });
        }
    });

    /* ── Notifications ── */
    app.get("/api/companies/:companyId/notifications", requireTenantScope(), async (req, res) => {
        try {
            const unreadOnly = req.query.unread === "true";
            const items = unreadOnly
                ? await listUnreadNotifications(req.params.companyId)
                : await listTenantNotifications(req.params.companyId);
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
            const notification = await createNotification(req.params.companyId, req.body || {});
            res.status(201).json({ notification });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to create notification" });
        }
    });

    app.patch("/api/companies/:companyId/notifications/:notificationId/read", requireTenantScope(), async (req, res) => {
        try {
            const notification = await markNotificationRead(req.params.companyId, req.params.notificationId);
            res.json({ notification });
        } catch (err) {
            res.status(400).json({ error: err.message || "Failed to mark notification read" });
        }
    });

    app.post("/api/companies/:companyId/notifications/mark-all-read", requireTenantScope(), async (req, res) => {
        try {
            const count = await markAllNotificationsRead(req.params.companyId);
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
            const today = new Date().toISOString().slice(0, 10);
            const [customers, conversations, appointments, runs, workflows] = await Promise.all([
                listTenantCustomers(companyId, { limit: 500 }),
                listTenantConversations(companyId, { limit: 100 }),
                listUpcomingAppointments(companyId),
                listAutomationRuns(companyId, { limit: 20 }),
                listWorkflows(companyId),
            ]);
            const appointmentsToday = appointments.filter(
                (a) => a.scheduledAt?.slice(0, 10) === today && a.status === "scheduled"
            );
            res.json({
                companyId,
                crm: { customers: customers.length, leads: customers.filter((c) => (c.leadScore ?? 0) >= 50).length },
                inbox: { total: conversations.length, unread: conversations.filter((c) => c.unread).length },
                appointments: { today: appointmentsToday.length, upcoming: appointments.length },
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
}
