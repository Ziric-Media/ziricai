#!/usr/bin/env node
/** @deprecated — use scripts/pay-02-checkout-verify.mjs (includes RS06 + PAY-02E). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [path.join(root, "scripts/pay-02-checkout-verify.mjs")], {
    stdio: "inherit",
    cwd: root,
});
process.exit(r.status ?? 1);
