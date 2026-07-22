/**
 * Legacy flat-collection Firestore adapter (root customers, agents, memories).
 * @deprecated New tenant writes must use TenantRepository via services/tenants/*.
 * Retained for WhatsApp webhook pipeline until Phase 4 cutover.
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
import { db } from "../../js/firebase.js";

function toIso(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (value.toDate) return value.toDate().toISOString();
    return null;
}

export const firestoreAdapter = {
    name: "firestore",

    async ping() {
        const q = query(collection(db, "customers"), limit(1));
        await getDocsFromServer(q);
        return true;
    },

    async saveMessage(phone, role, message, options = {}) {
        await addDoc(collection(db, "customers", phone, "messages"), {
            role,
            message,
            createdAt: serverTimestamp(),
        });

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
        const q = query(collection(db, "customers"), orderBy("lastSeen", "desc"), limit(max));
        const snapshot = await getDocs(q);
        const items = [];
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
        return companyId ? items.filter((c) => c.companyId === companyId) : items;
    },

    async upsertCustomer(phone, patch = {}) {
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
        const snap = await getDoc(doc(db, "customers", phone));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    },

    async listCustomers({ companyId = null, limit: max = 100 } = {}) {
        const q = query(collection(db, "customers"), orderBy("lastSeen", "desc"), limit(max));
        const snapshot = await getDocs(q);
        const items = [];
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
        return companyId ? items.filter((c) => c.companyId === companyId) : items;
    },

    async updateCustomer(phone, patch = {}) {
        return firestoreAdapter.upsertCustomer(phone, patch);
    },

    async saveMemory(customerId, agentId, fact) {
        const ref = await addDoc(collection(db, "memories"), {
            customerId,
            agentId: agentId || "default",
            fact,
            createdAt: serverTimestamp(),
        });
        return { id: ref.id, customerId, agentId, fact };
    },

    async getMemories(customerId, agentId) {
        const q = query(
            collection(db, "memories"),
            orderBy("createdAt", "desc"),
            limit(50)
        );
        const snapshot = await getDocs(q);
        const items = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.customerId !== customerId) return;
            if (agentId && data.agentId !== agentId) return;
            items.push({ id: docSnap.id, ...data });
        });
        return items;
    },

    async saveConversationAnalysis(phone, analysis) {
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
