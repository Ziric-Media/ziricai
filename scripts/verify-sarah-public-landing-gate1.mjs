#!/usr/bin/env node
/**
 * Gate 1 — Sarah Public Runtime Foundation (A+B+C) — static + unit checks (no deploy).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initSarahTools } from "../services/sarah/tools/index.js";
import { executeTool, getToolsForContext } from "../services/sarah/toolRegistry.js";
import {
    SARAH_PERSONA,
    SARAH_TOOL_POLICY,
    resolveLandingSarahCompanyId,
} from "../services/sarah/sarahPersona.js";
import { assertSarahChatAccess } from "../services/sarah/sarahAuth.js";
import { buildSarahSystemPrompt } from "../services/sarah/prompts/systemPrompt.js";
import { authRateLimit, resetAuthRateLimits } from "../services/auth/authRateLimiter.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
}

function testLandingWireUpSource() {
    const landing = read("js/ziricai-landing.js");
    assert(landing.includes("getSarahChatUrl"), "landing: getSarahChatUrl helper");
    assert(landing.includes("'/api/sarah/chat'") || landing.includes('"/api/sarah/chat"'), "landing: same-origin chat path");
    assert(!/if\s*\(\s*!apiBase\s*\)\s*return\s*null/.test(landing), "landing: must not skip API when apiBase empty");
    assert(landing.includes("SARAH_DEGRADED_INTRO"), "landing: degraded intro constant");
    assert(landing.includes("surface: 'landing'"), "landing: surface landing in POST body");
}

function testApiRouteHardeningSource() {
    const app = read("api/app.js");
    assert(app.includes("assertSarahChatAccess"), "api: assertSarahChatAccess imported");
    assert(app.includes("sarahChatRateLimit"), "api: landing rate limit middleware");
    assert(app.includes('authRateLimit("sarah-landing")'), "api: sarah-landing rate profile");
    assert(app.includes("SARAH_LANDING_MAX_MESSAGE_CHARS"), "api: message length cap");
}

function testPublicReceptionPrompt() {
    const ctx = {
        persona: SARAH_PERSONA.PUBLIC_RECEPTION,
        surface: "landing",
        companyId: resolveLandingSarahCompanyId(),
        companyName: "ZiricAI",
        role: "guest",
    };
    const prompt = buildSarahSystemPrompt({ ...ctx, lastUserMessage: "What is ZiricAI?" });
    assert(prompt.includes("ZiricAI's AI assistant"), "prompt: Sarah identity");
    assert(prompt.includes("PUBLIC_RECEPTION"), "prompt: persona tag");
    assert(prompt.includes("Do not invent prices"), "prompt: no invented pricing");
    assert(prompt.includes("Existing customer"), "prompt: existing customer routing");
}

async function testPublicToolDeny() {
    initSarahTools();
    const ctx = {
        persona: SARAH_PERSONA.PUBLIC_RECEPTION,
        toolPolicy: SARAH_TOOL_POLICY.PUBLIC,
        companyId: resolveLandingSarahCompanyId(),
        canUseTool: () => true,
    };
    const tools = getToolsForContext(ctx).map((t) => t.name);
    assert(tools.length === 2, "public: exactly two tools exposed");
    const denied = await executeTool("viewConversations", ctx, {});
    assert(denied.code === "PUBLIC_TOOL_DENIED", "executeTool blocks tenant inbox on public");
}

async function testLandingAccessBoundaries() {
    const landingId = resolveLandingSarahCompanyId();
    const ok = await assertSarahChatAccess(
        { body: { surface: "landing", companyId: landingId }, headers: {}, query: {} },
        { surface: "landing", companyId: landingId }
    );
    assert(ok.companyId === landingId, "landing company id locked");

    let spoof = false;
    try {
        await assertSarahChatAccess(
            { body: { surface: "landing", companyId: "demo-central-motors" }, headers: {}, query: {} },
            { surface: "landing", companyId: "demo-central-motors" }
        );
    } catch (e) {
        spoof = e.status === 403;
    }
    assert(spoof, "landing wrong tenant denied");
}

function testRateLimitProfile() {
    resetAuthRateLimits();
    let blocked = false;
    const req = { body: { surface: "landing" }, ip: "127.0.0.1", headers: {} };
    const res = {
        status(code) {
            this.code = code;
            return this;
        },
        setHeader() {},
        json(body) {
            if (this.code === 429) blocked = body.code === "RATE_LIMITED";
        },
    };
    const next = () => {};
    const mw = authRateLimit("sarah-landing");
    for (let i = 0; i < 35; i++) mw(req, res, next);
    assert(blocked, "sarah-landing rate limit triggers after max");
}

async function main() {
    const checks = [
        ["A: landing wire-up source", () => testLandingWireUpSource()],
        ["B: API route hardening source", () => testApiRouteHardeningSource()],
        ["B: landing access boundaries", () => testLandingAccessBoundaries()],
        ["B: public tool execution deny", () => testPublicToolDeny()],
        ["B: sarah-landing rate limit", () => testRateLimitProfile()],
        ["C: PUBLIC_RECEPTION system prompt", () => testPublicReceptionPrompt()],
    ];

    let ok = true;
    for (const [name, fn] of checks) {
        try {
            await fn();
            console.log(`PASS: ${name}`);
        } catch (err) {
            ok = false;
            console.error(`FAIL: ${name} — ${err.message}`);
        }
    }

    if (!ok) process.exit(1);
    console.log("\nverify-sarah-public-landing-gate1: PASS");
}

main();
