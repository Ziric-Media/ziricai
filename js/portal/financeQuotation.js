/** Quotations reuse financeInvoices with a notes marker (no separate collection in v1). */

export const QUOTATION_NOTES_MARKER = '__DOC:quotation__';

export function isFinanceQuotation(invoice) {
  if (!invoice) return false;
  const notes = String(invoice.notes || '');
  return notes.startsWith(QUOTATION_NOTES_MARKER);
}

export function stripQuotationNotes(notes) {
  const raw = String(notes || '');
  if (!raw.startsWith(QUOTATION_NOTES_MARKER)) return raw;
  return raw.slice(QUOTATION_NOTES_MARKER.length).replace(/^\n/, '');
}

export function markQuotationNotes(userNotes) {
  const body = String(userNotes || '').trim();
  return body ? `${QUOTATION_NOTES_MARKER}\n${body}` : QUOTATION_NOTES_MARKER;
}

export function listQuotations(invoices) {
  return (invoices || []).filter((inv) => isFinanceQuotation(inv) && inv.status !== 'void');
}
