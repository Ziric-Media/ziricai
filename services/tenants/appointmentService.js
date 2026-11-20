/**
 * Appointment service — tenant-scoped scheduling.
 */
import { randomUUID } from "crypto";
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";

class AppointmentService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.APPOINTMENTS);
    }

    async listUpcoming(companyId, max = 50) {
        return this.list(companyId, {
            max,
            orderByField: "scheduledAt",
            orderDirection: "asc",
            filters: { status: "scheduled" },
        });
    }
}

const appointmentService = new AppointmentService();

export async function listAppointments(companyId, options = {}) {
    return appointmentService.list(companyId, options);
}

export async function createAppointment(companyId, data) {
    return appointmentService.create(companyId, {
        status: "scheduled",
        ...data,
    });
}

export async function updateAppointment(companyId, appointmentId, patch) {
    return appointmentService.update(companyId, appointmentId, patch);
}

export async function cancelAppointment(companyId, appointmentId) {
    return appointmentService.update(companyId, appointmentId, { status: "cancelled" });
}

export async function listUpcomingAppointments(companyId) {
    return appointmentService.listUpcoming(companyId);
}

/** Single diary row — used by dental booking tools and claims. */
export async function getAppointment(companyId, appointmentId) {
    if (!companyId || !appointmentId) return null;
    return appointmentService.get(companyId, appointmentId);
}

/** Create or replace a full appointment record (SmileMore diary ledger). */
export async function saveAppointmentRecord(companyId, data = {}) {
    const id = data.id || randomUUID();
    const record = { ...data, companyId };
    const existing = await appointmentService.get(companyId, id).catch(() => null);
    if (existing) {
        return appointmentService.update(companyId, id, record);
    }
    return appointmentService.create(companyId, record, id);
}

/** Partial update for diary rows. */
export async function patchAppointmentRecord(companyId, appointmentId, patch = {}) {
    return appointmentService.update(companyId, appointmentId, patch);
}
