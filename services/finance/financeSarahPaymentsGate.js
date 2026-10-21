/**
 * F4 — Sarah Finance payment writes gated separately from portal PAYMENTS_UI_DISABLED.
 */
export function isFinanceSarahPaymentsEnabled() {
    return (
        process.env.FINANCE_SARAH_PAYMENTS_ENABLED === "1" ||
        process.env.FINANCE_SARAH_PAYMENTS_ENABLED === "true"
    );
}

export function assertFinanceSarahPaymentsEnabled() {
    if (isFinanceSarahPaymentsEnabled()) return;
    throw Object.assign(
        new Error(
            "Finance Sarah invoice payments are disabled until FINANCE_SARAH_PAYMENTS_ENABLED and payment remediation gates are satisfied."
        ),
        { code: "FINANCE_SARAH_PAYMENTS_DISABLED", status: 403 }
    );
}
