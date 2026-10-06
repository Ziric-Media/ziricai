/**
 * PI-4F-3 — Common remediation executor (pre-check → action → verify → record → resolve/escalate).
 */
import { getSupportCase, appendRemediationAttempt } from "../../tenants/supportCaseService.js";
import { escalateSupportCase, resolveSupportCaseWithVerification } from "../../tenants/supportCaseService.js";
import { evaluateEscalationPolicy } from "../escalationPolicy.js";
import { recordRemediationAudit } from "./remediationAuditService.js";

/**
 * @param {object} input
 * @param {string} input.action — remediation action id
 * @param {string} input.companyId
 * @param {string} input.supportCaseId
 * @param {object} [input.ctx]
 * @param {object} [input.actionArgs]
 * @param {(ctx: object) => Promise<{ ok: boolean, reasons?: string[], previousState?: object }>} input.checkPreconditions
 * @param {(ctx: object) => Promise<{ actionResult: object, newState?: object }>} input.runAction
 * @param {(ctx: object, actionResult: object) => Promise<{ verified: boolean, postVerification?: object, reasons?: string[] }>} input.verifyOutcome
 */
export async function executeApprovedRemediation(input) {
    const {
        action,
        companyId,
        supportCaseId,
        ctx = {},
        actionArgs = {},
        checkPreconditions,
        runAction,
        verifyOutcome,
    } = input;

    const actor = ctx.uid || "sarah";
    const supportCase = await getSupportCase(companyId, supportCaseId);
    const baseCtx = {
        action,
        companyId,
        supportCaseId,
        supportCase,
        actionArgs,
        ctx,
    };

    const pre = await checkPreconditions(baseCtx);
    if (!pre.ok) {
        const audit = await recordRemediationAudit(companyId, {
            supportCaseId,
            action,
            requestedBy: actor,
            preconditions: { ok: false, reasons: pre.reasons || [pre.reason] },
            previousState: pre.previousState || null,
            success: false,
            escalated: false,
            failureReason: pre.reason || "Preconditions not met",
            outcome: "skipped",
            diagnosis: supportCase.diagnosis || null,
            sarahConfidence: supportCase.sarahConfidence,
            phases: {
                diagnosis: Boolean(supportCase.diagnosis),
                preconditions: false,
                remediationAttempted: false,
                postVerification: false,
                resolution: "skipped",
            },
        });
        const attempt = await appendRemediationAttempt(
            companyId,
            supportCaseId,
            {
                tool: action,
                outcome: "skipped",
                message: pre.reason || (pre.reasons || []).join("; "),
            },
            { uid: actor }
        );
        return {
            success: false,
            verified: false,
            skipped: true,
            message: `Could not run ${action}: ${pre.reason || (pre.reasons || []).join("; ")}`,
            supportCase: attempt.supportCase,
            audit,
            completionType: "remediation_skipped",
            userFacingTruth: "No infrastructure change was applied.",
        };
    }

    let actionResult;
    let newState;
    try {
        const ran = await runAction(baseCtx);
        actionResult = ran.actionResult;
        newState = ran.newState || null;
    } catch (err) {
        const msg = err.message || "Remediation action failed";
        const audit = await recordRemediationAudit(companyId, {
            supportCaseId,
            action,
            requestedBy: actor,
            preconditions: { ok: true, details: pre },
            previousState: pre.previousState || null,
            result: { error: msg },
            success: false,
            escalated: false,
            failureReason: msg,
        });
        const attempt = await appendRemediationAttempt(
            companyId,
            supportCaseId,
            { tool: action, outcome: "failed", message: msg },
            { uid: actor }
        );
        let updatedCase = attempt.supportCase;
        if (attempt.escalationPolicy?.mustEscalate) {
            updatedCase = await escalateSupportCase(
                companyId,
                supportCaseId,
                { reason: attempt.escalationPolicy.reasons.join("; "), ruleId: attempt.escalationPolicy.matchedRule },
                { uid: actor }
            );
        }
        return {
            success: false,
            verified: false,
            message: msg,
            supportCase: updatedCase,
            audit,
            completionType: "remediation_failed",
            userFacingTruth: "Remediation did not succeed; no success was claimed.",
        };
    }

    const verification = await verifyOutcome(baseCtx, actionResult);
    const verified = verification.verified === true;

    const audit = await recordRemediationAudit(companyId, {
        supportCaseId,
        action,
        requestedBy: actor,
        preconditions: { ok: true, details: pre },
        previousState: pre.previousState || null,
        result: actionResult,
        postVerification: verification.postVerification || verification,
        newState,
        success: verified,
        escalated: !verified,
        failureReason: verified ? null : (verification.reasons || []).join("; ") || "Verification failed",
        outcome: verified ? "resolved" : "escalated",
        diagnosis: supportCase.diagnosis || null,
        sarahConfidence: supportCase.sarahConfidence,
        phases: {
            diagnosis: Boolean(supportCase.diagnosis),
            preconditions: true,
            remediationAttempted: true,
            postVerification: true,
            resolution: verified ? "resolved" : "escalated",
        },
    });

    const attempt = await appendRemediationAttempt(
        companyId,
        supportCaseId,
        {
            tool: action,
            outcome: verified ? "success" : "failed",
            message: verified
                ? "Post-verification passed"
                : (verification.reasons || []).join("; ") || "Verification failed",
            verified,
        },
        { uid: actor }
    );

    let updatedCase = attempt.supportCase;
    const failedCount = (updatedCase.actionsAttempted || []).filter((a) => a.outcome === "failed").length;
    const policy = evaluateEscalationPolicy({
        issueClass: updatedCase.diagnosis?.issueClass,
        category: updatedCase.category,
        severity: updatedCase.severity,
        failedRemediationCount: failedCount,
    });

    if (verified) {
        updatedCase = await resolveSupportCaseWithVerification(
            companyId,
            supportCaseId,
            {
                summary: `Resolved after ${action} with successful post-verification.`,
                autoResolved: true,
                verifiedAt: new Date().toISOString(),
            },
            { uid: actor }
        );
    } else if (policy.mustEscalate || !verified) {
        updatedCase = await escalateSupportCase(
            companyId,
            supportCaseId,
            {
                reason:
                    policy.reasons?.join("; ") ||
                    verification.reasons?.join("; ") ||
                    `${action} completed but verification failed`,
                ruleId: policy.matchedRule || "verification_failed",
                recommendedOperatorAction: verification.recommendedOperatorAction || null,
            },
            { uid: actor }
        );
    }

    return {
        success: verified,
        verified,
        message: verified
            ? `I've verified that ${action} recovered the issue. The support case is resolved. No further configuration was changed beyond this approved action.`
            : `I attempted ${action} but verification did not confirm recovery. The case has been escalated for operator attention.`,
        supportCase: updatedCase,
        audit,
        data: {
            actionResult,
            postVerification: verification.postVerification || verification,
            previousState: pre.previousState,
            newState,
            escalationPolicy: policy,
        },
        completionType: verified ? "remediation_resolved" : "remediation_escalated",
        userFacingTruth: verified
            ? "Remediation succeeded only after post-verification passed."
            : "Sarah does not claim success without verification.",
    };
}
