/**
 * Test-only transient failure hook for queue reliability scripts.
 * Active only when OPS_QUEUE_RELIABILITY_TEST=1 (never in production paths by default).
 */

const TRANSIENT_TITLE = "__OPS_TRANSIENT__";

export function isReliabilityTestTransientEnabled() {
    return process.env.OPS_QUEUE_RELIABILITY_TEST === "1";
}

/**
 * @param {{ task: { title?: string }, attempt?: number }} params
 */
export function shouldSimulateTransientFailure({ task, attempt = 1 }) {
    if (!isReliabilityTestTransientEnabled()) return false;
    if (task?.title !== TRANSIENT_TITLE) return false;
    const failUntil = parseInt(process.env.OPS_QUEUE_TEST_TRANSIENT_FAILS || "2", 10);
    const n = Number.isFinite(failUntil) && failUntil >= 0 ? failUntil : 2;
    return attempt <= n;
}

export { TRANSIENT_TITLE };
