/**
 * Sarah BOS — workforce instructions API (portal).
 */
import { requireAuthenticatedTenantMember } from "../core/tenantContext.js";
import { resolveBosCompanyId } from "../bos/bosPilot.js";
import {
    createWorkforceInstruction,
    listWorkforceInstructions,
    getWorkforceInstruction,
    startWorkforceInstruction,
    completeWorkforceInstruction,
} from "../bos/workforceInstructionService.js";
import { INSTRUCTION_SOURCE } from "../bos/workforceInstructionModel.js";

function access(req) {
    return { role: req.tenant?.role, uid: req.tenant?.uid ?? null };
}

function err(res, e, label) {
    console.error(`[bos/instructions/${label}]`, e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code || "BOS_INSTRUCTION_ERROR" });
}

function companyId(req) {
    return resolveBosCompanyId(req.params.companyId);
}

export function mountWorkforceInstructionRoutes(app) {
    app.get("/api/portal/bos/instructions/:companyId", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const cid = companyId(req);
            const items = await listWorkforceInstructions(cid, {
                targetModule: req.query?.module,
                status: req.query?.status,
                limit: req.query?.limit,
            });
            res.json({ items, companyId: cid });
        } catch (e) {
            err(res, e, "list");
        }
    });

    app.post("/api/portal/bos/instructions/:companyId", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const cid = companyId(req);
            const body = req.body || {};
            const item = await createWorkforceInstruction(cid, access(req), {
                ...body,
                source: body.source === INSTRUCTION_SOURCE.ADMIN_SARAH ? INSTRUCTION_SOURCE.ADMIN_SARAH : INSTRUCTION_SOURCE.HUMAN,
            });
            res.status(201).json({ item, companyId: cid });
        } catch (e) {
            err(res, e, "create");
        }
    });

    app.post(
        "/api/portal/bos/instructions/:companyId/:instructionId/start",
        requireAuthenticatedTenantMember(),
        async (req, res) => {
            try {
                const cid = companyId(req);
                const item = await startWorkforceInstruction(cid, req.params.instructionId, access(req));
                res.json({ item, companyId: cid });
            } catch (e) {
                err(res, e, "start");
            }
        }
    );

    app.post(
        "/api/portal/bos/instructions/:companyId/:instructionId/complete",
        requireAuthenticatedTenantMember(),
        async (req, res) => {
            try {
                const cid = companyId(req);
                const item = await completeWorkforceInstruction(cid, req.params.instructionId, access(req), {
                    resultSummary: req.body?.resultSummary,
                    failed: Boolean(req.body?.failed),
                });
                res.json({ item, companyId: cid });
            } catch (e) {
                err(res, e, "complete");
            }
        }
    );

    app.get(
        "/api/portal/bos/instructions/:companyId/:instructionId",
        requireAuthenticatedTenantMember(),
        async (req, res) => {
            try {
                const cid = companyId(req);
                const item = await getWorkforceInstruction(cid, req.params.instructionId);
                if (!item) return res.status(404).json({ error: "Not found", code: "BOS_INSTRUCTION_NOT_FOUND" });
                res.json({ item, companyId: cid });
            } catch (e) {
                err(res, e, "get");
            }
        }
    );
}
