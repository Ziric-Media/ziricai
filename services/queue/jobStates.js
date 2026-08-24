/** Job lifecycle states for durable queue observability. */
export const JOB_STATES = Object.freeze({
    QUEUED: "queued",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
    RETRYING: "retrying",
});

export const TERMINAL_JOB_STATES = new Set([JOB_STATES.COMPLETED, JOB_STATES.FAILED]);

export function isTerminalJobState(status) {
    return TERMINAL_JOB_STATES.has(status);
}
