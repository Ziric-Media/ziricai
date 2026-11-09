/**
 * Mission Control — Revenue Management admin (R0 read-only + dry-run ledger).
 */
import { requirePlatformAccess } from "../auth/platformAuth.js";
import { listCatalogueSkus, getCatalogueVersionId } from "../revenue/catalogueService.js";
import { listLedgerEvents, appendLedgerEvent } from "../revenue/ledgerService.js";
import { getRevenueConfig } from "../revenue/revenueConfig.js";

/**
 * @param {import('express').Express} app
 */
export function mountPlatformRevenueRoutes(app) {
    app.get("/api/platform/revenue/config", requirePlatformAccess(), async (_req, res) => {
        try {
            const config = await getRevenueConfig();
            res.json({ config });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load revenue config" });
        }
    });

    app.get("/api/platform/revenue/catalogue", requirePlatformAccess(), async (_req, res) => {
        try {
            res.json({
                versionId: getCatalogueVersionId(),
                skus: listCatalogueSkus(false),
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load catalogue" });
        }
    });

    app.get("/api/platform/revenue/ledger", requirePlatformAccess(), async (req, res) => {
        try {
            const events = await listLedgerEvents({
                revenueStreamId: req.query.revenueStreamId,
                accountType: req.query.accountType,
                limit: req.query.limit,
            });
            res.json({ events });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list ledger" });
        }
    });

    app.post("/api/platform/revenue/ledger/dry-run", requirePlatformAccess(), async (req, res) => {
        try {
            const body = req.body || {};
            const result = await appendLedgerEvent(body, { dryRun: true });
            res.status(201).json(result);
        } catch (err) {
            res.status(500).json({ error: err.message || "Dry-run failed" });
        }
    });
}
