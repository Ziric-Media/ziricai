import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase.js';

export { db, serverTimestamp };

export function collectionRef(name) {
  return collection(db, name);
}

export async function listDocuments(name, options = {}) {
  try {
    const constraints = [];
    if (options.companyId) {
      constraints.push(where('companyId', '==', options.companyId));
    }
    if (options.orderByField) {
      constraints.push(orderBy(options.orderByField, options.orderDirection || 'desc'));
    }

    const q = constraints.length
      ? query(collection(db, name), ...constraints)
      : collection(db, name);

    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { items };
  } catch (error) {
    console.error(`listDocuments(${name}) failed:`, error);
    return { items: [], error: error.message };
  }
}

export async function getDocument(name, id) {
  try {
    const snapshot = await getDoc(doc(db, name, id));
    if (!snapshot.exists()) return { error: 'Document not found' };
    return { item: { id: snapshot.id, ...snapshot.data() } };
  } catch (error) {
    return { error: error.message };
  }
}

export async function createDocument(name, data, id) {
  try {
    const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    if (id) {
      await setDoc(doc(db, name, id), payload);
      return { id, item: { id, ...data } };
    }
    const ref = await addDoc(collection(db, name), payload);
    return { id: ref.id, item: { id: ref.id, ...data } };
  } catch (error) {
    return { error: error.message };
  }
}

export async function updateDocument(name, id, data) {
  try {
    await updateDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp() });
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

export async function removeDocument(name, id) {
  try {
    await deleteDoc(doc(db, name, id));
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

export async function countCollection(name, companyId) {
  const { items, error } = await listDocuments(name, { companyId });
  if (error) return { count: 0, error };
  return { count: items.length };
}
