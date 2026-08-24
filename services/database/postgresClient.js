/**
 * Shared Postgres pool — reuses DATABASE_URL (same DB as durable queue when configured).
 */
import { bootstrapEnv } from "../env/startupEnv.js";

bootstrapEnv();

/** @type {import('pg').Pool | null} */
let pool = null;
let initPromise = null;

export function isPostgresConfigured() {
    return Boolean(process.env.DATABASE_URL);
}

export async function getPostgresPool() {
    if (!isPostgresConfigured()) return null;
    if (pool) return pool;

    if (!initPromise) {
        initPromise = (async () => {
            const { default: pg } = await import("pg");
            pool = new pg.Pool({
                connectionString: process.env.DATABASE_URL,
                max: Math.max(2, parseInt(process.env.PG_POOL_SIZE || "4", 10)),
            });
            return pool;
        })();
    }

    return initPromise;
}

export async function shutdownPostgresPool() {
    if (pool) {
        await pool.end();
        pool = null;
        initPromise = null;
    }
}
