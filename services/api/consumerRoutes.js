/**
 * Sarah App — consumer API namespace (U1).
 */
import { requireFirebaseAuth } from "../auth/requireFirebaseAuth.js";
import { requireConsumerScope } from "../auth/consumerAuth.js";
import {
    bootstrapConsumerProfile,
    getConsumerProfile,
    getConsumerPreferences,
    updateConsumerProfile,
} from "../users/consumerProfileService.js";
import { auditLog } from "../audit/auditLog.js";
import { getConsumerEntitlements } from "../revenue/entitlementEngine.js";

/**
 * @param {import('express').Express} app
 */
export function mountConsumerRoutes(app) {
    /** First sign-in — creates userProfiles/{uid} (idempotent). */
    app.post("/api/users/bootstrap", requireFirebaseAuth(), async (req, res) => {
        try {
            const uid = req.firebaseAuth.uid;
            const body = req.body || {};
            const result = await bootstrapConsumerProfile(uid, {
                email: body.email || req.firebaseAuth.email,
                firstName: body.firstName,
                lastName: body.lastName,
                preferredName: body.preferredName,
                fullName: body.fullName,
                popiaConsentVersion: body.popiaConsentVersion,
            });
            auditLog("consumer_bootstrap", { uid, created: result.created });
            const entitlementSnapshot = await getConsumerEntitlements(uid);
            res.status(result.created ? 201 : 200).json({
                ok: true,
                created: result.created,
                profile: result.profile,
                entitlementSnapshot,
            });
        } catch (err) {
            console.error("[api/users/bootstrap]", err.message);
            res.status(err.status || 500).json({
                error: err.message || "Bootstrap failed",
                code: err.code || "BOOTSTRAP_FAILED",
            });
        }
    });

    app.get("/api/users/profile", requireConsumerScope(), async (req, res) => {
        try {
            const [profile, preferences] = await Promise.all([
                getConsumerProfile(req.consumerAuth.uid),
                getConsumerPreferences(req.consumerAuth.uid),
            ]);
            const entitlementSnapshot = await getConsumerEntitlements(req.consumerAuth.uid);
            res.json({ profile, preferences, entitlementSnapshot });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load profile" });
        }
    });

    app.patch("/api/users/profile", requireConsumerScope(), async (req, res) => {
        try {
            const profile = await updateConsumerProfile(req.consumerAuth.uid, req.body || {});
            res.json({ profile });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Update failed",
                code: err.code || "PROFILE_UPDATE_FAILED",
            });
        }
    });
}
