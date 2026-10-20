import { toMinorUnits, addMinor, currencyExponent } from "./money.js";

const FORBIDDEN_LINE_ITEM_KEYS = new Set([
    "unitAmountMinor",
    "lineTotalMinor",
    "subtotalMinor",
    "totalMinor",
    "amountPaidMinor",
    "taxAmountMinor",
]);

/**
 * Client line items: description, quantity, unitAmount (major units only).
 * @param {Array<{ description?: string, quantity?: number, unitAmount?: number }>} lineItems
 * @param {string} currency
 */
export function computeInvoiceLineItems(lineItems, currency) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw Object.assign(new Error("lineItems must be a non-empty array"), {
            code: "FINANCE_INVOICE_CREATE_INVALID",
        });
    }
    const normalized = [];
    let subtotalMinor = 0;
    for (const raw of lineItems) {
        if (raw && typeof raw === "object") {
            for (const key of Object.keys(raw)) {
                if (FORBIDDEN_LINE_ITEM_KEYS.has(key)) {
                    throw Object.assign(new Error(`Line item field not allowed: ${key}`), {
                        code: "FINANCE_INVOICE_CREATE_FORBIDDEN",
                    });
                }
            }
        }
        const description = String(raw?.description || "").trim();
        if (!description) {
            throw Object.assign(new Error("Each line item requires description"), {
                code: "FINANCE_INVOICE_CREATE_INVALID",
            });
        }
        const qty = Number(raw?.quantity ?? 1);
        if (!Number.isFinite(qty) || qty <= 0) {
            throw Object.assign(new Error("Invalid line item quantity"), {
                code: "FINANCE_INVOICE_CREATE_INVALID",
            });
        }
        if (raw?.unitAmount == null || raw.unitAmount === "") {
            throw Object.assign(new Error("Each line item requires unitAmount (major units)"), {
                code: "FINANCE_INVOICE_CREATE_INVALID",
            });
        }
        const unitMinor = toMinorUnits(raw.unitAmount, currency);
        const lineTotalMinor = Math.round(unitMinor * qty);
        if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor < 0) {
            throw Object.assign(new Error("Invalid line total"), { code: "FINANCE_INVOICE_CREATE_INVALID" });
        }
        subtotalMinor = addMinor(subtotalMinor, lineTotalMinor);
        normalized.push({
            description,
            quantity: qty,
            unitAmountMinor: unitMinor,
            lineTotalMinor,
        });
    }
    return { lineItems: normalized, subtotalMinor, currencyExponent: currencyExponent(currency) };
}

export function computeInvoiceTotals(subtotalMinor, taxAmountMinor = 0) {
    const tax = Number(taxAmountMinor) || 0;
    if (!Number.isSafeInteger(tax) || tax < 0) {
        throw Object.assign(new Error("Invalid tax amount"), { code: "FINANCE_INVOICE_CREATE_INVALID" });
    }
    const totalMinor = addMinor(subtotalMinor, tax);
    return { subtotalMinor, taxAmountMinor: tax, totalMinor };
}
