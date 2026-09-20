/**
 * CORPORATE-P0-2 — require verified Firebase ID token for self-serve tenant creation.
 * Authoritative identity is auth.uid from the token; body.uid is overwritten and cannot spoof.
 */
import { resolveAuthFromRequest } from "./authService.js";

/**
 * @param {{ allowSuperAdmin?: boolean }} [options]
 */
export function requireFirebaseAuth(options = {}) {
    const { allowSuperAdmin = true } = options;

    return async (req, res, next) => {
        try {
            const auth = await resolveAuthFromRequest(req);

            if (!auth.hasBearerToken || !auth.tokenVerified || !auth.uid) {
                return res.status(401).json({
                    error: "Authentication required",
                    code: "UNAUTHORIZED",
                });
            }

            if (!allowSuperAdmin && auth.isSuperAdmin) {
                return res.status(403).json({
                    error: "Use platform provisioning for operator tenant creation",
                    code: "SIGNUP_FORBIDDEN",
                });
            }

            req.firebaseAuth = auth;

            if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
                req.body.uid = auth.uid;
            }

            next();
        } catch (err) {
            console.error("[requireFirebaseAuth]", err.message);
            res.status(500).json({ error: "Authentication check failed" });
        }
    };
}
