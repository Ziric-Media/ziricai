/**
 * Lightweight POST body validation middleware.
 */

const COMPANY_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/;

export function isValidCompanyId(value) {
    return typeof value === "string" && COMPANY_ID_RE.test(value);
}

/**
 * Validate companyId in params, query, or body.
 */
export function validateCompanyIdParam(source = "params") {
    return (req, res, next) => {
        const companyId =
            source === "body"
                ? req.body?.companyId || req.body?.id
                : source === "query"
                  ? req.query?.companyId
                  : req.params?.companyId;

        if (companyId && !isValidCompanyId(companyId)) {
            return res.status(400).json({
                error: "Invalid companyId format",
                code: "INVALID_COMPANY_ID",
            });
        }
        next();
    };
}

/**
 * Require non-empty string fields on POST/PATCH bodies.
 * @param {string[]} fields
 */
export function requireBodyFields(fields = []) {
    return (req, res, next) => {
        if (!["POST", "PUT", "PATCH"].includes(req.method)) return next();
        const body = req.body || {};
        for (const field of fields) {
            const val = body[field];
            if (val == null || (typeof val === "string" && !val.trim())) {
                return res.status(400).json({
                    error: `${field} is required`,
                    code: "VALIDATION_ERROR",
                });
            }
        }
        next();
    };
}
