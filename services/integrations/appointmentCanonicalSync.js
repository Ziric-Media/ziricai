/**
 * Phase 2B-2 — Canonical appointment sync (Postgres → tenant CRM appointments).
 * Postgres ziricai_appointments remains authoritative for Sarah test drives.
 * Firestore companies/{companyId}/appointments/{postgresUuid} is a read mirror for Portal/CRM.
 */
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { TenantRepository } from "../database/tenantRepository.js";
import { enrichAppointmentRecord } from "../database/appointmentRepository.js";

export const CANONICAL_APPOINTMENT_SOURCE = "postgres";

const appointmentRepo = new TenantRepository(TENANT_COLLECTIONS.APPOINTMENTS);

function normalizeStatus(status) {
    const s = String(status || "confirmed").toLowerCase();
    if (s === "scheduled") return "confirmed";
    return s;
}

/**
 * Map Postgres appointment record to tenant CRM appointment document shape.
 * @param {object} appointment
 * @param {object} [enriched]
 */
export function mapCanonicalAppointmentDoc(appointment, enriched = null) {
    const meta = appointment?.metadata || {};
    const row = enriched || appointment || {};
    const customerId = appointment.customerId || row.customerId;

    return {
        id: appointment.id,
        companyId: appointment.companyId,
        customerId,
        phone: customerId,
        customerName: row.customerName || meta.customerName || meta.bookedCustomer || null,
        scheduledAt: appointment.scheduledAt,
        dateTime: appointment.scheduledAt,
        service: "test_drive",
        appointmentType: appointment.appointmentType || "test_drive",
        status: normalizeStatus(appointment.status),
        source: "sarah",
        bookedBy: "Sarah",
        assignedAiEmployee: "Sarah",
        aiEmployee: "Sarah",
        channel: meta.channel || "whatsapp",
        vehicleId: row.vehicleId || meta.vehicleId || null,
        vehicleStockNumber: appointment.vehicleStockNumber || row.stockNumber || null,
        stockNumber: appointment.vehicleStockNumber || row.stockNumber || null,
        vehicleName: row.vehicleDescription || meta.vehicleDescription || meta.vehicleLabel || null,
        vehicleDescription: row.vehicleDescription || meta.vehicleDescription || null,
        location: row.location || meta.location || null,
        timezone: "Africa/Johannesburg",
        canonicalSource: CANONICAL_APPOINTMENT_SOURCE,
        idempotencyKey: appointment.idempotencyKey || null,
        createdAt: appointment.createdAt || new Date().toISOString(),
        updatedAt: appointment.updatedAt || new Date().toISOString(),
    };
}

/**
 * Upsert canonical appointment into tenant CRM appointments collection.
 * Uses Postgres UUID as Firestore doc ID — idempotent on retries.
 */
export async function syncCanonicalAppointmentRecord(companyId, appointment, options = {}) {
    if (!companyId || !appointment?.id) return null;

    let enriched = options.enriched || null;
    if (!enriched) {
        try {
            enriched = await enrichAppointmentRecord(companyId, appointment);
        } catch {
            enriched = null;
        }
    }

    const doc = mapCanonicalAppointmentDoc(appointment, enriched);
    const existing = await appointmentRepo.get(companyId, appointment.id);
    if (existing?.canonicalSource === CANONICAL_APPOINTMENT_SOURCE && existing?.status === doc.status) {
        return { appointmentId: appointment.id, skipped: true, reason: "already_synced" };
    }

    await appointmentRepo.set(companyId, appointment.id, doc);
    return { appointmentId: appointment.id, synced: true };
}

/**
 * Mark canonical appointment cancelled in tenant CRM (historical record preserved).
 */
export async function syncCanonicalAppointmentCancelled(companyId, appointment, options = {}) {
    if (!companyId || !appointment?.id) return null;

    let enriched = options.enriched || null;
    if (!enriched) {
        try {
            enriched = await enrichAppointmentRecord(companyId, appointment);
        } catch {
            enriched = appointment;
        }
    }

    const cancelled = {
        ...mapCanonicalAppointmentDoc({ ...appointment, status: "cancelled" }, enriched),
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const existing = await appointmentRepo.get(companyId, appointment.id);
    if (existing?.status === "cancelled") {
        return { appointmentId: appointment.id, skipped: true, reason: "already_cancelled" };
    }

    await appointmentRepo.set(companyId, appointment.id, cancelled);
    return { appointmentId: appointment.id, synced: true, status: "cancelled" };
}

/**
 * Map Postgres enriched appointment to Portal list item shape.
 */
export function postgresAppointmentToListItem(row) {
    if (!row) return null;
    return {
        id: row.id || row.bookingId,
        companyId: row.companyId,
        customerId: row.customerId,
        phone: row.customerId,
        customerName: row.customerName || null,
        scheduledAt: row.scheduledAt,
        dateTime: row.scheduledAt,
        service: "test_drive",
        appointmentType: row.appointmentType || "test_drive",
        status: normalizeStatus(row.status),
        source: "sarah",
        bookedBy: "Sarah",
        vehicleId: row.vehicleId || null,
        vehicleStockNumber: row.stockNumber || row.vehicleStockNumber || null,
        vehicleName: row.vehicleDescription || null,
        location: row.location || null,
        canonicalSource: CANONICAL_APPOINTMENT_SOURCE,
    };
}
