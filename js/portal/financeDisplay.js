/**
 * Display helpers for workspace finance (server stores amountMinor).
 */

const CURRENCY_EXPONENT = { ZAR: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0 };
const DEFAULT_EXP = 2;

export function currencyExponent(currency) {
  const c = String(currency || "ZAR").trim().toUpperCase();
  return CURRENCY_EXPONENT[c] ?? DEFAULT_EXP;
}

export function minorToMajor(minor, currency = "ZAR") {
  const exp = currencyExponent(currency);
  const m = Number(minor);
  if (!Number.isFinite(m)) return 0;
  return m / 10 ** exp;
}

/** Format server minor units using the record's ISO currency. */
export function formatMoneyMinor(minor, currency = "ZAR") {
  const code = String(currency || "ZAR").trim().toUpperCase();
  const major = minorToMajor(minor, code);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(major);
  } catch {
    return `${code} ${major.toFixed(currencyExponent(code))}`;
  }
}

export function formatMoneyMajor(major, currency = "ZAR") {
  const code = String(currency || "ZAR").trim().toUpperCase();
  const n = Number(major);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(n);
  } catch {
    return `${code} ${n.toFixed(currencyExponent(code))}`;
  }
}

export function invoiceBalanceMinor(invoice) {
  const total = Number(invoice?.totalMinor) || 0;
  const paid = Number(invoice?.amountPaidMinor) || 0;
  return Math.max(0, total - paid);
}

/** Client preview only — server recalculates on save (major-unit line items). */
export function previewClientInvoiceTotals(lineItems, taxAmountMajor, currency = "ZAR") {
  const code = String(currency || "ZAR").trim().toUpperCase();
  const exp = currencyExponent(code);
  let subtotalMinor = 0;
  for (const raw of lineItems || []) {
    const qty = Number(raw?.quantity ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unitMajor = Number(raw?.unitAmount);
    if (!Number.isFinite(unitMajor) || unitMajor < 0) continue;
    const unitMinor = Math.round(unitMajor * 10 ** exp);
    subtotalMinor += Math.round(unitMinor * qty);
  }
  const taxMajor = Number(taxAmountMajor) || 0;
  const taxMinor = Math.round(taxMajor * 10 ** exp);
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor, currency: code };
}

export function lineItemsForEditor(invoice, currency = "ZAR") {
  const cur = invoice?.currency || currency;
  const items = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  if (!items.length) {
    return [{ description: "", quantity: 1, unitAmount: "" }];
  }
  return items.map((li) => ({
    description: li.description || "",
    quantity: li.quantity ?? 1,
    unitAmount:
      li.unitAmountMinor != null
        ? minorToMajor(Number(li.unitAmountMinor), cur)
        : li.unitAmount ?? "",
  }));
}
