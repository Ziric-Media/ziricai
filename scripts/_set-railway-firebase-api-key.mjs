#!/usr/bin/env node
/**
 * Set Railway FIREBASE_API_KEY from the public admin web config (already in client HTML).
 * Usage: node scripts/_set-railway-firebase-api-key.mjs
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "admin/index.html"), "utf8");
const match = html.match(/"apiKey":"([^"]+)"/);
if (!match?.[1]) {
    console.error("Could not read apiKey from admin/index.html");
    process.exit(1);
}

const apiKey = match[1];
const result = spawnSync(
    "npx",
    ["--yes", "@railway/cli", "variables", "set", `FIREBASE_API_KEY=${apiKey}`, "FIREBASE_DATABASE_ID=default"],
    { cwd: root, stdio: "inherit", shell: true }
);

process.exit(result.status ?? 1);
