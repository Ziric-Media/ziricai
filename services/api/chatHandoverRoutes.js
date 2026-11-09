/**
 * CH6 — Consumer human handover requests.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { authRateLimit } from "../auth/authRateLimiter.js";
import { requestHumanHandover } from "../users/handoverStateService.js";
import { attachSnId, snIdForCompany } from "../network/networkIntegration.js";

const chatRateLimit = authRateLimit("auth");

/**
 * @param {import('express').Express} app
 */
export function mountChatHandoverRoutes(app, deps = {}) {
    const guard = deps.consumerGuard || requireConsumerScope();
    app.post(
        "/api/user-conversations/:companyId/request-human",
        guard,
        chatRateLimit,
        async (req, res) => {
            try {
                const result = await requestHumanHandover(req.consumerAuth.uid, req.params.companyId);
                res.json({
                    ...result,
                    conversation: await attachSnId(result.conversation),
                    snId: await snIdForCompany(req.params.companyId),
                });
            } catch (err) {
                res.status(err.status || 500).json({
                    error: err.message || "Handover request failed",
                    code: err.code || "HANDOVER_REQUEST_FAILED",
                });
            }
        }
    );
}
