/**
 * Platform route protection — superadmin session OR PLATFORM_API_KEY header.
 */
import { resolveAuthFromRequest } from "./authService.js";
import { auditLog } from "../audit/auditLog.js";

function getPlatformKey() {
    return process.env.PLATFORM_API_KEY || "";
}

function extractApiKey(req) {
    const platformKey = getPlatformKey();
    const headers = req?.headers || {};
    const header = headers["x-platform-api-key"] || headers["x-api-key"];
    if (header) return String(header).trim();
    const auth = headers.authorization;
    if (auth?.startsWith("Bearer ")) {
        const token = auth.slice(7).trim();
        if (token && platformKey && token === platformKey) return token;
    }
    return null;
}

/** True when request carries a valid PLATFORM_API_KEY (always enforced, independent of tenant lax/strict). */
export function hasPlatformApiKeyAccess(req) {
    const platformKey = getPlatformKey();
    const apiKey = extractApiKey(req);
    return Boolean(platformKey && apiKey === platformKey);
}

/**
 * Allow superadmin Firebase auth OR matching PLATFORM_API_KEY.
 * Always enforced regardless of TENANT_SCOPE_ENFORCEMENT=lax.
 */
export function requirePlatformAccess() {
    return async (req, res, next) => {
        try {
            const apiKey = extractApiKey(req);
            const platformKey = getPlatformKey();
            if (platformKey && apiKey === platformKey) {
                req.platformAuth = { via: "api_key" };
                return next();
            }

            const auth = await resolveAuthFromRequest(req);
            if (auth.isSuperAdmin && auth.uid) {
                req.platformAuth = { via: "superadmin", uid: auth.uid };
                return next();
            }

            auditLog("platform_access_denied", {
                path: req.path,
                method: req.method,
                uid: auth.uid || null,
            });

            const status = auth.uid ? 403 : 401;
            return res.status(status).json({
                error: status === 401 ? "Authentication required" : "Super Admin or platform API key required",
                code: status === 401 ? "UNAUTHORIZED" : "PLATFORM_FORBIDDEN",
            });
        } catch (err) {
            console.error("[platformAuth]", err.message);
            res.status(500).json({ error: "Platform auth check failed" });
        }
    };
}
