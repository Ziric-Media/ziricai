/**
 * Sarah Network — consumer API (U4).
 * SNET-02: grants are durable (list / read-through / revoke); requests read through the durable store.
 * Consumers may identify a business by `snId` (resolved server-side to the tenant) instead of `companyId`.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import {
    createConsentGrant,
    getConsentGrantAsync,
    listConsentGrantsForUser,
    revokeConsentGrant,
} from "../users/consentGrantService.js";
import {
    submitPersonalToCompanyEnquiry,
    getSarahNetworkRequestAsync,
    listSarahNetworkRequestsAsync,
} from "../sarah/network/sarahNetworkService.js";
import { getEntityBySnId, getOrgEntityByCompanyId } from "../network/networkIdentityService.js";
import { assertCompanyDiscoverableAsync } from "../users/businessDirectoryService.js";

/**
 * Resolve the target tenant from `{ snId }` (preferred) or legacy `{ companyId }`.
 * @param {{ snId?: string, companyId?: string }} body
 * @returns {Promise<{ companyId: string|null, snId: string|null }>}
 */
export async function resolveNetworkTarget(body = {}) {
    if (body.snId) {
        const entity = await getEntityBySnId(String(body.snId));
        const companyId = entity?.refs?.companyId;
        if (!entity || !companyId) {
            throw Object.assign(new Error("Network entity not found."), { status: 404, code: "ENTITY_NOT_FOUND" });
        }
        await assertCompanyDiscoverableAsync(companyId);
        return { companyId, snId: entity.snId };
    }
    const companyId = String(body.companyId || "").trim() || null;
    if (!companyId) return { companyId: null, snId: null };
    const entity = await getOrgEntityByCompanyId(companyId);
    return { companyId, snId: entity?.snId || null };
}

/**
 * @param {import('express').Express} app
 * @param {{ consumerGuard?: Function }} [deps] test seam
 */
export function mountSarahNetworkRoutes(app, deps = {}) {
    const guard = deps.consumerGuard || requireConsumerScope();

    app.post("/api/sarah-network/grants", guard, async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const body = req.body || {};
            const target = await resolveNetworkTarget(body);
            const grant = createConsentGrant(uid, {
                companyId: target.companyId,
                snId: target.snId,
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

    app.get("/api/sarah-network/grants", guard, async (req, res) => {
        try {
            res.json({ grants: await listConsentGrantsForUser(req.consumerAuth.uid) });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list grants" });
        }
    });

    app.get("/api/sarah-network/grants/:grantId", guard, async (req, res) => {
        try {
            const grant = await getConsentGrantAsync(req.params.grantId);
            if (!grant || grant.uid !== req.consumerAuth.uid) {
                return res.status(404).json({ error: "Grant not found", code: "GRANT_NOT_FOUND" });
            }
            res.json({ grant });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to load grant" });
        }
    });

    app.post("/api/sarah-network/grants/:grantId/revoke", guard, async (req, res) => {
        try {
            const grant = await revokeConsentGrant(req.consumerAuth.uid, req.params.grantId);
            res.json({ grant });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to revoke grant",
                code: err.code || "GRANT_REVOKE_FAILED",
            });
        }
    });

    app.post("/api/sarah-network/enquiries", guard, async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const body = { ...(req.body || {}) };
            if (body.snId) {
                const target = await resolveNetworkTarget(body);
                body.companyId = target.companyId;
            }
            const request = await submitPersonalToCompanyEnquiry(uid, body);
            res.status(201).json({ ok: true, request });
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Enquiry failed",
                code: err.code || "ENQUIRY_FAILED",
            });
        }
    });

    app.get("/api/sarah-network/requests", guard, async (req, res) => {
        try {
            const requests = await listSarahNetworkRequestsAsync(req.consumerAuth.uid);
            res.json({ requests });
        } catch (err) {
            res.status(500).json({ error: err.message || "Failed to list requests" });
        }
    });

    app.get("/api/sarah-network/requests/:requestId", guard, async (req, res) => {
        try {
            const data = await getSarahNetworkRequestAsync(req.params.requestId, req.consumerAuth.uid);
            res.json(data);
        } catch (err) {
            res.status(err.status || 500).json({
                error: err.message || "Failed to load request",
                code: err.code || "REQUEST_LOAD_FAILED",
            });
        }
    });
}
