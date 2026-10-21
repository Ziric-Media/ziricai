#!/usr/bin/env node
/**
 * Prepare app/ assets and start loopback Finance acceptance API (memory + mock auth).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTANCE_HTML = join(ROOT, "app", "finance-acceptance.html");

const env = {
    ...process.env,
    OPS_SMOKE_MEMORY_ISOLATED: "1",
    STORAGE_BACKEND: "memory",
    FINANCE_ACCEPTANCE_LOOPBACK: "1",
    NODE_ENV: "development",
    BIND_HOST: "127.0.0.1",
    PORT: process.env.FINANCE_ACCEPTANCE_PORT || "3099",
};

function startApi() {
    console.error(`[finance-acceptance] Starting API on http://127.0.0.1:${env.PORT}`);
    console.error(
        `[finance-acceptance] Open http://127.0.0.1:${env.PORT}/app/finance-acceptance.html?seed=1`
    );
    const child = spawn(process.execPath, ["api/server-finance-acceptance.js"], {
        cwd: ROOT,
        env,
        stdio: "inherit",
        shell: false,
    });
    child.on("exit", (c) => process.exit(c ?? 0));
}

const skipPrepare =
    process.env.FINANCE_ACCEPTANCE_SKIP_PREPARE === "1" ||
    process.env.FINANCE_ACCEPTANCE_SKIP_PREPARE === "true";

if (skipPrepare) {
    if (!existsSync(ACCEPTANCE_HTML)) {
        console.error("[finance-acceptance] Missing app/finance-acceptance.html — run prepare-sites or copy app/");
        process.exit(1);
    }
    console.error("[finance-acceptance] Skipping prepare-sites (FINANCE_ACCEPTANCE_SKIP_PREPARE)");
    startApi();
} else {
    console.error("[finance-acceptance] Preparing app/ …");
    const prep = spawn(process.execPath, ["scripts/prepare-sites.js", "app"], {
        cwd: ROOT,
        env,
        stdio: "inherit",
        shell: false,
    });

    prep.on("exit", (code) => {
        if (code !== 0) {
            if (existsSync(ACCEPTANCE_HTML)) {
                console.error(
                    "[finance-acceptance] prepare-sites failed (often OneDrive file lock) — using existing app/ for local dev"
                );
                startApi();
                return;
            }
            process.exit(code ?? 1);
        }
        startApi();
    });
}
