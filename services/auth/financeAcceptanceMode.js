/**
 * Finance localhost browser acceptance — opt-in mock auth (loopback + memory only).
 * Never weakens normal Firebase authentication when inactive.
 */
import crypto from "node:crypto";
import { getConfiguredStorageBackend } from "../storage/storageAdapter.js";

export const FINANCE_ACCEPTANCE_TOKEN_PREFIX = "fin-acc-v1.";

/** Dedicated synthetic tenant; must not collide with real company ids. */
export const FINANCE_ACCEPTANCE_TENANT_ID = "finance-accept-local";

export const FINANCE_ACCEPTANCE_UIDS = {
    owner: "finance-accept-owner",
    viewer: "finance-accept-viewer",
};

const ALLOWED_ROLES = new Set(["owner", "viewer", "manager", "finance"]);

function envFlag(name) {
    return String(process.env[name] || "").trim() === "1";
}

export function isRailwayLikeRuntime() {
    return Boolean(
        process.env.RAILWAY_ENVIRONMENT ||
            process.env.RAILWAY_PROJECT_ID ||
            process.env.RAILWAY_SERVICE_ID
    );
}

/**
 * Server-side acceptance mode — all gates must pass (fail closed).
 */
export function isFinanceAcceptanceRuntimeActive() {
    if (!envFlag("FINANCE_ACCEPTANCE_LOOPBACK")) return false;
    if (!envFlag("OPS_SMOKE_MEMORY_ISOLATED")) return false;
    if (String(process.env.STORAGE_BACKEND || "").trim().toLowerCase() !== "memory") return false;
    if (String(process.env.NODE_ENV || "development").trim().toLowerCase() === "production") return false;
    if (isRailwayLikeRuntime()) return false;
    if (!String(process.env.FINANCE_ACCEPTANCE_SECRET || "").trim()) return false;
    const configured = getConfiguredStorageBackend();
    if (configured !== "memory") return false;
    return true;
}

/**
 * @param {import('express').Request} req
 */
export function isLoopbackRequest(req) {
    const remote = req.socket?.remoteAddress || "";
    const forwarded = String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim();
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
    const loopbackRemotes = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    if (!loopbackHosts.has(host)) return false;
    if (forwarded && !loopbackRemotes.has(forwarded)) return false;
    return loopbackRemotes.has(remote);
}

function acceptanceSecret() {
    return String(process.env.FINANCE_ACCEPTANCE_SECRET || "");
}

function signPayload(payloadB64) {
    return crypto.createHmac("sha256", acceptanceSecret()).update(payloadB64).digest("base64url");
}

/**
 * @param {{ uid: string, role: string, companyId: string, exp: number }} payload
 */
export function mintFinanceAcceptanceToken(payload) {
    if (!isFinanceAcceptanceRuntimeActive()) {
        throw Object.assign(new Error("Finance acceptance mode is not active"), { status: 503 });
    }
    const companyId = payload.companyId;
    if (companyId !== FINANCE_ACCEPTANCE_TENANT_ID) {
        throw Object.assign(new Error("Invalid acceptance tenant"), { status: 403, code: "ACCEPTANCE_TENANT_FORBIDDEN" });
    }
    const role = String(payload.role || "").trim().toLowerCase();
    if (!ALLOWED_ROLES.has(role)) {
        throw Object.assign(new Error("Invalid acceptance role"), { status: 400, code: "ACCEPTANCE_ROLE_INVALID" });
    }
    const uid = String(payload.uid || "").trim();
    if (!uid.startsWith("finance-accept-")) {
        throw Object.assign(new Error("Invalid acceptance uid"), { status: 403, code: "ACCEPTANCE_UID_FORBIDDEN" });
    }
    const body = {
        uid,
        role,
        companyId,
        exp: payload.exp,
        v: 1,
    };
    const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
    const sig = signPayload(payloadB64);
    return `${FINANCE_ACCEPTANCE_TOKEN_PREFIX}${payloadB64}.${sig}`;
}

/**
 * @param {import('express').Request} req
 * @param {string} token
 */
export function verifyFinanceAcceptanceToken(req, token) {
    if (!isFinanceAcceptanceRuntimeActive()) return null;
    if (!isLoopbackRequest(req)) return null;
    if (!token.startsWith(FINANCE_ACCEPTANCE_TOKEN_PREFIX)) return null;

    const rest = token.slice(FINANCE_ACCEPTANCE_TOKEN_PREFIX.length);
    const dot = rest.lastIndexOf(".");
    if (dot <= 0) return null;
    const payloadB64 = rest.slice(0, dot);
    const sig = rest.slice(dot + 1);
    if (!payloadB64 || !sig) return null;

    const expected = signPayload(payloadB64);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
    }

    let body;
    try {
        body = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
        return null;
    }

    if (body.companyId !== FINANCE_ACCEPTANCE_TENANT_ID) return null;
    if (!ALLOWED_ROLES.has(String(body.role || "").toLowerCase())) return null;
    if (!String(body.uid || "").startsWith("finance-accept-")) return null;
    if (typeof body.exp === "number" && Date.now() > body.exp) return null;

    const role = String(body.role).toLowerCase();
    const profile = {
        uid: body.uid,
        role,
        companyId: FINANCE_ACCEPTANCE_TENANT_ID,
        email: `${body.uid}@finance-accept.local`,
        fullName: `Finance Accept ${role}`,
        isDemo: false,
    };

    return {
        uid: body.uid,
        email: profile.email,
        role,
        isSuperAdmin: false,
        profile,
        hasBearerToken: true,
        tokenVerified: true,
        financeAcceptance: true,
    };
}
