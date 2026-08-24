/**
 * Durable appointments — Postgres when DATABASE_URL is set, in-memory fallback for local dev.
 */
import { randomUUID } from "crypto";
import { getPostgresPool, isPostgresConfigured } from "./postgresClient.js";

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
        status: "scheduled",
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

/** Test helper — reset in-memory store. */
export function _resetMemoryAppointmentsForTests() {
    memoryByIdempotency.clear();
    memoryAll.length = 0;
    schemaReady = false;
}
