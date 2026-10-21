/**
 * Finance v1 API — workspace ledger (not subscription billing).
 * All mutations go through *ForAccess services + financePermissionPolicy.
 */
import { requireAuthenticatedTenantMember } from "../core/tenantContext.js";
import { checkPermission } from "../auth/permissionsService.js";
import {
    listFinanceTransactionsForAccess,
    getFinanceTransactionForAccess,
    createFinanceTransactionForAccess,
    updateFinanceTransactionForAccess,
    voidFinanceTransactionForAccess,
} from "../finance/financeTransactionService.js";
import {
    listFinanceInvoicesForAccess,
    getFinanceInvoiceForAccess,
    createFinanceInvoiceForAccess,
    updateFinanceInvoiceForAccess,
    voidFinanceInvoiceForAccess,
    recordInvoicePaymentForAccess,
} from "../finance/financeInvoiceService.js";
import {
    listFinanceCategoriesForAccess,
    createFinanceCategoryForAccess,
    updateFinanceCategoryForAccess,
} from "../finance/financeCategoryService.js";
import {
    listFinanceGlAccountsForAccess,
    createFinanceGlAccountForAccess,
} from "../finance/financeGlAccountService.js";
import {
    listFinanceJournalEntriesForAccess,
    createFinanceJournalEntryForAccess,
    getFinanceJournalEntryForAccess,
} from "../finance/financeJournalService.js";

function financeAccess(req) {
    return { role: req.tenant?.role, uid: req.tenant?.uid ?? null };
}

function financeError(res, err, logLabel) {
    console.error(`[${logLabel}] error:`, err.message);
    const status = err.status || 500;
    res.status(status).json({
        error: err.message || "Finance request failed",
        code: err.code || "FINANCE_ERROR",
    });
}

/**
 * @param {import('express').Express} app
 * @param {string} basePath — includes :companyId (portal or companies alias)
 */
function mountFinanceRouteTree(app, basePath) {
    const txList = `${basePath}/transactions`;
    const txItem = `${basePath}/transactions/:transactionId`;
    const txVoid = `${basePath}/transactions/:transactionId/void`;
    const invList = `${basePath}/invoices`;
    const invItem = `${basePath}/invoices/:invoiceId`;
    const invVoid = `${basePath}/invoices/:invoiceId/void`;
    const invPay = `${basePath}/invoices/:invoiceId/payments`;
    const catList = `${basePath}/categories`;
    const catItem = `${basePath}/categories/:categoryId`;
    const glList = `${basePath}/gl-accounts`;
    const journalList = `${basePath}/journal-entries`;
    const journalItem = `${basePath}/journal-entries/:entryId`;

    app.get(txList, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const items = await listFinanceTransactionsForAccess(companyId, financeAccess(req), {
                max: parseInt(req.query.limit || "100", 10),
            });
            res.json({ items, companyId });
        } catch (err) {
            financeError(res, err, "finance/transactions GET");
        }
    });

    app.post(txList, requireAuthenticatedTenantMember(), checkPermission("canCreateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const transaction = await createFinanceTransactionForAccess(companyId, financeAccess(req), req.body || {});
            res.status(201).json({ transaction });
        } catch (err) {
            financeError(res, err, "finance/transactions POST");
        }
    });

    app.get(txItem, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const transaction = await getFinanceTransactionForAccess(
                companyId,
                req.params.transactionId,
                financeAccess(req)
            );
            if (!transaction) {
                return res.status(404).json({ error: "Transaction not found", code: "FINANCE_TRANSACTION_NOT_FOUND" });
            }
            res.json({ transaction });
        } catch (err) {
            financeError(res, err, "finance/transactions/:id GET");
        }
    });

    app.patch(txItem, requireAuthenticatedTenantMember(), checkPermission("canUpdateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const transaction = await updateFinanceTransactionForAccess(
                companyId,
                req.params.transactionId,
                financeAccess(req),
                req.body || {}
            );
            if (!transaction) {
                return res.status(404).json({ error: "Transaction not found", code: "FINANCE_TRANSACTION_NOT_FOUND" });
            }
            res.json({ transaction });
        } catch (err) {
            financeError(res, err, "finance/transactions/:id PATCH");
        }
    });

    app.post(txVoid, requireAuthenticatedTenantMember(), checkPermission("canVoidFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const voidReason = req.body?.voidReason;
            const transaction = await voidFinanceTransactionForAccess(
                companyId,
                req.params.transactionId,
                financeAccess(req),
                { voidReason }
            );
            if (!transaction) {
                return res.status(404).json({ error: "Transaction not found", code: "FINANCE_TRANSACTION_NOT_FOUND" });
            }
            res.json({ transaction });
        } catch (err) {
            financeError(res, err, "finance/transactions/:id/void POST");
        }
    });

    app.get(invList, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const items = await listFinanceInvoicesForAccess(companyId, financeAccess(req), {
                max: parseInt(req.query.limit || "100", 10),
            });
            res.json({ items, companyId });
        } catch (err) {
            financeError(res, err, "finance/invoices GET");
        }
    });

    app.post(invList, requireAuthenticatedTenantMember(), checkPermission("canCreateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const invoice = await createFinanceInvoiceForAccess(companyId, financeAccess(req), req.body || {});
            res.status(201).json({ invoice });
        } catch (err) {
            financeError(res, err, "finance/invoices POST");
        }
    });

    app.get(invItem, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const invoice = await getFinanceInvoiceForAccess(companyId, req.params.invoiceId, financeAccess(req));
            if (!invoice) {
                return res.status(404).json({ error: "Invoice not found", code: "FINANCE_INVOICE_NOT_FOUND" });
            }
            res.json({ invoice });
        } catch (err) {
            financeError(res, err, "finance/invoices/:id GET");
        }
    });

    app.patch(invItem, requireAuthenticatedTenantMember(), checkPermission("canUpdateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const invoice = await updateFinanceInvoiceForAccess(
                companyId,
                req.params.invoiceId,
                financeAccess(req),
                req.body || {}
            );
            if (!invoice) {
                return res.status(404).json({ error: "Invoice not found", code: "FINANCE_INVOICE_NOT_FOUND" });
            }
            res.json({ invoice });
        } catch (err) {
            financeError(res, err, "finance/invoices/:id PATCH");
        }
    });

    app.post(invVoid, requireAuthenticatedTenantMember(), checkPermission("canVoidFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const voidReason = req.body?.voidReason;
            const invoice = await voidFinanceInvoiceForAccess(
                companyId,
                req.params.invoiceId,
                financeAccess(req),
                { voidReason }
            );
            if (!invoice) {
                return res.status(404).json({ error: "Invoice not found", code: "FINANCE_INVOICE_NOT_FOUND" });
            }
            res.json({ invoice });
        } catch (err) {
            financeError(res, err, "finance/invoices/:id/void POST");
        }
    });

    app.post(invPay, requireAuthenticatedTenantMember(), checkPermission("canCreateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const body = req.body || {};
            const result = await recordInvoicePaymentForAccess(
                companyId,
                financeAccess(req),
                req.params.invoiceId,
                body
            );
            res.status(result.idempotentReplay ? 200 : 201).json(result);
        } catch (err) {
            financeError(res, err, "finance/invoices/:id/payments POST");
        }
    });

    app.get(catList, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const items = await listFinanceCategoriesForAccess(companyId, financeAccess(req));
            res.json({ items, companyId });
        } catch (err) {
            financeError(res, err, "finance/categories GET");
        }
    });

    app.post(catList, requireAuthenticatedTenantMember(), checkPermission("canCreateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const category = await createFinanceCategoryForAccess(companyId, financeAccess(req), req.body || {});
            res.status(201).json({ category });
        } catch (err) {
            financeError(res, err, "finance/categories POST");
        }
    });

    app.patch(catItem, requireAuthenticatedTenantMember(), checkPermission("canUpdateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const category = await updateFinanceCategoryForAccess(
                companyId,
                req.params.categoryId,
                financeAccess(req),
                req.body || {}
            );
            if (!category) {
                return res.status(404).json({ error: "Category not found", code: "FINANCE_CATEGORY_NOT_FOUND" });
            }
            res.json({ category });
        } catch (err) {
            financeError(res, err, "finance/categories/:id PATCH");
        }
    });

    app.get(glList, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const items = await listFinanceGlAccountsForAccess(companyId, financeAccess(req));
            res.json({ items, companyId });
        } catch (err) {
            financeError(res, err, "finance/gl-accounts GET");
        }
    });

    app.post(glList, requireAuthenticatedTenantMember(), checkPermission("canCreateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const account = await createFinanceGlAccountForAccess(companyId, financeAccess(req), req.body || {});
            res.status(201).json({ account });
        } catch (err) {
            financeError(res, err, "finance/gl-accounts POST");
        }
    });

    app.get(journalList, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const items = await listFinanceJournalEntriesForAccess(companyId, financeAccess(req), {
                max: parseInt(req.query.limit || "100", 10),
            });
            res.json({ items, companyId });
        } catch (err) {
            financeError(res, err, "finance/journal-entries GET");
        }
    });

    app.post(journalList, requireAuthenticatedTenantMember(), checkPermission("canCreateFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const entry = await createFinanceJournalEntryForAccess(companyId, financeAccess(req), req.body || {});
            res.status(201).json({ entry });
        } catch (err) {
            financeError(res, err, "finance/journal-entries POST");
        }
    });

    app.get(journalItem, requireAuthenticatedTenantMember(), checkPermission("canViewFinance"), async (req, res) => {
        try {
            const companyId = req.params.companyId;
            const entry = await getFinanceJournalEntryForAccess(
                companyId,
                req.params.entryId,
                financeAccess(req)
            );
            if (!entry) {
                return res.status(404).json({ error: "Journal entry not found", code: "FINANCE_JOURNAL_NOT_FOUND" });
            }
            res.json({ entry });
        } catch (err) {
            financeError(res, err, "finance/journal-entries/:id GET");
        }
    });
}

/**
 * @param {import('express').Express} app
 */
export function mountFinanceRoutes(app) {
    mountFinanceRouteTree(app, "/api/portal/finance/:companyId");
    mountFinanceRouteTree(app, "/api/companies/:companyId/finance");
}
