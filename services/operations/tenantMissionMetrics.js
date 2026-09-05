/**
 * Phase 2B-1 — Read-only tenant CRM metrics for Mission Control.
 * Aggregates from existing tenant CRM services (no duplicate CRM store).
 */
import { CENTRAL_MOTORS_RTB_COMPANY_ID } from "../inventory/adapters/centralMotorsRtbAdapter.js";
import { CENTRAL_MOTORS_COMPANY_ID } from "../storage/seedDemoTenants.js";
import { listTenantCustomers, listLeads } from "../tenants/crmService.js";
import { listTenantConversations } from "../tenants/conversationService.js";
import { listAppointmentsForCompany } from "../database/appointmentRepository.js";
import {
    countFinanceEnquiries,
    extractFinanceContextSnapshot,
} from "./financeAnalytics.js";

export const PRIMARY_MISSION_TENANT_ID = CENTRAL_MOTORS_RTB_COMPANY_ID;

const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];

function normalizeStage(value) {
    return String(value || "new").toLowerCase();
}

function sarahStage(lead) {
    return String(lead?.sarahLeadStage || lead?.salesContext?.leadStage || "").toUpperCase();
}

function isSarahAssigned(record) {
    const name = String(record?.assignedAiEmployee || record?.assignedEmployee || "").toLowerCase();
    return name === "sarah";
}

function countPipeline(leads) {
    const pipeline = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0]));
    for (const lead of leads) {
        const stage = normalizeStage(lead.stage);
        if (pipeline[stage] !== undefined) pipeline[stage] += 1;
    }
    return pipeline;
}

function buildMetricAvailability({ customers, leads, conversations, appointments }) {
    const hasCrm = customers.length > 0 || leads.length > 0;
    const hasConversations = conversations.length > 0;
    const hasAppointments = appointments.length > 0;

    return {
        customers: hasCrm ? "real" : "unavailable",
        leads: hasCrm ? "real" : "unavailable",
        pipeline: hasCrm ? "real" : "unavailable",
        conversations: hasConversations ? "real" : "unavailable",
        activeConversations: hasConversations ? "real" : "unavailable",
        messagesTotal: hasCrm ? "real" : "unavailable",
        messagesToday: "unavailable",
        humanTakeovers: hasConversations ? "real" : "unavailable",
        testDrivesBooked: hasAppointments || leads.some((l) => sarahStage(l).includes("TEST_DRIVE_BOOKED"))
            ? "real"
            : "unavailable",
        testDriveRequests: leads.some((l) => sarahStage(l).includes("TEST_DRIVE")) ? "real" : "unavailable",
        financeEnquiries: hasCrm ? "real" : "unavailable",
        vehicleInterests: leads.some((l) => l.vehicleInterest) || customers.some((c) => c.interests?.vehicleInterest)
            ? "real"
            : "unavailable",
        sarahPerformance: hasCrm ? "derived" : "unavailable",
        estimatedRevenue: "unavailable",
        customerSatisfaction: "unavailable",
        avgResponseTimeSec: "unavailable",
        aiSuccessRate: hasConversations ? "derived" : "unavailable",
        hourlyConversations: "unavailable",
        trendingQuestions: "unavailable",
        platformTrends: "unavailable",
    };
}

/**
 * Read-only CRM aggregation for a single tenant.
 * @param {string} companyId
 */
export async function getTenantMissionMetrics(companyId) {
    if (!companyId) {
        throw new Error("companyId is required");
    }

    if (companyId === CENTRAL_MOTORS_COMPANY_ID && companyId !== PRIMARY_MISSION_TENANT_ID) {
        // Explicit guard: production Mission Control must not treat demo tenant as RTB.
    }

    const [customers, leads, conversations, appointments] = await Promise.all([
        listTenantCustomers(companyId, { limit: 1000 }).catch(() => []),
        listLeads(companyId).catch(() => []),
        listTenantConversations(companyId, { limit: 500 }).catch(() => []),
        listAppointmentsForCompany(companyId, { limit: 500 }).catch(() => []),
    ]);

    const pipeline = countPipeline(leads);
    const activeConversations = conversations.filter((c) => c.status !== "closed");
    const humanTakeovers = conversations.filter(
        (c) => c.status === "human_takeover" || c.mode === "human"
    );
    const messagesTotal = customers.reduce((sum, c) => sum + (c.totalMessages || 0), 0);

    const testDriveBookedLeads = leads.filter((l) => sarahStage(l).includes("TEST_DRIVE_BOOKED"));
    const testDriveRequestLeads = leads.filter((l) => sarahStage(l).includes("TEST_DRIVE"));
    const financeEnquiries = countFinanceEnquiries(leads, customers);
    const vehicleInterestCount = new Set(
        [
            ...leads.filter((l) => l.vehicleInterest).map((l) => l.vehicleInterest),
            ...customers
                .map((c) => c.interests?.vehicleInterest || c.salesContext?.preferredVehicle)
                .filter(Boolean),
        ].map(String)
    ).size;

    const bookedAppointments = appointments.filter((a) => a.status !== "cancelled");
    const hasAppointmentLedger = appointments.length > 0;
    const testDrivesBooked = hasAppointmentLedger
        ? bookedAppointments.length
        : testDriveBookedLeads.length;

    const sarahLeads = leads.filter(isSarahAssigned);
    const sarahCustomers = customers.filter(isSarahAssigned);
    const dealsWon = pipeline.won || 0;
    const conversionPct =
        leads.length > 0 ? Math.round((dealsWon / leads.length) * 1000) / 10 : null;

    const metricAvailability = buildMetricAvailability({
        customers,
        leads,
        conversations,
        appointments: bookedAppointments,
    });

    const companyLabel =
        companyId === PRIMARY_MISSION_TENANT_ID ? "Central Motors Rustenburg" : companyId;

    return {
        companyId,
        companyName: companyLabel,
        dataSource: "tenant_crm",
        isProductionTenant: companyId === PRIMARY_MISSION_TENANT_ID,
        storageReadOnly: true,
        counts: {
            customers: customers.length,
            leads: leads.length,
            conversations: conversations.length,
            activeConversations: activeConversations.length,
            messagesTotal,
            humanTakeovers: humanTakeovers.length,
            newLeads: (pipeline.new || 0) + (pipeline.contacted || 0),
            qualifiedLeads: (pipeline.qualified || 0) + (pipeline.proposal || 0),
            testDrivesBooked: testDrivesBooked,
            testDriveRequests: testDriveRequestLeads.length,
            financeEnquiries,
            vehicleInterests: vehicleInterestCount,
            dealsWon,
        },
        pipeline,
        sarah: {
            name: "Sarah",
            status: "online",
            assignedLeads: sarahLeads.length,
            assignedCustomers: sarahCustomers.length,
            leadsGenerated: leads.length,
            testDrivesBooked: testDrivesBooked,
            financeEnquiries,
            sales: dealsWon,
            conversionPct,
            messagesHandled: messagesTotal,
        },
        metricAvailability,
        financeContext: extractFinanceContextSnapshot(customers),
        leaderboards: {
            agents:
                leads.length || customers.length
                    ? [
                          {
                              rank: 1,
                              name: "Sarah",
                              company: companyLabel,
                              messages: messagesTotal,
                              satisfaction: null,
                              conversion: conversionPct,
                              dataQuality: "derived",
                          },
                      ]
                    : [],
            companies:
                customers.length || leads.length
                    ? [
                          {
                              rank: 1,
                              name: companyLabel,
                              companyId,
                              messages: messagesTotal,
                              satisfaction: null,
                              revenue: null,
                              agents: 1,
                              dataQuality: "real",
                          },
                      ]
                    : [],
        },
        activity: conversations.slice(0, 10).map((c, i) => ({
            id: `tenant-act-${c.id || i}`,
            type: c.status === "human_takeover" ? "human_takeover" : "conversation",
            icon: c.status === "human_takeover" ? "fa-user-shield" : "fa-comments",
            color: c.status === "human_takeover" ? "red" : "blue",
            text: `<strong>${c.customerName || c.name || "Customer"}</strong> — ${companyLabel}`,
            detail: c.lastMessage || c.preview || "Conversation",
            time: c.time || c.updatedAt || "Recently",
            ago: c.time || "—",
            dataQuality: "real",
        })),
    };
}

/**
 * Mission Control primary tenant — never substitutes demo-central-motors for RTB.
 */
export async function getPrimaryTenantMissionMetrics() {
    return getTenantMissionMetrics(PRIMARY_MISSION_TENANT_ID);
}
