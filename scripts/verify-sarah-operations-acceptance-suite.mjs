#!/usr/bin/env node
/**
 * Sarah Ops MVP — chained local verification (memory; no deploy).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const STEPS = [
    "verify-sarah-operations-tool-policy.mjs",
    "verify-sarah-operations-tasks-local.mjs",
    "smoke-operations-centre-v1-local.mjs",
    "verify-ai-task-execution-suite.mjs",
];

console.log("verify-sarah-operations-acceptance-suite\n");

let failed = 0;
for (const script of STEPS) {
    console.log(`--- ${script} ---`);
    const args = [join(ROOT, script)];
    if (script.includes("smoke-operations-centre")) {
        args.push("--memory-only");
    }
    const result = spawnSync(node, args, {
        cwd: join(ROOT, ".."),
        stdio: "inherit",
        env: { ...process.env, OPS_SMOKE_MEMORY_ISOLATED: "1", STORAGE_BACKEND: "memory" },
    });
    if (result.status !== 0) {
        failed += 1;
        console.error(`FAILED ${script}\n`);
    }
}

if (failed) {
    console.error(`\nSARAH_OPERATIONS_ACCEPTANCE_SUITE_FAIL (${failed} step(s))`);
    process.exit(1);
}
console.log("\nSARAH_OPERATIONS_ACCEPTANCE_SUITE_PASS");
