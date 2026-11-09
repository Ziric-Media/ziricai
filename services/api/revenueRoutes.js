/**
 * Revenue Management — consumer and public catalogue (R0).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { getConsumerEntitlements } from "../revenue/entitlementEngine.js";
import { listCatalogueSkus, getCatalogueSku, getCatalogueVersionId } from "../revenue/catalogueService.js";
import { getRevenueConfig, isCommercialActive } from "../revenue/revenueConfig.js";

/**
 * @param {import('express').Express} app
 */
export function mountRevenueRoutes(app) {
    app.get("/api/revenue/catalogue/public", async (_req, res) => {
        try {
            const skus = listCatalogueSkus(true);
            res.json({
                versionId: getCatalogueVersionId(),
                skus,
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Catalogue unavailable" });
        }
    });

    app.get("/api/revenue/catalogue/skus/:skuId", async (req, res) => {
        try {
            const sku = getCatalogueSku(req.params.skuId);
            if (!sku) {
                return res.status(404).json({ error: "SKU not found", code: "SKU_NOT_FOUND" });
            }
            res.json({ sku, versionId: getCatalogueVersionId() });
        } catch (err) {
            res.status(500).json({ error: err.message || "SKU lookup failed" });
        }
    });

    app.get("/api/revenue/entitlements/me", requireConsumerScope(), async (req, res) => {
        try {
            const snapshot = await getConsumerEntitlements(req.consumerAuth.uid);
            res.json({ entitlement: snapshot });
        } catch (err) {
            res.status(500).json({ error: err.message || "Entitlement lookup failed" });
        }
    });

    app.get("/api/revenue/config/public", async (_req, res) => {
        try {
            const config = await getRevenueConfig();
            res.json({
                catalogueVersionId: config.catalogueVersionId,
                commercialActivation: config.commercialActivation,
                enforcement: config.enforcement,
                checkoutEnabled: await isCommercialActive("rs02SarahCheckout"),
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Config unavailable" });
        }
    });
}
