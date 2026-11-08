/**
 * CH6 — Consumer human handover requests.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { requestHumanHandover } from "../users/handoverStateService.js";

const chatRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Express} app
 */
export function mountChatHandoverRoutes(app) {
    app.post(
        "/api/user-conversations/:companyId/request-human",
        requireConsumerScope(),
        chatRateLimit,
        async (req, res) => {
            try {
                const result = await requestHumanHandover(req.consumerAuth.uid, req.params.companyId);
                res.json(result);
            } catch (err) {
                res.status(err.status || 500).json({
                    error: err.message || "Handover request failed",
                    code: err.code || "HANDOVER_REQUEST_FAILED",
                });
            }
        }
    );
}
