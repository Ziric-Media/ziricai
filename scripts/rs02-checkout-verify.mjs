#!/usr/bin/env node
/**
 * Run all RS02 checkout verification tests (no live payment APIs).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tests = [
    "test/rs02-consumer-checkout.test.mjs",
    "test/rs02-paystack-checkout.test.mjs",
    "test/rs02-stripe-checkout.test.mjs",
    "test/rs02-checkout-hardening.test.mjs",
    "test/rs02-checkout-webhook-security.test.mjs",
    "test/rs02-payment-refund.test.mjs",
];

let failed = 0;
for (const t of tests) {
    const r = spawnSync(process.execPath, [path.join(root, t)], { stdio: "inherit", cwd: root });
    if (r.status !== 0) failed += 1;
}
if (failed) {
    console.error(`rs02-checkout-verify: ${failed} failed`);
    process.exit(1);
}
console.log("rs02-checkout-verify: all passed");
