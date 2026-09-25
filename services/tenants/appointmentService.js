/**
 * Appointment service — tenant-scoped scheduling.
 * Phase 2B-2: merges canonical Postgres appointments (Sarah) with legacy Firestore docs.
 */
import { ServiceBase } from "../core/serviceBase.js";
import { TENANT_COLLECTIONS } from "../database/schema.js";
import { listAppointmentsForCompany } from "../database/appointmentRepository.js";
import { postgresAppointmentToListItem } from "../integrations/appointmentCanonicalSync.js";

class AppointmentService extends ServiceBase {
    constructor() {
        super(TENANT_COLLECTIONS.APPOINTMENTS);
    }

    async listUpcoming(companyId, max = 50) {
        const merged = await mergeTenantAppointments(companyId, { limit: max });
        const nowMs = Date.now();
        return merged
            .filter((item) => {
                const status = String(item.status || "").toLowerCase();
                if (status === "cancelled") return false;
                const scheduledMs = new Date(item.scheduledAt || item.dateTime || 0).getTime();
                return Number.isFinite(scheduledMs) && scheduledMs >= nowMs;
            })
            .sort(
                (a, b) =>
                    new Date(a.scheduledAt || a.dateTime).getTime() -
                    new Date(b.scheduledAt || b.dateTime).getTime()
            )
            .slice(0, max);
    }
}

const appointmentService = new AppointmentService();

function dedupeAppointments(items) {
    const byId = new Map();
    for (const item of items) {
        if (!item?.id) continue;
        const existing = byId.get(item.id);
        if (!existing || item.canonicalSource === "postgres") {
            byId.set(item.id, item);
        }
    }
    return [...byId.values()];
}

async function mergeTenantAppointments(companyId, { limit = 500 } = {}) {
    const [firestoreItems, postgresRows] = await Promise.all([
        appointmentService.list(companyId, { max: limit }).catch(() => []),
        listAppointmentsForCompany(companyId, { limit, statusFilter: "all" }).catch(() => []),
    ]);

    const postgresItems = postgresRows
        .map((row) => postgresAppointmentToListItem(row))
        .filter(Boolean);

    return dedupeAppointments([...firestoreItems, ...postgresItems]).sort(
        (a, b) =>
            new Date(b.scheduledAt || b.dateTime || 0).getTime() -
            new Date(a.scheduledAt || a.dateTime || 0).getTime()
    );
}

export async function listAppointments(companyId, options = {}) {
    const max = options.max || options.limit || 500;
    return mergeTenantAppointments(companyId, { limit: max });
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
    const existing =
        (await getTenantAppointment(companyId, appointmentId).catch(() => null)) ||
        (await appointmentService.get(companyId, appointmentId).catch(() => null));

    if (existing?.canonicalSource === "postgres" || (!existing?.canonicalSource && appointmentId)) {
        try {
            const { cancelAppointmentRecord } = await import("../database/appointmentRepository.js");
            await cancelAppointmentRecord({ companyId, appointmentId });
        } catch (err) {
            console.warn("[appointments] Postgres cancel skipped/failed:", err.message);
        }
        try {
            const { syncCanonicalAppointmentCancelled } = await import(
                "../integrations/appointmentCanonicalSync.js"
            );
            await syncCanonicalAppointmentCancelled(companyId, {
                id: appointmentId,
                companyId,
                status: "cancelled",
                customerId: existing?.customerId || existing?.phone || null,
            });
        } catch (err) {
            console.warn("[appointments] Cancel mirror failed:", err.message);
        }
    }

    try {
        return await appointmentService.update(companyId, appointmentId, { status: "cancelled" });
    } catch {
        return { id: appointmentId, companyId, status: "cancelled", ...(existing || {}) };
    }
}

export async function listUpcomingAppointments(companyId) {
    return appointmentService.listUpcoming(companyId);
}

export async function getTenantAppointment(companyId, appointmentId) {
    const merged = await mergeTenantAppointments(companyId, { limit: 1000 });
    return merged.find((item) => item.id === appointmentId) || appointmentService.get(companyId, appointmentId);
}
