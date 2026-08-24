/**
 * Legacy flat-collection Firestore adapter (root customers, agents, memories).
 * @deprecated New tenant writes must use TenantRepository via services/tenants/*.
 * Retained for WhatsApp webhook pipeline until Phase 4 cutover.
 *
 * Server (Railway): uses Firebase Admin SDK when credentials are set.
 * Browser/local: uses client SDK from js/firebase.js.
 */
import {
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    getDocsFromServer,
    query,
    orderBy,
    limit,
    serverTimestamp,
} from "firebase/firestore";
import crypto from "crypto";
import { db } from "../../js/firebase.js";
import { getAdminFirestore, isServerSide, adminServerTimestamp } from "../database/firestoreAdmin.js";
import { LEGACY_COLLECTIONS } from "../database/schema.js";

/** True when Firestore DB is missing, wrong project, or backend unreachable. */
export function isFirestoreUnavailableError(err) {
    if (!err) return false;
    const code = err.code;
    const msg = String(err.message || err);
    if (code === "not-found" || code === 5) return true;
    if (/NOT_FOUND/i.test(msg)) return true;
    if (/Could not reach Cloud Firestore backend/i.test(msg)) return true;
    if (/database.*does not exist/i.test(msg)) return true;
    return false;
}

function toIso(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (value.toDate) return value.toDate().toISOString();
    if (value.toDate?.()) return value.toDate().toISOString();
    return null;
}

function adminDb() {
    return isServerSide() ? getAdminFirestore() : null;
}

async function adminGetDoc(path) {
    const snap = await adminDb().doc(path).get();
    return { exists: snap.exists, id: snap.id, data: () => snap.data() };
}

async function adminSetDoc(path, data, merge = false) {
    await adminDb().doc(path).set(data, { merge });
}

async function adminAddDoc(collectionPath, data) {
    const ref = await adminDb().collection(collectionPath).add(data);
    return { id: ref.id };
}

async function adminQuery(collectionPath, orderField, orderDir, max) {
    const snap = await adminDb()
        .collection(collectionPath)
        .orderBy(orderField, orderDir)
        .limit(max)
        .get();
    return snap.docs.map((d) => ({ id: d.id, data: () => d.data() }));
}

function processedInboundDocId(externalId) {
    return crypto.createHash("sha256").update(String(externalId)).digest("hex");
}

const PROCESSED_INBOUND_COLLECTION = "_processedInbound";

function buildMessagePayload(role, message, options, ts) {
    const payload = { role, message, createdAt: ts };
    if (options.externalId) payload.externalId = options.externalId;
    if (options.channel) payload.channel = options.channel;
    if (options.companyId) payload.companyId = options.companyId;
    if (options.name) payload.name = options.name;
    return payload;
}

export const firestoreAdapter = {
    name: "firestore",

    async ping() {
        try {
            const admin = adminDb();
            if (admin) {
                await admin.collection("_healthcheck").limit(1).get();
                return true;
            }
            const q = query(collection(db, "_healthcheck"), limit(1));
            await getDocsFromServer(q);
            return true;
        } catch (err) {
            if (isFirestoreUnavailableError(err)) {
                const wrapped = new Error(
                    `Firestore database not available (create it in Firebase Console → Firestore): ${err.message}`
                );
                wrapped.code = err.code || "not-found";
                throw wrapped;
            }
            throw err;
        }
    },

    async isMessageProcessed(externalId) {
        if (!externalId) return false;
        const docId = processedInboundDocId(externalId);
        const admin = adminDb();
        let data = null;
        if (admin) {
            const snap = await adminGetDoc(`${PROCESSED_INBOUND_COLLECTION}/${docId}`);
            if (!snap.exists) return false;
            data = snap.data();
        } else {
            const snap = await getDoc(doc(db, PROCESSED_INBOUND_COLLECTION, docId));
            if (!snap.exists()) return false;
            data = snap.data();
        }
        return Boolean(data?.processedAt || data?.status === "completed");
    },

    async tryClaimInboundMessage(externalId) {
        if (!externalId) return true;
        if (await this.isMessageProcessed(externalId)) return false;
        const docId = processedInboundDocId(externalId);
        const payload = {
            externalId: String(externalId),
            status: "claimed",
            claimedAt: new Date().toISOString(),
        };
        const admin = adminDb();
        if (admin) {
            const snap = await adminGetDoc(`${PROCESSED_INBOUND_COLLECTION}/${docId}`);
            if (snap.exists) {
                const data = snap.data();
                if (data?.processedAt || data?.status === "completed" || data?.status === "claimed") {
                    return false;
                }
            }
            await adminSetDoc(`${PROCESSED_INBOUND_COLLECTION}/${docId}`, payload, true);
            return true;
        }
        const ref = doc(db, PROCESSED_INBOUND_COLLECTION, docId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            if (data?.processedAt || data?.status === "completed" || data?.status === "claimed") {
                return false;
            }
        }
        await setDoc(ref, payload, { merge: true });
        return true;
    },

    async releaseInboundClaim(externalId) {
        if (!externalId) return null;
        const docId = processedInboundDocId(externalId);
        const admin = adminDb();
        if (admin) {
            const snap = await adminGetDoc(`${PROCESSED_INBOUND_COLLECTION}/${docId}`);
            if (!snap.exists) return null;
            const data = snap.data();
            if (data?.processedAt || data?.status === "completed") return null;
            await adminSetDoc(`${PROCESSED_INBOUND_COLLECTION}/${docId}`, { status: "released" }, true);
            return true;
        }
        const ref = doc(db, PROCESSED_INBOUND_COLLECTION, docId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data();
        if (data?.processedAt || data?.status === "completed") return null;
        await setDoc(ref, { status: "released" }, { merge: true });
        return true;
    },

    async markMessageProcessed(externalId, meta = {}) {
        if (!externalId) return null;
        const docId = processedInboundDocId(externalId);
        const payload = {
            externalId: String(externalId),
            status: "completed",
            processedAt: new Date().toISOString(),
            ...meta,
        };
        const admin = adminDb();
        if (admin) {
            await adminSetDoc(`${PROCESSED_INBOUND_COLLECTION}/${docId}`, payload, false);
            return payload;
        }
        await setDoc(doc(db, PROCESSED_INBOUND_COLLECTION, docId), payload);
        return payload;
    },

    async saveMessage(phone, role, message, options = {}) {
        const adminFirestore = adminDb();
        const ts = adminFirestore ? adminServerTimestamp() : serverTimestamp();
        const msgPayload = buildMessagePayload(role, message, options, ts);

        if (adminFirestore) {
            await adminAddDoc(`${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}/messages`, msgPayload);
            const existing = await adminGetDoc(`${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`);
            const prev = existing.exists ? existing.data() : {};
            const customerPatch = {
                phone,
                lastMessage: message,
                lastSeen: ts,
                status: "in_progress",
                mode: "ai",
                channel: "whatsapp",
                totalMessages: (prev.totalMessages || 0) + 1,
            };
            if (options.name) customerPatch.name = options.name;
            await adminSetDoc(`${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`, customerPatch, true);
            return { phone, role };
        }

        await addDoc(collection(db, "customers", phone, "messages"), msgPayload);

        const customerPatch = {
            phone,
            lastMessage: message,
            lastSeen: serverTimestamp(),
            status: "in_progress",
            mode: "ai",
            channel: "whatsapp",
        };
        if (options.name) customerPatch.name = options.name;

        const existing = await getDoc(doc(db, "customers", phone));
        const prev = existing.exists() ? existing.data() : {};
        customerPatch.totalMessages = (prev.totalMessages || 0) + 1;

        await setDoc(doc(db, "customers", phone), customerPatch, { merge: true });
        return { phone, role };
    },

    async getConversation(phone, max = 20) {
        const admin = adminDb();
        if (admin) {
            const docs = await adminQuery(
                `${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}/messages`,
                "createdAt",
                "desc",
                max
            );
            const history = [];
            docs.reverse().forEach((docSnap) => {
                const data = docSnap.data();
                history.push({ role: data.role, content: data.message });
            });
            return history;
        }

        const q = query(
            collection(db, "customers", phone, "messages"),
            orderBy("createdAt", "desc"),
            limit(max)
        );
        const snapshot = await getDocs(q);
        const history = [];
        snapshot.forEach((docSnap) => {
            history.unshift({
                role: docSnap.data().role,
                content: docSnap.data().message,
            });
        });
        return history;
    },

    async listConversations({ companyId = null, limit: max = 50 } = {}) {
        const admin = adminDb();
        let items = [];

        if (admin) {
            const docs = await adminQuery(LEGACY_COLLECTIONS.CUSTOMERS, "lastSeen", "desc", max);
            items = docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    phone: data.phone || docSnap.id,
                    name: data.name || docSnap.id,
                    customerName: data.name || docSnap.id,
                    companyId: data.companyId || null,
                    lastMessage: data.lastMessage || "",
                    preview: data.lastMessage || "",
                    status: data.status || "in_progress",
                    mode: data.mode || "ai",
                    channel: data.channel || "whatsapp",
                    time: toIso(data.lastSeen),
                    leadScore: data.leadScore ?? null,
                    tags: data.tags || [],
                };
            });
        } else {
            const q = query(collection(db, "customers"), orderBy("lastSeen", "desc"), limit(max));
            const snapshot = await getDocs(q);
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                items.push({
                    id: docSnap.id,
                    phone: data.phone || docSnap.id,
                    name: data.name || docSnap.id,
                    customerName: data.name || docSnap.id,
                    companyId: data.companyId || null,
                    lastMessage: data.lastMessage || "",
                    preview: data.lastMessage || "",
                    status: data.status || "in_progress",
                    mode: data.mode || "ai",
                    channel: data.channel || "whatsapp",
                    time: toIso(data.lastSeen),
                    leadScore: data.leadScore ?? null,
                    tags: data.tags || [],
                });
            });
        }

        return companyId ? items.filter((c) => c.companyId === companyId) : items;
    },

    async upsertCustomer(phone, patch = {}) {
        const adminFirestore = adminDb();
        const ts = adminFirestore ? adminServerTimestamp() : serverTimestamp();

        if (adminFirestore) {
            const payload = {
                phone,
                ...patch,
                lastSeen: patch.lastSeen ?? ts,
                updatedAt: ts,
            };
            await adminSetDoc(`${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`, payload, true);
            const snap = await adminGetDoc(`${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`);
            return snap.exists ? { id: snap.id, ...snap.data() } : { phone, ...patch };
        }

        const ref = doc(db, "customers", phone);
        const payload = {
            phone,
            ...patch,
            lastSeen: patch.lastSeen ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        await setDoc(ref, payload, { merge: true });
        const snap = await getDoc(ref);
        return snap.exists() ? { id: snap.id, ...snap.data() } : { phone, ...patch };
    },

    async getCustomer(phone) {
        const admin = adminDb();
        if (admin) {
            const snap = await adminGetDoc(`${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`);
            if (!snap.exists) return null;
            return { id: snap.id, ...snap.data() };
        }
        const snap = await getDoc(doc(db, "customers", phone));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    },

    async listCustomers({ companyId = null, limit: max = 100 } = {}) {
        const admin = adminDb();
        let items = [];

        if (admin) {
            const docs = await adminQuery(LEGACY_COLLECTIONS.CUSTOMERS, "lastSeen", "desc", max);
            items = docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    phone: data.phone || docSnap.id,
                    name: data.name || docSnap.id,
                    email: data.email || "",
                    companyId: data.companyId || null,
                    companyName: data.companyName || null,
                    leadScore: data.leadScore ?? null,
                    averageSentiment: data.averageSentiment ?? null,
                    sentimentLabel: data.sentimentLabel || data.averageSentiment || null,
                    lastSeen: toIso(data.lastSeen),
                    tags: data.tags || [],
                    status: data.status || "in_progress",
                    online: data.online ?? false,
                    assignedAiEmployee: data.assignedAiEmployee || null,
                    lastMessage: data.lastMessage || "",
                };
            });
        } else {
            const q = query(collection(db, "customers"), orderBy("lastSeen", "desc"), limit(max));
            const snapshot = await getDocs(q);
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                items.push({
                    id: docSnap.id,
                    phone: data.phone || docSnap.id,
                    name: data.name || docSnap.id,
                    email: data.email || "",
                    companyId: data.companyId || null,
                    companyName: data.companyName || null,
                    leadScore: data.leadScore ?? null,
                    averageSentiment: data.averageSentiment ?? null,
                    sentimentLabel: data.sentimentLabel || data.averageSentiment || null,
                    lastSeen: toIso(data.lastSeen),
                    tags: data.tags || [],
                    status: data.status || "in_progress",
                    online: data.online ?? false,
                    assignedAiEmployee: data.assignedAiEmployee || null,
                    lastMessage: data.lastMessage || "",
                });
            });
        }

        return companyId ? items.filter((c) => c.companyId === companyId) : items;
    },

    async updateCustomer(phone, patch = {}) {
        return firestoreAdapter.upsertCustomer(phone, patch);
    },

    async saveMemory(customerId, agentId, fact) {
        const adminFirestore = adminDb();
        const ts = adminFirestore ? adminServerTimestamp() : serverTimestamp();

        if (adminFirestore) {
            const ref = await adminAddDoc(LEGACY_COLLECTIONS.MEMORIES, {
                customerId,
                agentId: agentId || "default",
                fact,
                createdAt: ts,
            });
            return { id: ref.id, customerId, agentId, fact };
        }

        const ref = await addDoc(collection(db, "memories"), {
            customerId,
            agentId: agentId || "default",
            fact,
            createdAt: serverTimestamp(),
        });
        return { id: ref.id, customerId, agentId, fact };
    },

    async getMemories(customerId, agentId) {
        const admin = adminDb();
        let items = [];

        if (admin) {
            const docs = await adminQuery(LEGACY_COLLECTIONS.MEMORIES, "createdAt", "desc", 50);
            docs.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.customerId !== customerId) return;
                if (agentId && data.agentId !== agentId) return;
                items.push({ id: docSnap.id, ...data });
            });
        } else {
            const q = query(collection(db, "memories"), orderBy("createdAt", "desc"), limit(50));
            const snapshot = await getDocs(q);
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.customerId !== customerId) return;
                if (agentId && data.agentId !== agentId) return;
                items.push({ id: docSnap.id, ...data });
            });
        }

        return items;
    },

    async saveConversationAnalysis(phone, analysis) {
        const adminFirestore = adminDb();
        const ts = adminFirestore ? adminServerTimestamp() : serverTimestamp();

        if (adminFirestore) {
            await adminSetDoc(
                `${LEGACY_COLLECTIONS.CUSTOMERS}/${phone}`,
                {
                    lastAnalysis: analysis,
                    averageSentiment: analysis.sentiment ?? null,
                    updatedAt: ts,
                },
                true
            );
            return analysis;
        }

        await setDoc(
            doc(db, "customers", phone),
            {
                lastAnalysis: analysis,
                averageSentiment: analysis.sentiment ?? null,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        return analysis;
    },
};
