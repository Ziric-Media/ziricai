import { randomUUID } from "crypto";
import { JOB_STATES } from "../jobStates.js";
import { queueMaxAttempts, queueBaseDelayMs } from "../queueConfig.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ziricai_jobs (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    payload JSONB NOT NULL,
    company_id TEXT,
    customer_id TEXT,
    conversation_id TEXT,
    channel TEXT,
    external_message_id TEXT,
    attempt INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    outbound_sent BOOLEAN NOT NULL DEFAULT FALSE,
    outbound_meta_message_id TEXT,
    locked_by TEXT,
    locked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ziricai_jobs_claim
    ON ziricai_jobs (next_run_at, enqueued_at)
    WHERE status IN ('queued', 'retrying');

CREATE UNIQUE INDEX IF NOT EXISTS idx_ziricai_jobs_external_active
    ON ziricai_jobs (external_message_id)
    WHERE external_message_id IS NOT NULL AND status NOT IN ('completed', 'failed');
`;

function rowToJob(row) {
    const payload = row.payload || {};
    return {
        ...payload,
        id: row.id,
        type: row.type,
        status: row.status,
        enqueuedAt: row.enqueued_at ? new Date(row.enqueued_at).getTime() : null,
        startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
        completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
        attempt: row.attempt,
        maxAttempts: row.max_attempts,
        nextRunAt: row.next_run_at ? new Date(row.next_run_at).getTime() : null,
        lastError: row.last_error,
        companyId: row.company_id,
        customerId: row.customer_id,
        conversationId: row.conversation_id,
        channel: row.channel,
        externalMessageId: row.external_message_id,
        outboundSent: row.outbound_sent,
        outboundMetaMessageId: row.outbound_meta_message_id,
    };
}

/**
 * Postgres durable queue — survives restart; atomic claim via FOR UPDATE SKIP LOCKED.
 */
export function createPostgresBackend(connectionString) {
    /** @type {import('pg').Pool} */
    let pool = null;
    const workerId = `worker-${randomUUID().slice(0, 8)}`;

    async function init() {
        const { default: pg } = await import("pg");
        pool = new pg.Pool({
            connectionString,
            max: Math.max(2, parseInt(process.env.QUEUE_PG_POOL_SIZE || "4", 10)),
        });
        await pool.query(SCHEMA_SQL);
        console.log("[queue] Postgres backend initialized");
    }

    async function enqueue(payload) {
        const externalMessageId = payload.externalMessageId || payload.externalId || null;
        const id = randomUUID();
        const maxAttempts = queueMaxAttempts();
        const now = new Date();

        try {
            const result = await pool.query(
                `INSERT INTO ziricai_jobs (
                    id, type, status, payload, company_id, customer_id, conversation_id,
                    channel, external_message_id, max_attempts, enqueued_at, next_run_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
                RETURNING *`,
                [
                    id,
                    payload.type,
                    JOB_STATES.QUEUED,
                    JSON.stringify(payload),
                    payload.companyId || null,
                    payload.customerId || null,
                    payload.conversationId || null,
                    payload.channel || null,
                    externalMessageId,
                    maxAttempts,
                    now,
                ]
            );
            return { job: rowToJob(result.rows[0]), duplicate: false };
        } catch (err) {
            if (err.code === "23505" && externalMessageId) {
                const existing = await pool.query(
                    `SELECT * FROM ziricai_jobs
                     WHERE external_message_id = $1 AND status NOT IN ('completed', 'failed')
                     ORDER BY enqueued_at DESC LIMIT 1`,
                    [externalMessageId]
                );
                if (existing.rows[0]) {
                    return { job: rowToJob(existing.rows[0]), duplicate: true };
                }
            }
            throw err;
        }
    }

    async function claimNext() {
        const result = await pool.query(
            `UPDATE ziricai_jobs
             SET status = $1,
                 started_at = NOW(),
                 locked_by = $2,
                 locked_at = NOW(),
                 attempt = attempt + 1
             WHERE id = (
                 SELECT id FROM ziricai_jobs
                 WHERE status IN ($3, $4)
                   AND next_run_at <= NOW()
                 ORDER BY next_run_at ASC, enqueued_at ASC
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1
             )
             RETURNING *`,
            [JOB_STATES.PROCESSING, workerId, JOB_STATES.QUEUED, JOB_STATES.RETRYING]
        );
        if (!result.rows[0]) return null;
        return rowToJob(result.rows[0]);
    }

    async function completeJob(id, patch = {}) {
        const result = await pool.query(
            `UPDATE ziricai_jobs
             SET status = $1,
                 completed_at = NOW(),
                 outbound_sent = COALESCE($3, outbound_sent),
                 outbound_meta_message_id = COALESCE($4, outbound_meta_message_id),
                 locked_by = NULL,
                 locked_at = NULL
             WHERE id = $2
             RETURNING *`,
            [
                JOB_STATES.COMPLETED,
                id,
                patch.outboundSent ?? null,
                patch.outboundMetaMessageId ?? null,
            ]
        );
        return result.rows[0] ? rowToJob(result.rows[0]) : null;
    }

    async function scheduleRetry(id, errorMessage) {
        const current = await pool.query(`SELECT * FROM ziricai_jobs WHERE id = $1`, [id]);
        const row = current.rows[0];
        if (!row) return null;

        if (row.attempt >= row.max_attempts) {
            const failed = await pool.query(
                `UPDATE ziricai_jobs
                 SET status = $1, completed_at = NOW(), last_error = $2, locked_by = NULL, locked_at = NULL
                 WHERE id = $3 RETURNING *`,
                [JOB_STATES.FAILED, errorMessage, id]
            );
            return rowToJob(failed.rows[0]);
        }

        const delayMs = queueBaseDelayMs() * Math.pow(2, row.attempt - 1);
        const nextRun = new Date(Date.now() + delayMs);
        const retrying = await pool.query(
            `UPDATE ziricai_jobs
             SET status = $1, last_error = $2, next_run_at = $3, locked_by = NULL, locked_at = NULL
             WHERE id = $4 RETURNING *`,
            [JOB_STATES.RETRYING, errorMessage, nextRun, id]
        );
        return rowToJob(retrying.rows[0]);
    }

    async function markOutboundSent(id, metaMessageId, extra = {}) {
        const result = await pool.query(
            `UPDATE ziricai_jobs
             SET outbound_sent = TRUE, outbound_meta_message_id = $2
             WHERE id = $1 RETURNING *`,
            [id, metaMessageId]
        );
        const job = result.rows[0] ? rowToJob(result.rows[0]) : null;
        if (job && extra.outboundPlanSent) job.outboundPlanSent = true;
        if (job && extra.outboundMetaMessageIds) job.outboundMetaMessageIds = extra.outboundMetaMessageIds;
        return job;
    }

    async function findActiveByExternalMessageId(externalMessageId) {
        if (!externalMessageId) return null;
        const result = await pool.query(
            `SELECT * FROM ziricai_jobs
             WHERE external_message_id = $1 AND status NOT IN ('completed', 'failed')
             ORDER BY enqueued_at DESC LIMIT 1`,
            [externalMessageId]
        );
        return result.rows[0] ? rowToJob(result.rows[0]) : null;
    }

    async function getStats() {
        const result = await pool.query(
            `SELECT status, COUNT(*)::int AS count FROM ziricai_jobs GROUP BY status`
        );
        const counts = Object.fromEntries(result.rows.map((r) => [r.status, r.count]));
        return {
            pending: counts[JOB_STATES.QUEUED] || 0,
            active: counts[JOB_STATES.PROCESSING] || 0,
            retrying: counts[JOB_STATES.RETRYING] || 0,
            failed: counts[JOB_STATES.FAILED] || 0,
            completed: counts[JOB_STATES.COMPLETED] || 0,
            total: result.rows.reduce((n, r) => n + r.count, 0),
            backend: "postgres",
        };
    }

    async function listJobs(limit = 100) {
        const result = await pool.query(
            `SELECT * FROM ziricai_jobs ORDER BY enqueued_at DESC LIMIT $1`,
            [limit]
        );
        return result.rows.map(rowToJob);
    }

    async function shutdown() {
        if (pool) await pool.end();
    }

    return {
        name: "postgres",
        init,
        enqueue,
        claimNext,
        completeJob,
        scheduleRetry,
        markOutboundSent,
        findActiveByExternalMessageId,
        getStats,
        listJobs,
        async restoreJobs() {
            throw new Error("restoreJobs is memory-backend test helper only");
        },
        shutdown,
    };
}
