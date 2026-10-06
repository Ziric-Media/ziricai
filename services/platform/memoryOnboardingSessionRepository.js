/**
 * In-process onboarding session store (tests + STORAGE_BACKEND=memory).
 */

export class MemoryOnboardingSessionRepository {
    constructor() {
        /** @type {Map<string, object>} */
        this.byId = new Map();
    }

    async saveSession(session) {
        if (!session?.sessionId) throw new Error("sessionId is required");
        const copy = structuredClone(session);
        this.byId.set(session.sessionId, copy);
        return copy;
    }

    async getSession(sessionId) {
        const row = this.byId.get(sessionId);
        return row ? structuredClone(row) : null;
    }

    async listSessionsByUid(uid) {
        const items = [];
        for (const row of this.byId.values()) {
            if (row.uid === uid) items.push(structuredClone(row));
        }
        items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return items;
    }

    async findLatestByUidAndStatus(uid, status) {
        const matches = (await this.listSessionsByUid(uid)).filter((s) => s.status === status);
        return matches[0] || null;
    }
}
