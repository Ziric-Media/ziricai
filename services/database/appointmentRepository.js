/**
 * Durable appointments — Postgres when DATABASE_URL is set, in-memory fallback for local dev.
 */
import { randomUUID } from "crypto";
import { getPostgresPool, isPostgresConfigured } from "./postgresClient.js";
import { normalizePhone } from "../customerService.js";
import { resolveVehicle, vehicleToPublic } from "../inventory/inventoryService.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ziricai_appointments (
    id UUID PRIMARY KEY,
    company_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    vehicle_stock_number TEXT,
    appointment_type TEXT NOT NULL DEFAULT 'test_drive',
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    idempotency_key TEXT NOT NULL,
    created_by_agent_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ziricai_appointments_idempotency
    ON ziricai_appointments (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_ziricai_appointments_slot
    ON ziricai_appointments (company_id, scheduled_at)
    WHERE status NOT IN ('cancelled');

CREATE INDEX IF NOT EXISTS idx_ziricai_appointments_customer
    ON ziricai_appointments (company_id, customer_id, scheduled_at DESC);
`;

/** @type {Map<string, object>} */
const memoryByIdempotency = new Map();
/** @type {object[]} */
const memoryAll = [];

let schemaReady = false;

function rowToAppointment(row) {
    return {
        id: row.id,
        companyId: row.company_id,
        customerId: row.customer_id,
        vehicleStockNumber: row.vehicle_stock_number,
        appointmentType: row.appointment_type,
        scheduledAt: row.scheduled_at instanceof Date ? row.scheduled_at.toISOString() : row.scheduled_at,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        createdByAgentId: row.created_by_agent_id,
        metadata: row.metadata || {},
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

async function ensureSchema() {
    if (schemaReady) return;
    const pool = await getPostgresPool();
    if (pool) {
        await pool.query(SCHEMA_SQL);
    }
    schemaReady = true;
}

export function getAppointmentBackendName() {
    return isPostgresConfigured() ? "postgres" : "memory";
}

/**
 * @param {object} input
 * @param {string} input.companyId
 * @param {string} input.customerId
 * @param {string} [input.vehicleStockNumber]
 * @param {string} input.appointmentType
 * @param {Date|string} input.scheduledAt
 * @param {string} input.idempotencyKey
 * @param {string} [input.createdByAgentId]
 * @param {object} [input.metadata]
 * @param {string} [input.status]
 */
export async function createAppointmentRecord(input) {
    await ensureSchema();

    const existing = await findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
        return { appointment: existing, duplicate: true };
    }

    const id = randomUUID();
    const scheduledAt =
        input.scheduledAt instanceof Date ? input.scheduledAt : new Date(input.scheduledAt);
    const record = {
        id,
        companyId: input.companyId,
        customerId: input.customerId,
        vehicleStockNumber: input.vehicleStockNumber || null,
        appointmentType: input.appointmentType || "test_drive",
        scheduledAt: scheduledAt.toISOString(),
        status: input.status || "confirmed",
        idempotencyKey: input.idempotencyKey,
        createdByAgentId: input.createdByAgentId || null,
        metadata: input.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const pool = await getPostgresPool();
    if (pool) {
        try {
            const result = await pool.query(
                `INSERT INTO ziricai_appointments (
                    id, company_id, customer_id, vehicle_stock_number, appointment_type,
                    scheduled_at, status, idempotency_key, created_by_agent_id, metadata
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                RETURNING *`,
                [
                    record.id,
                    record.companyId,
                    record.customerId,
                    record.vehicleStockNumber,
                    record.appointmentType,
                    scheduledAt,
                    record.status,
                    record.idempotencyKey,
                    record.createdByAgentId,
                    JSON.stringify(record.metadata),
                ]
            );
            return { appointment: rowToAppointment(result.rows[0]), duplicate: false };
        } catch (err) {
            if (err.code === "23505") {
                const dup = await findByIdempotencyKey(input.idempotencyKey);
                if (dup) return { appointment: dup, duplicate: true };
            }
            throw err;
        }
    }

    memoryByIdempotency.set(record.idempotencyKey, record);
    memoryAll.push(record);
    return { appointment: record, duplicate: false };
}

export async function findByIdempotencyKey(idempotencyKey) {
    await ensureSchema();

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `SELECT * FROM ziricai_appointments WHERE idempotency_key = $1 LIMIT 1`,
            [idempotencyKey]
        );
        return result.rows[0] ? rowToAppointment(result.rows[0]) : null;
    }

    return memoryByIdempotency.get(idempotencyKey) || null;
}

/**
 * Count active appointments overlapping a slot window (exclusive end).
 */
export async function countAppointmentsInSlot(companyId, slotStart, slotEnd) {
    await ensureSchema();

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS count FROM ziricai_appointments
             WHERE company_id = $1
               AND status NOT IN ('cancelled')
               AND scheduled_at >= $2
               AND scheduled_at < $3`,
            [companyId, slotStart, slotEnd]
        );
        return result.rows[0]?.count || 0;
    }

    const startMs = slotStart instanceof Date ? slotStart.getTime() : new Date(slotStart).getTime();
    const endMs = slotEnd instanceof Date ? slotEnd.getTime() : new Date(slotEnd).getTime();

    return memoryAll.filter((a) => {
        if (a.companyId !== companyId || a.status === "cancelled") return false;
        const t = new Date(a.scheduledAt).getTime();
        return t >= startMs && t < endMs;
    }).length;
}

function matchesStatusFilter(appointment, statusFilter) {
    const filter = statusFilter || "all";
    const scheduledMs = new Date(appointment.scheduledAt).getTime();
    const nowMs = Date.now();
    const cancelled = appointment.status === "cancelled";

    if (filter === "upcoming") {
        return !cancelled && scheduledMs >= nowMs;
    }
    if (filter === "past") {
        return cancelled || scheduledMs < nowMs;
    }
    return true;
}

function sortAppointmentsDesc(rows) {
    return rows.sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
    );
}

async function enrichAppointment(companyId, appointment) {
    const meta = appointment.metadata || {};
    const vehicleId = meta.vehicleId || null;
    const stockNumber = appointment.vehicleStockNumber;

    let vehicle = null;
    if (vehicleId || stockNumber) {
        vehicle = await resolveVehicle(companyId, { vehicleId, stockNumber });
    }

    const publicVehicle = vehicle ? vehicleToPublic(vehicle) : null;

    const vehicleDescription =
        meta.vehicleDescription ||
        meta.vehicleLabel ||
        publicVehicle?.label ||
        publicVehicle?.title ||
        (meta.vehicleMake && meta.vehicleModel
            ? [meta.vehicleYear, meta.vehicleMake, meta.vehicleModel].filter(Boolean).join(" ")
            : null);

    return {
        id: appointment.id,
        bookingId: appointment.id,
        companyId: appointment.companyId,
        customerId: appointment.customerId,
        vehicleId: vehicleId || publicVehicle?.vehicleId || vehicle?.vehicleId || null,
        stockNumber: stockNumber || publicVehicle?.stockNumber || null,
        vehicleMake: meta.vehicleMake || publicVehicle?.make || null,
        vehicleModel: meta.vehicleModel || publicVehicle?.model || null,
        vehicleDescription,
        scheduledAt: appointment.scheduledAt,
        dateTime: appointment.scheduledAt,
        location: meta.location || publicVehicle?.location || null,
        status: appointment.status,
        appointmentType: appointment.appointmentType,
        idempotencyKey: appointment.idempotencyKey,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
        metadata: appointment.metadata,
        vehicle: publicVehicle,
    };
}

/** Public alias for tools that need enriched appointment payloads. */
export async function enrichAppointmentRecord(companyId, appointment) {
    return enrichAppointment(companyId, appointment);
}

/**
 * List appointments for a tenant customer (customerId = normalized phone doc id).
 * @param {object} input
 * @param {string} input.companyId
 * @param {string} input.customerId
 * @param {string} [input.appointmentType]
 * @param {"upcoming"|"past"|"all"} [input.statusFilter]
 * @param {number} [input.limit]
 */
export async function listAppointmentsByCustomer({
    companyId,
    customerId,
    appointmentType = "test_drive",
    statusFilter = "all",
    limit = 20,
} = {}) {
    await ensureSchema();

    if (!companyId || !customerId) return [];

    const max = Math.min(Math.max(parseInt(String(limit || 20), 10) || 20, 1), 50);
    const pool = await getPostgresPool();

    if (pool) {
        const conditions = ["company_id = $1", "customer_id = $2"];
        const params = [companyId, customerId];
        let paramIdx = 3;

        if (appointmentType) {
            conditions.push(`appointment_type = $${paramIdx++}`);
            params.push(appointmentType);
        }

        if (statusFilter === "upcoming") {
            conditions.push(`status NOT IN ('cancelled')`);
            conditions.push(`scheduled_at >= NOW()`);
        } else if (statusFilter === "past") {
            conditions.push(`(status = 'cancelled' OR scheduled_at < NOW())`);
        }

        params.push(max);

        const result = await pool.query(
            `SELECT * FROM ziricai_appointments
             WHERE ${conditions.join(" AND ")}
             ORDER BY scheduled_at DESC
             LIMIT $${paramIdx}`,
            params
        );

        const enriched = [];
        for (const row of result.rows) {
            enriched.push(await enrichAppointment(companyId, rowToAppointment(row)));
        }
        return enriched;
    }

    let rows = memoryAll.filter(
        (a) =>
            a.companyId === companyId &&
            a.customerId === customerId &&
            (!appointmentType || a.appointmentType === appointmentType)
    );
    rows = rows.filter((a) => matchesStatusFilter(a, statusFilter));
    rows = sortAppointmentsDesc(rows).slice(0, max);

    const enriched = [];
    for (const row of rows) {
        enriched.push(await enrichAppointment(companyId, row));
    }
    return enriched;
}

/**
 * List appointments by customer phone — tenant-scoped (company_id + normalized phone).
 * @param {object} input
 * @param {string} input.companyId
 * @param {string} input.phone
 * @param {string} [input.appointmentType]
 * @param {"upcoming"|"past"|"all"} [input.statusFilter]
 * @param {number} [input.limit]
 */
export async function listAppointmentsByCustomerPhone({
    companyId,
    phone,
    appointmentType = "test_drive",
    statusFilter = "all",
    limit = 20,
} = {}) {
    const normalized = normalizePhone(phone);
    if (!companyId || !normalized) return [];

    return listAppointmentsByCustomer({
        companyId,
        customerId: normalized,
        appointmentType,
        statusFilter,
        limit,
    });
}

export async function findAppointmentById(companyId, appointmentId) {
    await ensureSchema();

    if (!companyId || !appointmentId) return null;

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `SELECT * FROM ziricai_appointments WHERE id = $1 AND company_id = $2 LIMIT 1`,
            [appointmentId, companyId]
        );
        return result.rows[0] ? rowToAppointment(result.rows[0]) : null;
    }

    return (
        memoryAll.find((a) => a.id === appointmentId && a.companyId === companyId) || null
    );
}

/**
 * Cancel an appointment — tenant-scoped; optional customerId verifies ownership.
 */
export async function cancelAppointmentRecord({ companyId, appointmentId, customerId } = {}) {
    await ensureSchema();

    if (!companyId || !appointmentId) {
        return { ok: false, error: "companyId and appointmentId are required", code: "INVALID_INPUT" };
    }

    const existing = await findAppointmentById(companyId, appointmentId);
    if (!existing) {
        return { ok: false, error: "Booking not found", code: "NOT_FOUND" };
    }

    if (customerId && existing.customerId !== customerId) {
        return { ok: false, error: "Booking not found", code: "NOT_FOUND" };
    }

    if (existing.status === "cancelled") {
        const enriched = await enrichAppointment(companyId, existing);
        return { ok: true, duplicate: true, appointment: enriched, booking: enriched };
    }

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `UPDATE ziricai_appointments
             SET status = 'cancelled', updated_at = NOW()
             WHERE id = $1 AND company_id = $2
             RETURNING *`,
            [appointmentId, companyId]
        );
        const updated = rowToAppointment(result.rows[0]);
        const enriched = await enrichAppointment(companyId, updated);
        return { ok: true, duplicate: false, appointment: enriched, booking: enriched };
    }

    existing.status = "cancelled";
    existing.updatedAt = new Date().toISOString();
    const enriched = await enrichAppointment(companyId, existing);
    return { ok: true, duplicate: false, appointment: enriched, booking: enriched };
}

/** Test helper — reset in-memory store. */
export function _resetMemoryAppointmentsForTests() {
    memoryByIdempotency.clear();
    memoryAll.length = 0;
    schemaReady = false;
}

/** Test helper — simulate process restart (re-init schema, keep durable data). */
export function _reinitAppointmentRepositoryForTests() {
    schemaReady = false;
}
