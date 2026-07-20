/**
 * Single Firestore client init for server-side tenant services.
 * Reuses the shared Firebase app from js/firebase.js (client SDK).
 */
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../../js/firebase.js";
import { ROOT, tenantCollectionPath } from "./schema.js";

let pingPromise = null;

export function getFirestore() {
    return db;
}

export async function pingFirestore() {
    if (!pingPromise) {
        pingPromise = getDocs(query(collection(db, ROOT.COMPANIES), limit(1))).then(() => true);
    }
    return pingPromise;
}

export function companyRef(companyId) {
    return doc(db, ROOT.COMPANIES, companyId);
}

export function tenantCollectionRef(companyId, subcollection) {
    return collection(db, ROOT.COMPANIES, companyId, subcollection);
}

export function tenantDocRef(companyId, subcollection, docId) {
    return doc(db, ROOT.COMPANIES, companyId, subcollection, docId);
}

export function globalUserRef(uid) {
    return doc(db, ROOT.USERS, uid);
}

export {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    serverTimestamp,
    tenantCollectionPath,
};
