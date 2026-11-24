/**
 * Public dealer image proxy — Sarah App consumer chat stock photos.
 */
import { publicReadRateLimit } from "../auth/authRateLimiter.js";
import { fetchDealerImageBuffer } from "../media/dealerImageProxy.js";

/**
 * @param {import('express').Express} app
 */
export function mountDealerImageRoutes(app) {
    const limiter = publicReadRateLimit("dealer-image");
    app.get("/api/media/dealer-image", limiter, async (req, res) => {
        try {
            const url = String(req.query?.u || req.query?.url || "").trim();
            if (!url) {
                return res.status(400).json({ error: "u query required", code: "IMAGE_URL_REQUIRED" });
            }
            const { buffer, mimeType } = await fetchDealerImageBuffer(url);
            res.setHeader("Content-Type", mimeType);
            res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
            res.send(buffer);
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Image unavailable",
                code: err.code || "IMAGE_PROXY_FAILED",
            });
        }
    });
}
