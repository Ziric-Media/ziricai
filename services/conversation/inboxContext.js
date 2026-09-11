/**
 * Slim server-side inbox context — composes existing tenant services (no duplicate CRM store).
 */
import { getCustomerProfile } from "../customerService.js";
import { getDefaultAiEmployee } from "../tenants/aiEmployeeService.js";
import { listAppointmentsByCustomerPhone } from "../database/appointmentRepository.js";
import { normalizePhone } from "../customerService.js";

const TIMELINE_LIMIT = 5;

function deriveVehicleInterest(customer) {
    if (!customer) return null;
    const sc = customer.salesContext || customer.metadata?.salesContext;
    if (sc?.preferredVehicle) return String(sc.preferredVehicle);
    if (sc?.requestedVehicle) return String(sc.requestedVehicle);
    const interests = customer.interests;
    if (interests && typeof interests === "object") {
        const vehicle = interests.vehicle || interests.vehicles || interests.primary;
        if (vehicle) return String(vehicle);
    }
    return null;
}

function slimCustomer(profile) {
    if (!profile) return null;
    return {
        phone: profile.phone,
        phoneDisplay: profile.phoneDisplay || profile.phone,
        name: profile.displayName || profile.name || profile.phone,
        leadScore: profile.leadScore ?? null,
        tags: (profile.tags || []).slice(0, 10),
        vehicleInterest: deriveVehicleInterest(profile),
        assignedAiEmployee: profile.assignedAiEmployee || null,
    };
}

function slimAiEmployee(employee) {
    if (!employee) return null;
    return {
        id: employee.id || null,
        name: employee.name || null,
        role: employee.role || employee.roleLabel || null,
    };
}

function slimAppointment(row) {
    if (!row) return null;
    return {
        id: row.id || null,
        scheduledAt: row.scheduledAt || row.dateTime || null,
        service: row.service || row.appointmentType || null,
        status: row.status || null,
        vehicleLabel: row.vehicleLabel || row.vehicleName || null,
    };
}

function slimTimeline(entries = []) {
    return entries.slice(0, TIMELINE_LIMIT).map((entry) => ({
        type: entry.type || entry.eventType || "activity",
        summary: entry.summary || entry.text || entry.message || entry.title || "",
        createdAt: entry.createdAt || entry.timestamp || null,
    }));
}

/**
 * @param {string} companyId
 * @param {string} phoneOrConversationId
 */
export async function buildSlimInboxContext(companyId, phoneOrConversationId) {
    const phone = normalizePhone(phoneOrConversationId) || phoneOrConversationId;
    if (!companyId || !phone) {
        return {
            customer: null,
            aiEmployee: null,
            nextUpcomingAppointment: null,
            timeline: [],
        };
    }

    const [customerProfile, aiEmployee, upcomingAppointments] = await Promise.all([
        getCustomerProfile(phone, { companyId }).catch(() => null),
        getDefaultAiEmployee(companyId).catch(() => null),
        listAppointmentsByCustomerPhone({
            companyId,
            phone,
            statusFilter: "upcoming",
            limit: 1,
        }).catch(() => []),
    ]);

    return {
        customer: slimCustomer(customerProfile),
        aiEmployee: slimAiEmployee(aiEmployee),
        nextUpcomingAppointment: slimAppointment(upcomingAppointments[0] || null),
        timeline: slimTimeline(customerProfile?.timeline || []),
    };
}
