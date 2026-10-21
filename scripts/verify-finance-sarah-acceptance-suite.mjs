#!/usr/bin/env node
/**
 * SF-CORE-01 — local verification bundle (F1–F3 + policy). Optional loopback if :3099 up.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS = [
    "verify-finance-sarah-f1.mjs",
    "verify-finance-sarah-f2.mjs",
    "verify-finance-sarah-f3.mjs",
    "verify-finance-sarah-f3b.mjs",
    "verify-finance-sarah-f4-readiness.mjs",
    "verify-finance-sarah-f5-acceptance.mjs",
    "verify-finance-sarah-tool-policy.mjs",
];

console.log("verify-finance-sarah-acceptance-suite\n");

for (const script of SCRIPTS) {
    console.error(`--- ${script} ---`);
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
        cwd: ROOT,
        stdio: "inherit",
        env: process.env,
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

try {
    const health = await fetch("http://127.0.0.1:3099/api/finance-acceptance/health");
    if (health.ok) {
        console.error("--- verify-finance-sarah-f1-acceptance.mjs (loopback) ---");
        const loop = spawnSync(
            process.execPath,
            [join(ROOT, "scripts", "verify-finance-sarah-f1-acceptance.mjs")],
            { cwd: ROOT, stdio: "inherit", env: process.env }
        );
        if (loop.status !== 0) process.exit(loop.status ?? 1);
    } else {
        console.error("(skip loopback acceptance — finance API not on :3099)");
    }
} catch {
    console.error("(skip loopback acceptance — finance API not on :3099)");
}

console.log("\nFINANCE_SARAH_ACCEPTANCE_SUITE_PASS");
