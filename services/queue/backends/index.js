import { createMemoryBackend } from "./memoryBackend.js";
import { createPostgresBackend } from "./postgresBackend.js";
import { resolveQueueBackendName } from "../queueConfig.js";

/**
 * Select durable backend from env. Postgres preferred when DATABASE_URL is set.
 * REDIS_URL is documented as a future/alternative path — falls back to memory until implemented.
 */
export async function createQueueBackend() {
    const name = resolveQueueBackendName();

    if (name === "postgres") {
        return createPostgresBackend(process.env.DATABASE_URL);
    }

    if (name === "redis") {
        console.warn(
            "[queue] REDIS_URL is set but Redis backend is not bundled — using in-memory queue. " +
                "Set DATABASE_URL for durable Postgres queue, or see docs/deployment/QUEUE.md."
        );
    }

    return createMemoryBackend();
}
