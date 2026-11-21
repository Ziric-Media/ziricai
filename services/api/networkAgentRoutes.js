/**
 * SNET-06 — agent registry API (v1).
 *   Consumer (Sarah App / other agents):
 *     GET /api/network/v1/agents?capability=&limit=
 *     GET /api/network/v1/agents/:agentSnId
 *   Tenant (member; writes owner/manager):
 *     GET /api/network/v1/orgs/:companyId/agent
 *     PUT /api/network/v1/orgs/:companyId/agent       { capabilities?, status?: active|paused }
 * No route returns prompts, knowledge-base content or secrets — the registry does not store them.
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    AGENT_CAPABILITIES,
    ensureCompanyAgent,
    getPublicAgent,
    listPublicAgents,
    toOwnerView,
    updateCompanyAgent,
} from "../network/agentRegistryService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

/**
 * @param {import('express').Express} app
 * @param {{ authorize?: Function, consumerGuard?: Function }} [deps] test seams
 */
export function mountNetworkAgentRoutes(app, deps = {}) {
    const authorize = deps.authorize || defaultAuthorize;
    const consumerGuard = deps.consumerGuard || requireConsumerScope();

    app.get("/api/network/v1/agents", consumerGuard, async (req, res) => {
        try {
            const data = await listPublicAgents({
                capability: String(req.query.capability || ""),
                limit: req.query.limit,
            });
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "AGENT_LIST_FAILED");
        }
    });

    app.get("/api/network/v1/agents/:agentSnId", consumerGuard, async (req, res) => {
        try {
            const agent = await getPublicAgent(String(req.params.agentSnId || ""));
            if (!agent) {
                return res.status(404).json({ ok: false, error: { code: "AGENT_NOT_FOUND", message: "Agent not found." } });
            }
            res.json({ ok: true, data: { agent } });
        } catch (err) {
            fail(res, err, "AGENT_READ_FAILED");
        }
    });

    app.get("/api/network/v1/orgs/:companyId/agent", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            res.json({ ok: true, data: { agent: toOwnerView(await ensureCompanyAgent(companyId)), capabilities: AGENT_CAPABILITIES } });
        } catch (err) {
            fail(res, err, "AGENT_READ_FAILED");
        }
    });

    app.put("/api/network/v1/orgs/:companyId/agent", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: true });
            const agent = await updateCompanyAgent(companyId, req.body || {});
            res.json({ ok: true, data: { agent: toOwnerView(agent) } });
        } catch (err) {
            fail(res, err, "AGENT_UPDATE_FAILED");
        }
    });
}
