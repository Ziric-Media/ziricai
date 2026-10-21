/**
 * Loopback-only session minting for Finance browser acceptance (memory + explicit opt-in).
 */
import {
    FINANCE_ACCEPTANCE_TENANT_ID,
    FINANCE_ACCEPTANCE_UIDS,
    isFinanceAcceptanceRuntimeActive,
    isLoopbackRequest,
    mintFinanceAcceptanceToken,
} from "../auth/financeAcceptanceMode.js";
import {
    seedFinanceAcceptanceTenantIfNeeded,
    seedFinanceAcceptanceDemoLedger,
} from "../finance/financeAcceptanceSeed.js";
import { resolveAuthFromRequest } from "../auth/authService.js";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function rejectUnlessAcceptance(req, res) {
    if (!isFinanceAcceptanceRuntimeActive()) {
        res.status(404).json({ error: "Not found" });
        return false;
    }
    if (!isLoopbackRequest(req)) {
        res.status(403).json({ error: "Loopback only", code: "ACCEPTANCE_LOOPBACK_REQUIRED" });
        return false;
    }
    return true;
}

export function mountFinanceAcceptanceRoutes(app) {
    app.get("/api/finance-acceptance/health", (req, res) => {
        if (!rejectUnlessAcceptance(req, res)) return;
        res.json({
            ok: true,
            mode: "finance-acceptance-loopback",
            tenantId: FINANCE_ACCEPTANCE_TENANT_ID,
            storage: "memory",
            paymentsUi: "disabled",
        });
    });

    app.post("/api/finance-acceptance/seed-demo", async (req, res) => {
        if (!rejectUnlessAcceptance(req, res)) return;
        try {
            const auth = await resolveAuthFromRequest(req);
            if (!auth.tokenVerified || auth.profile?.companyId !== FINANCE_ACCEPTANCE_TENANT_ID) {
                return res.status(401).json({ error: "Owner acceptance session required", code: "UNAUTHORIZED" });
            }
            if (String(auth.role || "").toLowerCase() !== "owner") {
                return res.status(403).json({ error: "Owner role required", code: "FORBIDDEN" });
            }
            const result = await seedFinanceAcceptanceDemoLedger();
            res.json(result);
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Seed failed", code: err.code });
        }
    });

    app.get("/api/finance-acceptance/session", async (req, res) => {
        if (!rejectUnlessAcceptance(req, res)) return;
        try {
            await seedFinanceAcceptanceTenantIfNeeded();
            const role = String(req.query.role || "owner").trim().toLowerCase();
            const uid =
                role === "viewer" ? FINANCE_ACCEPTANCE_UIDS.viewer : FINANCE_ACCEPTANCE_UIDS.owner;
            const exp = Date.now() + SESSION_TTL_MS;
            const token = mintFinanceAcceptanceToken({
                uid,
                role: role === "viewer" ? "viewer" : "owner",
                companyId: FINANCE_ACCEPTANCE_TENANT_ID,
                exp,
            });
            res.json({
                token,
                companyId: FINANCE_ACCEPTANCE_TENANT_ID,
                expiresAt: new Date(exp).toISOString(),
                profile: {
                    uid,
                    role: role === "viewer" ? "viewer" : "owner",
                    companyId: FINANCE_ACCEPTANCE_TENANT_ID,
                    email: `${uid}@finance-accept.local`,
                    fullName: role === "viewer" ? "Finance Accept viewer" : "Finance Accept owner",
                },
            });
        } catch (err) {
            const status = err.status || 500;
            res.status(status).json({ error: err.message || "Session failed", code: err.code });
        }
    });
}
