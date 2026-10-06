/**
 * Strip secrets from tool payloads before persisting in Sarah transcripts.
 */
const SECRET_KEY = /^(accessToken|refreshToken|token|secret|password|apiKey|api_key|verifyToken|appSecret|clientSecret)$/i;

export function sanitizeForSarahTranscript(value, depth = 0) {
    if (depth > 8) return "[truncated]";
    if (value == null) return value;
    if (typeof value === "string") {
        if (value.length > 4000) return `${value.slice(0, 4000)}…`;
        return value;
    }
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForSarahTranscript(item, depth + 1));
    }
    const out = {};
    for (const [key, val] of Object.entries(value)) {
        if (SECRET_KEY.test(key)) {
            out[key] = "[redacted]";
            continue;
        }
        out[key] = sanitizeForSarahTranscript(val, depth + 1);
    }
    return out;
}

export function sanitizeActionsForTranscript(actions = []) {
    return actions.map((action) =>
        sanitizeForSarahTranscript({
            tool: action.tool,
            success: action.success,
            message: action.message,
            error: action.error,
            completionType: action.completionType,
            code: action.code,
        })
    );
}
