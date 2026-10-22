/**
 * Sarah BOS — commercial cycle API (portal).
 */
import { requireAuthenticatedTenantMember } from "../core/tenantContext.js";
import { hasPermission } from "../auth/permissionsService.js";
import { resolveBosCompanyId, isBosPilotTenant } from "../bos/bosPilot.js";
import {
    listCommercialCycles,
    getCommercialCycle,
    createCommercialCycle,
    applyCommercialCycleAction,
} from "../bos/commercialCycleService.js";

function bosAccess(req) {
    return { role: req.tenant?.role, uid: req.tenant?.uid ?? null };
}

function bosError(res, err, label) {
    console.error(`[bos/${label}]`, err.message);
    const status =
        err.status ||
        (String(err.code || "").startsWith("FINANCE_") ? 400 : 500);
    res.status(status).json({ error: err.message || "BOS request failed", code: err.code || "BOS_ERROR" });
}

function resolveCompanyId(req) {
    return resolveBosCompanyId(req.params.companyId);
}

export function mountBosRoutes(app) {
    app.get("/api/portal/bos/cycles/:companyId", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const companyId = resolveCompanyId(req);
            if (!isBosPilotTenant(companyId)) {
                return res.json({ items: [], companyId, pilot: false });
            }
            const items = await listCommercialCycles(companyId, { seedIfEmpty: true });
            res.json({ items, companyId, pilot: true });
        } catch (err) {
            bosError(res, err, "list");
        }
    });

    app.post("/api/portal/bos/cycles/:companyId", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const companyId = resolveCompanyId(req);
            if (!isBosPilotTenant(companyId)) {
                return res.status(403).json({ error: "BOS pilot not enabled for this tenant", code: "BOS_PILOT_OFF" });
            }
            const role = req.tenant?.role;
            if (!hasPermission(role, "canViewFinance") && !hasPermission(role, "canViewInbox")) {
                return res.status(403).json({ error: "Insufficient permission", code: "FORBIDDEN" });
            }
            const cycle = await createCommercialCycle(companyId, bosAccess(req), req.body || {});
            res.status(201).json({ cycle, companyId });
        } catch (err) {
            bosError(res, err, "create");
        }
    });

    app.get("/api/portal/bos/cycles/:companyId/:cycleId", requireAuthenticatedTenantMember(), async (req, res) => {
        try {
            const companyId = resolveCompanyId(req);
            const cycle = await getCommercialCycle(companyId, req.params.cycleId);
            if (!cycle) return res.status(404).json({ error: "Cycle not found", code: "BOS_NOT_FOUND" });
            res.json({ cycle, companyId });
        } catch (err) {
            bosError(res, err, "get");
        }
    });

    app.post(
        "/api/portal/bos/cycles/:companyId/:cycleId/actions/:action",
        requireAuthenticatedTenantMember(),
        async (req, res) => {
            try {
                const companyId = resolveCompanyId(req);
                if (!isBosPilotTenant(companyId)) {
                    return res.status(403).json({ error: "BOS pilot not enabled for this tenant", code: "BOS_PILOT_OFF" });
                }
                const cycle = await applyCommercialCycleAction(
                    companyId,
                    req.params.cycleId,
                    req.params.action,
                    bosAccess(req),
                    req.body || {}
                );
                res.json({ cycle, companyId });
            } catch (err) {
                bosError(res, err, "action");
            }
        }
    );
}
