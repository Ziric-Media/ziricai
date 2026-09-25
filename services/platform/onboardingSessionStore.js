/**
 * CORPORATE-P0-2c — durable onboarding session business operations.
 */
import { getOnboardingSessionRepository } from "./onboardingSessionRepository.js";

export const SESSION_STATUS = {
    IN_PROGRESS: "in_progress",
    LIVE: "live",
    ABANDONED: "abandoned",
};

function now() {
    return new Date().toISOString();
}

export async function saveOnboardingSession(session) {
    const repo = await getOnboardingSessionRepository();
    const updated = { ...session, updatedAt: now() };
    return repo.saveSession(updated);
}

export async function getOnboardingSessionRecord(sessionId) {
    if (!sessionId || typeof sessionId !== "string") return null;
    const repo = await getOnboardingSessionRepository();
    return repo.getSession(sessionId.trim());
}

export async function findLatestInProgressSessionForUid(uid) {
    if (!uid) return null;
    const repo = await getOnboardingSessionRepository();
    return repo.findLatestByUidAndStatus(uid, SESSION_STATUS.IN_PROGRESS);
}

export async function findLatestLiveSessionForUid(uid) {
    if (!uid) return null;
    const repo = await getOnboardingSessionRepository();
    return repo.findLatestByUidAndStatus(uid, SESSION_STATUS.LIVE);
}

export async function markSessionLive(session) {
    return saveOnboardingSession({
        ...session,
        status: SESSION_STATUS.LIVE,
        completedAt: now(),
    });
}

export async function markSessionAbandoned(session) {
    return saveOnboardingSession({
        ...session,
        status: SESSION_STATUS.ABANDONED,
        abandonedAt: now(),
    });
}

/**
 * Simulate reload: new store call path, same repository singleton (memory/Firestore).
 */
export async function reloadOnboardingSession(sessionId) {
    return getOnboardingSessionRecord(sessionId);
}
