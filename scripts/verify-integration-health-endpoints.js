#!/usr/bin/env node
/**
 * B-MC-5c-2e-2 — Health / config endpoint hardening verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
    return readFileSync(join(ROOT, relPath), "utf8");
}

function extractRouteBlock(source, method, path) {
    const pattern = new RegExp(
        `app\\.${method}\\(\\s*["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
    );
    const match = pattern.exec(source);
    assert.ok(match, `Missing route: app.${method}("${path}")`);
    return source.slice(match.index, match.index + 700);
}

function extractExportBlock(source, exportName) {
    const pattern = new RegExp(`export function ${exportName}\\(\\)[\\s\\S]{0,400}`, "m");
    const match = pattern.exec(source);
    assert.ok(match, `Missing export: ${exportName}`);
    return match[0];
}

console.log("verify-integration-health-endpoints");

const APP_JS = read("api/app.js");
const SERVER_JS = read("api/server.js");
const INTEGRATION_HUB = read("services/integrations/integrationHub.js");
const AUTH_RATE = read("services/auth/authRateLimiter.js");
const ROUTE_REGISTRY = read("services/api/routeRegistry.js");

// Public liveness — createHealthHandler returns minimal payload
const createHealthBlock = extractExportBlock(APP_JS, "createHealthHandler");
assert.match(createHealthBlock, /publicHealthHandler/);
assert.doesNotMatch(createHealthBlock, /platformHealthHandler/);

const publicHealthSection = APP_JS.slice(
    APP_JS.indexOf("function publicHealthHandler"),
    APP_JS.indexOf("function publicHealthHandler") + 300
);
assert.match(publicHealthSection, /status:\s*"ok"/);
assert.match(publicHealthSection, /timestamp:/);
assert.doesNotMatch(publicHealthSection, /whatsapp:/);
assert.doesNotMatch(publicHealthSection, /storage:/);

console.log("✓ createHealthHandler exposes minimal public liveness only");

// Protected platform health
const platformHealthRoute = extractRouteBlock(APP_JS, "get", "/api/platform/health");
assert.match(platformHealthRoute, /requirePlatformAccess\(\)/);
assert.match(platformHealthRoute, /platformHealthHandler/);

console.log("✓ /api/platform/health requires platform auth and full diagnostics handler");

// Protected admin config
const adminConfigRoute = extractRouteBlock(APP_JS, "get", "/api/admin/config");
assert.match(adminConfigRoute, /requirePlatformAccess\(\)/);

console.log("✓ /api/admin/config requires platform auth");

// Protected integrations health — preserve 5c-2e-1 channels/logs
const integrationsHealthRoute = extractRouteBlock(INTEGRATION_HUB, "get", "/api/integrations/health");
assert.match(integrationsHealthRoute, /requirePlatformAccess\(\)/);

const channelsBlock = extractRouteBlock(INTEGRATION_HUB, "get", "/api/integrations/channels/:companyId");
const logsBlock = extractRouteBlock(INTEGRATION_HUB, "get", "/api/integrations/logs/:companyId");
assert.match(channelsBlock, /requireTenantOrPlatformAccess\(\)/);
assert.match(logsBlock, /requireTenantOrPlatformAccess\(\)/);
assert.doesNotMatch(channelsBlock, /requireTenantScope\(\{\s*optional:\s*true\s*\}\)/);
assert.doesNotMatch(logsBlock, /requireTenantScope\(\{\s*optional:\s*true\s*\}\)/);

console.log("✓ /api/integrations/health protected; 5c-2e-1 channels/logs unchanged");

// Startup behavior preserved in server.js
assert.match(SERVER_JS, /earlyHealthHandler/);
assert.match(SERVER_JS, /status:\s*"starting"/);
assert.match(SERVER_JS, /503/);
assert.match(SERVER_JS, /createHealthHandler/);
assert.match(SERVER_JS, /healthProbeLimit/);
assert.match(SERVER_JS, /authRateLimit\("health-probe"\)/);

console.log("✓ server.js earlyHealthHandler startup chain intact with health-probe rate limit");

assert.match(AUTH_RATE, /"health-probe"/);

console.log("✓ health-probe rate limit profile defined");

// Admin callers migrated
for (const rel of ["js/admin/api.js", "admin/js/admin/api.js"]) {
    const src = read(rel);
    assert.match(src, /fetchHealth\(\)[\s\S]*?\/api\/platform\/health/);
    assert.doesNotMatch(src, /fetchHealth\(\)[\s\S]*?\/api\/health['"]/);
}

console.log("✓ Mission Control fetchHealth targets /api/platform/health");

// isLaxTenantMode no longer fetches /api/admin/config
for (const rel of ["js/auth.js", "app/js/auth.js", "admin/js/auth.js", "marketing/js/auth.js"]) {
    const src = read(rel);
    const laxBlock = src.slice(src.indexOf("export async function isLaxTenantMode"), src.indexOf("export async function isLaxTenantMode") + 400);
    assert.match(laxBlock, /cachedEnforcement = 'lax'/);
    assert.doesNotMatch(laxBlock, /fetch\(/);
}

console.log("✓ isLaxTenantMode uses documented lax default (no anonymous config fetch)");

assert.match(ROUTE_REGISTRY, /\/api\/platform\/health/);
assert.match(ROUTE_REGISTRY, /Public liveness probe/);

console.log("✓ routeRegistry documents public vs protected health routes");

// Optional live probe when API_BASE is set
const apiBase = process.env.API_BASE || process.env.VERIFY_API_BASE || "";
if (apiBase) {
    const base = apiBase.replace(/\/$/, "");
    const publicPaths = ["/health", "/api/health"];
    for (const path of publicPaths) {
        const res = await fetch(`${base}${path}`);
        assert.equal(res.status, 200, `${path} should return 200 when ready`);
        const body = await res.json();
        assert.equal(body.status, "ok");
        assert.ok(body.timestamp);
        assert.equal(Object.keys(body).sort().join(","), "status,timestamp", `${path} must only expose status + timestamp`);
    }

    const protectedPaths = ["/api/platform/health", "/api/admin/config", "/api/integrations/health"];
    for (const path of protectedPaths) {
        const res = await fetch(`${base}${path}`);
        assert.equal(res.status, 401, `${path} unauthenticated should return 401`);
    }

    console.log(`✓ live probes against ${base} passed`);
} else {
    console.log("ℹ set API_BASE or VERIFY_API_BASE for live HTTP probes");
}

console.log("\nAll B-MC-5c-2e-2 static checks passed.");
