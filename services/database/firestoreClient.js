/**
 * Unified Firestore client for tenant services.
 * Browser: Firebase client SDK (js/firebase.js).
 * Railway/server: Firebase Admin SDK when credentials are configured.
 */
import {
    collection,
    doc,
    getDoc as clientGetDoc,
    getDocs as clientGetDocs,
    setDoc as clientSetDoc,
    addDoc as clientAddDoc,
    updateDoc as clientUpdateDoc,
    deleteDoc as clientDeleteDoc,
    query as clientQuery,
    where,
    orderBy,
    limit,
    startAfter,
    serverTimestamp as clientServerTimestamp,
} from "firebase/firestore";
import { db } from "../../js/firebase.js";
import { ROOT, tenantCollectionPath } from "./schema.js";
import {
    getAdminFirestore,
    hasAdminCredentials,
    isServerSide,
    adminServerTimestamp,
} from "./firestoreAdmin.js";

export function useAdminBackend() {
    return isServerSide() && Boolean(getAdminFirestore());
}

function normalizeSnap(snap) {
    return {
        exists: () => snap.exists,
        id: snap.id,
        data: () => snap.data(),
    };
}

function normalizeQuerySnap(snapshot) {
    const docs = snapshot.docs.map((d) => ({
        id: d.id,
        data: () => d.data(),
        exists: () => d.exists,
    }));
    return {
        empty: snapshot.empty,
        size: snapshot.size,
        docs,
        forEach: (fn) => docs.forEach((d) => fn({ id: d.id, data: d.data, exists: d.exists })),
    };
}

/** Plain application-level query constraint descriptors (portable Web SDK + Admin SDK). */
export function queryWhere(field, op, value) {
    return { type: "where", field, op, value };
}

export function queryOrderBy(field, direction = "asc") {
    return { type: "orderBy", field, direction };
}

export function queryLimit(value) {
    return { type: "limit", value };
}

export function queryStartAfter(cursorRef) {
    return { type: "startAfter", cursorRef };
}

function isDescriptorQuery(q) {
    return Boolean(q?.collectionRef && Array.isArray(q.constraints));
}

async function buildAdminQuery(collectionRef, constraints) {
    let q = collectionRef.__adminCol;
    for (const c of constraints) {
        if (!c?.type) continue;
        switch (c.type) {
            case "where":
                q = q.where(c.field, c.op, c.value);
                break;
            case "orderBy":
                q = q.orderBy(c.field, c.direction || "asc");
                break;
            case "limit":
                q = q.limit(c.value);
                break;
            case "startAfter": {
                const cursorRef = c.cursorRef;
                if (!cursorRef?.__admin) break;
                const snap = await cursorRef.__admin.get();
                if (snap.exists) q = q.startAfter(snap);
                break;
            }
            default:
                break;
        }
    }
    return q;
}

async function buildClientConstraints(constraints) {
    const out = [];
    for (const c of constraints) {
        if (!c?.type) continue;
        switch (c.type) {
            case "where":
                out.push(where(c.field, c.op, c.value));
                break;
            case "orderBy":
                out.push(orderBy(c.field, c.direction || "asc"));
                break;
            case "limit":
                out.push(limit(c.value));
                break;
            case "startAfter": {
                const cursorRef = c.cursorRef;
                if (!cursorRef || cursorRef.__admin) break;
                const snap = await clientGetDoc(cursorRef);
                if (snap.exists()) out.push(startAfter(snap));
                break;
            }
            default:
                break;
        }
    }
    return out;
}

let pingPromise = null;

export function getFirestore() {
    return useAdminBackend() ? getAdminFirestore() : db;
}

export async function pingFirestore() {
    if (!pingPromise) {
        pingPromise = (async () => {
            if (useAdminBackend()) {
                await getAdminFirestore().collection(ROOT.COMPANIES).limit(1).get();
                return true;
            }
            await clientGetDocs(clientQuery(collection(db, ROOT.COMPANIES), limit(1)));
            return true;
        })();
    }
    return pingPromise;
}

export function companyRef(companyId) {
    if (useAdminBackend()) {
        return { __path: `${ROOT.COMPANIES}/${companyId}`, __admin: getAdminFirestore().doc(`${ROOT.COMPANIES}/${companyId}`) };
    }
    return doc(db, ROOT.COMPANIES, companyId);
}

export function tenantCollectionRef(companyId, subcollection) {
    const path = `${ROOT.COMPANIES}/${companyId}/${subcollection}`;
    if (useAdminBackend()) {
        return { __path: path, __adminCol: getAdminFirestore().collection(path) };
    }
    return collection(db, ROOT.COMPANIES, companyId, subcollection);
}

export function tenantDocRef(companyId, subcollection, docId) {
    const path = `${ROOT.COMPANIES}/${companyId}/${subcollection}/${docId}`;
    if (useAdminBackend()) {
        return { __path: path, __admin: getAdminFirestore().doc(path), id: docId };
    }
    return doc(db, ROOT.COMPANIES, companyId, subcollection, docId);
}

export function globalUserRef(uid) {
    const path = `${ROOT.USERS}/${uid}`;
    if (useAdminBackend()) {
        return { __path: path, __admin: getAdminFirestore().doc(path), id: uid };
    }
    return doc(db, ROOT.USERS, uid);
}

export async function getDoc(ref) {
    if (ref?.__admin) {
        return normalizeSnap(await ref.__admin.get());
    }
    return clientGetDoc(ref);
}

export async function getDocs(q) {
    if (isDescriptorQuery(q)) {
        if (q.collectionRef?.__adminCol) {
            const adminQ = await buildAdminQuery(q.collectionRef, q.constraints || []);
            return normalizeQuerySnap(await adminQ.get());
        }
        const clientConstraints = await buildClientConstraints(q.constraints || []);
        return clientGetDocs(clientQuery(q.collectionRef, ...clientConstraints));
    }
    if (q?.__adminCol) {
        const adminQ = await buildAdminQuery({ __adminCol: q.__adminCol }, q.constraints || []);
        return normalizeQuerySnap(await adminQ.get());
    }
    return clientGetDocs(q);
}

export function query(collectionRef, ...constraints) {
    return { collectionRef, constraints };
}

export async function setDoc(ref, data, options = {}) {
    if (ref?.__admin) {
        await ref.__admin.set(data, options);
        return;
    }
    return clientSetDoc(ref, data, options);
}

export async function addDoc(collectionRef, data) {
    if (collectionRef?.__adminCol) {
        const docRef = await collectionRef.__adminCol.add(data);
        return { id: docRef.id, path: docRef.path };
    }
    return clientAddDoc(collectionRef, data);
}

export async function updateDoc(ref, data) {
    if (ref?.__admin) {
        await ref.__admin.update(data);
        return;
    }
    return clientUpdateDoc(ref, data);
}

export async function deleteDoc(ref) {
    if (ref?.__admin) {
        await ref.__admin.delete();
        return;
    }
    return clientDeleteDoc(ref);
}

export function serverTimestamp() {
    if (useAdminBackend()) {
        return adminServerTimestamp();
    }
    return clientServerTimestamp();
}

export { hasAdminCredentials, isServerSide };

export {
    collection,
    doc,
    where,
    orderBy,
    limit,
    startAfter,
    tenantCollectionPath,
};
