/**
 * Automotive preset dashboard API (read-only metrics).
 */
import { requireTenantScope } from "../core/tenantContext.js";
import { getCompany } from "../tenants/companyService.js";
import { resolvePilotDataCompanyId } from "../storage/centralMotorsPilot.js";
import { assertAutomotivePresetActive } from "../automotive/automotiveIndustryPreset.js";
import { buildAutomotiveDashboardMetrics } from "../automotive/automotiveMetricsService.js";

/**
 * @param {import('express').Request} req
 * @param {{ getCompany?: typeof getCompany, assertPreset?: typeof assertAutomotivePresetActive, buildMetrics?: typeof buildAutomotiveDashboardMetrics, resolveDataCompanyId?: typeof resolvePilotDataCompanyId }} [deps]
 */
export async function handleAutomotiveDashboardRequest(req, deps = {}) {
    const loadCompany = deps.getCompany || getCompany;
    const assertPreset = deps.assertPreset || assertAutomotivePresetActive;
    const buildMetrics = deps.buildMetrics || buildAutomotiveDashboardMetrics;
    const resolveDataId = deps.resolveDataCompanyId || resolvePilotDataCompanyId;

    const companyId = req.params.companyId;
    const company = await loadCompany(companyId);
    if (!company) {
        return {
            status: 404,
            body: { error: "Company not found", code: "COMPANY_NOT_FOUND" },
        };
    }

    await assertPreset(company);

    const dataCompanyId = resolveDataId(companyId);
    const payload = await buildMetrics(dataCompanyId, req.query);
    payload.requestedCompanyId = companyId;
    return { status: 200, body: payload };
}

export function mountAutomotiveRoutes(app) {
    app.get(
        "/api/companies/:companyId/automotive/dashboard",
        requireTenantScope(),
        async (req, res) => {
            try {
                const result = await handleAutomotiveDashboardRequest(req);
                return res.status(result.status).json(result.body);
            } catch (err) {
                const status = err.status || 500;
                if (status >= 500) {
                    console.error("[api/automotive/dashboard] error:", err.message);
                }
                return res.status(status).json({
                    error: err.message || "Automotive dashboard error",
                    code: err.code || "AUTOMOTIVE_DASHBOARD_ERROR",
                });
            }
        }
    );
}
