/**
 * Durable tenant customer identity — Postgres when DATABASE_URL is set.
 * Persists displayName / explicitName across process restarts (production requirement).
 */
import { normalizePhone } from "../customerService.js";
import { getPostgresPool, isPostgresConfigured } from "./postgresClient.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ziricai_customers (
    company_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    display_name TEXT,
    explicit_name TEXT,
    whatsapp_contact_name TEXT,
    name TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_ziricai_customers_company
    ON ziricai_customers (company_id, updated_at DESC);
`;

/** @type {Map<string, object>} key: companyId::phone */
const memoryByKey = new Map();

let schemaReady = false;

function memoryKey(companyId, phone) {
    return `${companyId}::${normalizePhone(phone)}`;
}

function rowToCustomer(row) {
    return {
        companyId: row.company_id,
        phone: row.phone,
        id: row.phone,
        customerId: row.phone,
        displayName: row.display_name || null,
        explicitName: row.explicit_name || null,
        whatsappContactName: row.whatsapp_contact_name || null,
        name: row.name || null,
        metadata: row.metadata || {},
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

async function ensureSchema() {
    if (schemaReady) return;
    const pool = await getPostgresPool();
    if (pool) await pool.query(SCHEMA_SQL);
    schemaReady = true;
}

export function getCustomerBackendName() {
    return isPostgresConfigured() ? "postgres" : "memory";
}

/**
 * @param {string} companyId
 * @param {string} phone
 */
export async function getDurableCustomer(companyId, phone) {
    if (!companyId || !phone) return null;
    await ensureSchema();

    const id = normalizePhone(phone);
    const pool = await getPostgresPool();

    if (pool) {
        const result = await pool.query(
            `SELECT * FROM ziricai_customers WHERE company_id = $1 AND phone = $2 LIMIT 1`,
            [companyId, id]
        );
        return result.rows[0] ? rowToCustomer(result.rows[0]) : null;
    }

    return memoryByKey.get(memoryKey(companyId, id)) || null;
}

/**
 * Merge identity fields into durable store (Postgres or in-process memory).
 * @param {string} companyId
 * @param {string} phone
 * @param {object} patch
 */
export async function upsertDurableCustomer(companyId, phone, patch = {}) {
    if (!companyId || !phone) return null;
    await ensureSchema();

    const id = normalizePhone(phone);
    const existing = (await getDurableCustomer(companyId, id)) || {};
    const record = {
        ...existing,
        ...patch,
        companyId,
        phone: id,
        id,
        customerId: id,
        updatedAt: new Date().toISOString(),
        createdAt: existing.createdAt || patch.createdAt || new Date().toISOString(),
    };

    const pool = await getPostgresPool();
    if (pool) {
        const result = await pool.query(
            `INSERT INTO ziricai_customers (
                company_id, phone, display_name, explicit_name, whatsapp_contact_name, name, metadata
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (company_id, phone) DO UPDATE SET
                display_name = COALESCE(EXCLUDED.display_name, ziricai_customers.display_name),
                explicit_name = COALESCE(EXCLUDED.explicit_name, ziricai_customers.explicit_name),
                whatsapp_contact_name = COALESCE(EXCLUDED.whatsapp_contact_name, ziricai_customers.whatsapp_contact_name),
                name = COALESCE(EXCLUDED.name, ziricai_customers.name),
                metadata = ziricai_customers.metadata || EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING *`,
            [
                companyId,
                id,
                record.displayName ?? record.display_name ?? null,
                record.explicitName ?? record.explicit_name ?? null,
                record.whatsappContactName ?? record.whatsapp_contact_name ?? null,
                record.name ?? null,
                JSON.stringify(record.metadata || {}),
            ]
        );
        return rowToCustomer(result.rows[0]);
    }

    memoryByKey.set(memoryKey(companyId, id), record);
    return record;
}

/** Test helper — reset in-memory durable customers. */
export function _resetMemoryCustomersForTests() {
    memoryByKey.clear();
    schemaReady = false;
}

/** Test helper — simulate process restart (re-init schema, keep durable data). */
export function _reinitCustomerRepositoryForTests() {
    schemaReady = false;
}
