/**
 * Shared Finance Sarah read-tool access checks (server-side, same as HTTP *ForAccess).
 */
import { assertCanViewFinance } from "../../auth/financePermissionPolicy.js";
import { requireFinanceActor } from "../../finance/financeAccess.js";

/**
 * @param {{ uid?: string|null, role?: string|null }} ctx
 * @returns {{ uid: string, role: string }}
 */
export function financeReadAccessFromCtx(ctx) {
    const access = requireFinanceActor({ uid: ctx?.uid });
    assertCanViewFinance(ctx?.role);
    return { uid: access.uid, role: ctx.role || "viewer" };
}

/**
 * @param {unknown} err
 */
export function financeToolErrorResult(err) {
    const code = err?.code || "FINANCE_READ_FAILED";
    const status = err?.status || 500;
    return {
        success: false,
        code,
        message: err?.message || "Finance read failed.",
        completionType: "error",
        httpStatus: status,
    };
}
