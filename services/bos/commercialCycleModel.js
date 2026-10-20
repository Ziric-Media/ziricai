/**
 * Sarah BOS — commercial cycle model (quote → payment verification → mobilisation).
 */

export const CYCLE_STAGES = {
    QUOTATION_PENDING: "quotation_pending",
    QUOTATION_READY: "quotation_ready",
    QUOTATION_SENT: "quotation_sent",
    QUOTATION_ACCEPTED: "quotation_accepted",
    PAYMENT_PROOF_SUBMITTED: "payment_proof_submitted",
    PAYMENT_VERIFIED: "payment_verified",
    WORK_AUTHORISED: "work_authorised",
    MOBILISED: "mobilised",
    COMPLETED: "completed",
    EXCEPTION: "exception",
};

export const STAGE_LABELS = {
    [CYCLE_STAGES.QUOTATION_PENDING]: "Quotation requested",
    [CYCLE_STAGES.QUOTATION_READY]: "Quotation prepared",
    [CYCLE_STAGES.QUOTATION_SENT]: "Quotation sent",
    [CYCLE_STAGES.QUOTATION_ACCEPTED]: "Quotation accepted",
    [CYCLE_STAGES.PAYMENT_PROOF_SUBMITTED]: "Payment proof submitted",
    [CYCLE_STAGES.PAYMENT_VERIFIED]: "Payment verified",
    [CYCLE_STAGES.WORK_AUTHORISED]: "Work authorised",
    [CYCLE_STAGES.MOBILISED]: "Mobilised",
    [CYCLE_STAGES.COMPLETED]: "Completed",
    [CYCLE_STAGES.EXCEPTION]: "Exception",
};

export const SARAH_ROLES = {
    ADMIN: "admin",
    SALES: "sales",
    FINANCE: "finance",
    OPERATIONS: "operations",
    HR: "hr",
};

/** Allowed stage transitions for slice 1 (quotation → pay → mobilise). */
export const TRANSITIONS = {
    "request-quotation": {
        from: [null, CYCLE_STAGES.EXCEPTION],
        to: CYCLE_STAGES.QUOTATION_PENDING,
        owner: SARAH_ROLES.SALES,
        delegateTo: SARAH_ROLES.FINANCE,
    },
    "prepare-quotation": {
        from: [CYCLE_STAGES.QUOTATION_PENDING, CYCLE_STAGES.QUOTATION_READY],
        to: CYCLE_STAGES.QUOTATION_READY,
        owner: SARAH_ROLES.FINANCE,
    },
    "send-quotation": {
        from: [CYCLE_STAGES.QUOTATION_READY],
        to: CYCLE_STAGES.QUOTATION_SENT,
        owner: SARAH_ROLES.FINANCE,
    },
    "accept-quotation": {
        from: [CYCLE_STAGES.QUOTATION_SENT],
        to: CYCLE_STAGES.QUOTATION_ACCEPTED,
        owner: SARAH_ROLES.SALES,
    },
    "submit-payment-proof": {
        from: [CYCLE_STAGES.QUOTATION_ACCEPTED, CYCLE_STAGES.PAYMENT_PROOF_SUBMITTED],
        to: CYCLE_STAGES.PAYMENT_PROOF_SUBMITTED,
        owner: SARAH_ROLES.SALES,
    },
    "verify-payment": {
        from: [CYCLE_STAGES.PAYMENT_PROOF_SUBMITTED, CYCLE_STAGES.QUOTATION_ACCEPTED],
        to: CYCLE_STAGES.PAYMENT_VERIFIED,
        owner: SARAH_ROLES.FINANCE,
    },
    "authorise-work": {
        from: [CYCLE_STAGES.PAYMENT_VERIFIED],
        to: CYCLE_STAGES.WORK_AUTHORISED,
        owner: SARAH_ROLES.ADMIN,
        delegateTo: SARAH_ROLES.OPERATIONS,
    },
    mobilise: {
        from: [CYCLE_STAGES.WORK_AUTHORISED],
        to: CYCLE_STAGES.MOBILISED,
        owner: SARAH_ROLES.OPERATIONS,
    },
};

export function assertTransition(action, currentStage) {
    const rule = TRANSITIONS[action];
    if (!rule) {
        throw Object.assign(new Error(`Unknown cycle action: ${action}`), { status: 400, code: "BOS_INVALID_ACTION" });
    }
    const fromList = rule.from;
    const ok = fromList.includes(null)
        ? currentStage == null || fromList.includes(currentStage)
        : fromList.includes(currentStage);
    if (!ok) {
        throw Object.assign(
            new Error(`Action "${action}" not allowed from stage "${currentStage || "new"}"`),
            { status: 409, code: "BOS_INVALID_STAGE" }
        );
    }
    return rule;
}
