/**
 * Sarah App — consumer API authorization.
 * accountKinds is never sufficient; userProfiles/{uid} must exist.
 */
import { resolveAuthFromRequest } from "./authService.js";
import { getConsumerProfile } from "../users/consumerProfileService.js";
import { auditLog } from "../audit/auditLog.js";

/**
 * Verified Firebase token + existing userProfiles doc.
 */
export function requireConsumerScope() {
    return async (req, res, next) => {
        try {
            const auth = await resolveAuthFromRequest(req);
            if (!auth.hasBearerToken || !auth.tokenVerified || !auth.uid) {
                return res.status(401).json({
                    error: "Authentication required",
                    code: "UNAUTHORIZED",
                });
            }

            const consumerProfile = await getConsumerProfile(auth.uid);
            if (!consumerProfile) {
                auditLog("consumer_access_denied", {
                    uid: auth.uid,
                    path: req.path,
                    reason: "missing_user_profile",
                });
                return res.status(403).json({
                    error: "Sarah App profile required. Complete registration bootstrap.",
                    code: "CONSUMER_PROFILE_REQUIRED",
                });
            }

            req.consumerAuth = {
                uid: auth.uid,
                email: auth.email || consumerProfile.email || null,
                profile: consumerProfile,
                globalProfile: auth.profile || null,
            };
            req.auth = auth;
            next();
        } catch (err) {
            console.error("[requireConsumerScope]", err.message);
            res.status(500).json({ error: "Consumer authorization failed" });
        }
    };
}
