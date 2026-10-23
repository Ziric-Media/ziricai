export function piSarahResponse(envelope, payload, message) {
    return {
        message,
        data: {
            meta: envelope,
            ...payload,
        },
        completionType: "read",
        userFacingTruth:
            "Metrics are from Platform Intelligence read models for the stated period — do not recalculate or estimate.",
    };
}
