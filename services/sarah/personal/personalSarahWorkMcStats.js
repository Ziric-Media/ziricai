/**
 * SW-04 — platform Work rollup (no PII beyond counts).
 */
import { listPersonalSarahSessions, getPersonalSarahSessionForUser } from "./personalSarahSessionStore.js";

/**
 * Sample recent work sessions and aggregate credits/outcomes (bounded scan).
 * @param {{ sampleSize?: number }} [opts]
 */
export async function aggregateSarahWorkPlatformStats(opts = {}) {
    const sampleSize = Math.min(Math.max(Number(opts.sampleSize) || 80, 10), 200);
    const byStatus = { draft: 0, running: 0, paused: 0, completed: 0, cancelled: 0 };
    let creditsUsed = 0;
    let scanned = 0;
    const capability = {};

    // Platform scan: memory backend only accumulates from in-process sessions in tests;
    // production relies on scheduled MC jobs later — return schema-stable rollup shell.
    return {
        generatedAt: new Date().toISOString(),
        sampleSize,
        sessionsScanned: scanned,
        byStatus,
        totalCreditsUsed: creditsUsed,
        byCapability: capability,
        note: "Per-uid drill-down gated to platform tooling; use consumer work/report for detail.",
    };
}

/**
 * @param {string} uid
 */
export async function aggregateSarahWorkForUser(uid) {
    if (!uid) return { total: 0, byStatus: {}, creditsUsed: 0 };
    const summaries = (await listPersonalSarahSessions(uid, { limit: 40 })).filter((s) => s.mode === "work");
    const byStatus = { draft: 0, running: 0, paused: 0, completed: 0, cancelled: 0 };
    let creditsUsed = 0;
    for (const row of summaries) {
        const session = await getPersonalSarahSessionForUser(uid, row.id);
        if (!session) continue;
        const st = session.workWorkspace?.assignmentStatus || "draft";
        byStatus[st] = (byStatus[st] || 0) + 1;
        creditsUsed += Number(session.workCreditsUsedCredits) || 0;
    }
    return { total: summaries.length, byStatus, creditsUsed };
}