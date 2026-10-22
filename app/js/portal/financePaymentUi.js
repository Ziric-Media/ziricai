/**
 * Portal invoice payment recording (POST …/invoices/:id/payments).
 */
import { showToast } from '../admin/ui.js';
import { recordFinanceInvoicePayment } from './api.js';
import { formatMoneyMajor, invoiceBalanceMinor, minorToMajor } from './financeDisplay.js';
import { isFinanceQuotation } from './financeQuotation.js';

export function invoiceAcceptsPortalPayment(invoice) {
  if (!invoice || isFinanceQuotation(invoice)) return false;
  const st = String(invoice.status || '').toLowerCase();
  if (st === 'void' || st === 'draft' || st === 'paid') return false;
  return invoiceBalanceMinor(invoice) > 0;
}

/**
 * @param {string} companyId
 * @param {object} invoice
 * @returns {Promise<boolean>} true when a payment was posted
 */
export async function promptAndRecordInvoicePayment(companyId, invoice) {
  const cur = invoice.currency || 'ZAR';
  const balanceMajor = minorToMajor(invoiceBalanceMinor(invoice), cur);
  const defaultHint = balanceMajor.toFixed(2);
  const raw = window.prompt(
    `Payment amount (${cur}). Remaining balance: ${formatMoneyMajor(balanceMajor, cur)}`,
    defaultHint
  );
  if (raw == null || !String(raw).trim()) return false;
  const amount = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Enter a valid payment amount', 'error');
    return false;
  }
  const referenceRaw = window.prompt('Reference (optional):', '');
  const reference =
    referenceRaw != null && String(referenceRaw).trim() ? String(referenceRaw).trim() : undefined;
  try {
    await recordFinanceInvoicePayment(companyId, invoice.id, {
      amount,
      currency: cur,
      idempotencyKey: crypto.randomUUID(),
      reference,
    });
    showToast('Payment recorded', 'success');
    return true;
  } catch (e) {
    showToast(e?.message || 'Payment failed', 'error');
    return false;
  }
}
