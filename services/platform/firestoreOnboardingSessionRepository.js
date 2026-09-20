/**
 * Firestore onboarding sessions — platform/onboarding/sessions/{sessionId}
 */
import { getAdminFirestore } from "../database/firestoreAdmin.js";
import {
    platformOnboardingSessionPath,
    platformOnboardingSessionsCollectionPath,
} from "../database/schema.js";

function stripUndefined(obj) {
    const out = { ...obj };
    for (const k of Object.keys(out)) {
        if (out[k] === undefined) delete out[k];
    }
    return out;
}

export class FirestoreOnboardingSessionRepository {
    async saveSession(session) {
        if (!session?.sessionId) throw new Error("sessionId is required");
        const db = getAdminFirestore();
        const ref = db.doc(platformOnboardingSessionPath(session.sessionId));
        const payload = stripUndefined({ ...session });
        await ref.set(payload, { merge: true });
        return { ...payload };
    }

    async getSession(sessionId) {
        const db = getAdminFirestore();
        const snap = await db.doc(platformOnboardingSessionPath(sessionId)).get();
        if (!snap.exists) return null;
        return { sessionId: snap.id, ...snap.data() };
    }

    async listSessionsByUid(uid) {
        const db = getAdminFirestore();
        const snap = await db
            .collection(platformOnboardingSessionsCollectionPath())
            .where("uid", "==", uid)
            .get();
        const items = snap.docs.map((d) => ({ sessionId: d.id, ...d.data() }));
        items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return items;
    }

    async findLatestByUidAndStatus(uid, status) {
        const items = (await this.listSessionsByUid(uid)).filter((s) => s.status === status);
        return items[0] || null;
    }
}
