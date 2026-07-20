import {
  createDocument,
  listDocuments,
  updateDocument,
} from './firestore-base.js';

const BILLING = 'billing';

export async function listBilling(companyId) {
  return listDocuments(BILLING, {
    companyId,
    orderByField: 'renewalDate',
  });
}

export async function createBillingRecord(data) {
  return createDocument(BILLING, {
    companyId: data.companyId,
    plan: data.plan || 'business',
    amount: Number(data.amount || 0),
    currency: data.currency || 'ZAR',
    status: data.status || 'active',
    cycle: data.cycle || 'monthly',
    renewalDate: data.renewalDate || null,
    paymentStatus: data.paymentStatus || 'pending',
    invoices: data.invoices || [],
  });
}

export async function updateBillingRecord(id, data) {
  return updateDocument(BILLING, id, data);
}
