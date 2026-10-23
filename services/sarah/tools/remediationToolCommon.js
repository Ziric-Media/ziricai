export function remediationToolResult(result, actionLabel) {
    return {
        success: result.success !== false,
        message: result.message,
        data: result.data,
        supportCase: result.supportCase,
        completionType: result.completionType || "remediation",
        userFacingTruth:
            result.userFacingTruth ||
            (result.verified
                ? `${actionLabel} succeeded after verification.`
                : `${actionLabel} did not claim success without verification.`),
    };
}
