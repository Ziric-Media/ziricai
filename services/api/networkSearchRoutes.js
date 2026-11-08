/**
 * SNET-05 — Network search API (v1).
 *   GET /api/network/v1/directory/search?q&category&verified=1&limit&cursor   (consumer)
 *   GET /api/network/v1/directory/suggest?q=                                  (consumer)
 *   GET /api/network/v1/health                                                (public, non-sensitive)
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { getSearchProvider } from "../network/networkSearchService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

/**
 * @param {import('express').Express} app
 * @param {{ consumerGuard?: Function }} [deps]
 */
export function mountNetworkSearchRoutes(app, deps = {}) {
    const guard = deps.consumerGuard || requireConsumerScope();

    app.get("/api/network/v1/directory/search", guard, async (req, res) => {
        try {
            const result = await getSearchProvider().search({
                q: String(req.query.q || "").slice(0, 120),
                category: String(req.query.category || "").slice(0, 40),
                verifiedOnly: ["1", "true"].includes(String(req.query.verified || "")),
                limit: req.query.limit,
                cursor: String(req.query.cursor || "").slice(0, 200),
            });
            res.json({ ok: true, data: result });
        } catch (err) {
            fail(res, err, "SEARCH_FAILED");
        }
    });

    app.get("/api/network/v1/directory/suggest", guard, async (req, res) => {
        try {
            const suggestions = await getSearchProvider().suggest(String(req.query.q || "").slice(0, 60));
            res.json({ ok: true, data: { suggestions } });
        } catch (err) {
            fail(res, err, "SUGGEST_FAILED");
        }
    });

    app.get("/api/network/v1/health", async (_req, res) => {
        try {
            const health = await getSearchProvider().health();
            res.json({ ok: health.ok, data: { service: "sarah-network", search: { provider: health.provider, indexed: health.indexed } } });
        } catch (err) {
            res.status(503).json({ ok: false, error: { code: "NETWORK_UNHEALTHY", message: err.message } });
        }
    });
}
