/**
 * Sarah Network — consumer API (U4).
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { createConsentGrant, getConsentGrant } from "../users/consentGrantService.js";
import {
    submitPersonalToCompanyEnquiry,
    getSarahNetworkRequest,
    listSarahNetworkRequests,
} from "../sarah/network/sarahNetworkService.js";

/**
 * @param {import('express').Express} app
 */
export function mountSarahNetworkRoutes(app) {
    app.post("/api/sarah-network/grants", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const body = req.body || {};
            const grant = createConsentGrant(uid, {
                companyId: body.companyId,
                scope: body.scope,
                disclosedFields: body.disclosedFields,
            });
            res.status(201).json({ grant });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to create grant",
                code: err.code || "GRANT_CREATE_FAILED",
            });
        }
    });

    app.get("/api/sarah-network/grants/:grantId", requireConsumerScope(), async (req, res) => {
        try {
            const grant = getConsentGrant(req.params.grantId);
            if (!grant || grant.uid !== req.consumerAuth.uid) {
                return res.status(404).json({ error: "Grant not found", code: "GRANT_NOT_FOUND" });
            }
            res.json({ grant });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load grant" });
        }
    });

    app.post("/api/sarah-network/enquiries", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const body = req.body || {};
            const request = await submitPersonalToCompanyEnquiry(uid, body);
            res.status(201).json({ ok: true, request });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Enquiry failed",
                code: err.code || "ENQUIRY_FAILED",
            });
        }
    });

    app.get("/api/sarah-network/requests", requireConsumerScope(), async (req, res) => {
        try {
            const requests = listSarahNetworkRequests(req.consumerAuth.uid);
            res.json({ requests });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list requests" });
        }
    });

    app.get("/api/sarah-network/requests/:requestId", requireConsumerScope(), async (req, res) => {
        try {
            const data = getSarahNetworkRequest(req.params.requestId, req.consumerAuth.uid);
            res.json(data);
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to load request",
                code: err.code || "REQUEST_LOAD_FAILED",
            });
        }
    });
}
