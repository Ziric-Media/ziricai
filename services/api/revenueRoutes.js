/**
 * Revenue Management — consumer and public catalogue (R0).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { getConsumerEntitlements } from "../revenue/entitlementEngine.js";
import { listCatalogueSkus, getCatalogueSku, getCatalogueVersionId } from "../revenue/catalogueService.js";
import { getRevenueConfig, isCommercialActive, isRs02CheckoutUidAllowed } from "../revenue/revenueConfig.js";
import { getConsumerSubscription } from "../revenue/consumerSubscriptionService.js";
import {
    initConsumerCheckout,
    verifyConsumerCheckout,
    handlePaystackCheckoutWebhook,
    handleStripeCheckoutWebhook,
} from "../revenue/consumerCheckoutPaymentService.js";
import { paystackPublicKey, paystackConfigured } from "../payments/paystackClient.js";
import { stripePublishableKey, stripeConfigured } from "../payments/stripeClient.js";

/** Webhook raw body is captured in api/app.js before express.json(). */

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

    app.get("/api/revenue/subscription/me", requireConsumerScope(), async (req, res) => {
        try {
            const sub = await getConsumerSubscription(req.consumerAuth.uid);
            const entitlements = await getConsumerEntitlements(req.consumerAuth.uid);
            res.json({ subscription: sub, entitlement: entitlements });
        } catch (err) {
            res.status(500).json({ error: err.message || "Subscription lookup failed" });
        }
    });

    app.post("/api/revenue/subscription/checkout", requireConsumerScope(), async (req, res) => {
        try {
            const skuId = String(req.body?.skuId || "").trim();
            const sku = getCatalogueSku(skuId);
            const creditPack = sku?.revenueStreamId === "RS06";
            const enabled = creditPack
                ? await isCommercialActive("rs06Credits")
                : await isCommercialActive("rs02SarahCheckout");
            if (!enabled) {
                return res.status(503).json({
                    error: creditPack
                        ? "Credit top-up checkout is not enabled yet."
                        : "Sarah checkout is not enabled yet.",
                    code: "CHECKOUT_DISABLED",
                });
            }
            if (!creditPack && !isRs02CheckoutUidAllowed(req.consumerAuth.uid)) {
                return res.status(403).json({
                    error: "Sarah checkout is restricted to authorised test accounts.",
                    code: "CHECKOUT_NOT_ALLOWED",
                });
            }
            const result = await initConsumerCheckout(req.consumerAuth.uid, skuId, {
                email: req.consumerAuth.email || req.body?.email,
                returnUrl: req.body?.returnUrl,
                provider: req.body?.provider,
            });
            res.status(result.completed ? 201 : 200).json(result);
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Checkout failed", code: err.code || "CHECKOUT_FAILED" });
        }
    });

    app.get("/api/revenue/subscription/checkout/verify", requireConsumerScope(), async (req, res) => {
        try {
            const reference = String(req.query.reference || req.query.checkoutRef || "").trim();
            const result = await verifyConsumerCheckout(reference, req.consumerAuth.uid);
            res.json({ ok: true, ...result });
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Verify failed", code: err.code || "CHECKOUT_VERIFY_FAILED" });
        }
    });

    app.post("/api/revenue/webhooks/paystack", async (req, res) => {
        try {
            const raw = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
            if (!raw) {
                return res.status(400).json({ error: "Raw body required", code: "RAW_BODY_REQUIRED" });
            }
            const sig = req.headers["x-paystack-signature"];
            const out = await handlePaystackCheckoutWebhook(raw, sig);
            res.json(out);
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Webhook failed", code: err.code });
        }
    });

    app.post("/api/revenue/webhooks/stripe", async (req, res) => {
        try {
            const raw = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
            if (!raw) {
                return res.status(400).json({ error: "Raw body required", code: "RAW_BODY_REQUIRED" });
            }
            const sig = req.headers["stripe-signature"];
            const out = await handleStripeCheckoutWebhook(raw, sig);
            res.json(out);
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Webhook failed", code: err.code });
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
                paidCheckoutAvailable: paystackConfigured() || stripeConfigured(),
                paystackEnabled: paystackConfigured(),
                paystackPublicKey: paystackPublicKey() || null,
                stripeEnabled: stripeConfigured(),
                stripePublishableKey: stripePublishableKey() || null,
                checkoutProviderDefault: paystackConfigured()
                    ? "paystack"
                    : stripeConfigured()
                      ? "stripe"
                      : null,
                creditsTopUpEnabled: await isCommercialActive("rs06Credits"),
                defaultCreditTopUpSkuId: "rs06.credits.consumer.500.zar",
            });
        } catch (err) {
            res.status(500).json({ error: err.message || "Config unavailable" });
        }
    });
}
