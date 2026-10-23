#!/usr/bin/env node
/**
 * Phase 2.1 — automated local verification (default HTTP loaders + Phase 1/2 test suite).
 * Browser smoke steps are printed for manual completion.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("verify-automotive-phase2-1-local\n");

const preset = spawnSync(process.execPath, ["scripts/verify-automotive-preset-phase1.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, STORAGE_BACKEND: "memory", INDUSTRY_PRESET_RUNTIME: "1" },
});

if (preset.status !== 0) {
    process.exit(preset.status ?? 1);
}

console.log(`
Manual browser checklist (Company Portal):
1. From repo root worktree: npm run dev:app  (or dev:app on port 3000 with Firebase auth configured)
2. Sign in as a user on a tenant with automotive-dealership preset activated (Settings → Industry preset).
3. Confirm Operate → "Command Centre" nav item is visible; deactivate preset and confirm it hides after refresh/re-login.
4. Open Command Centre — verify KPI cards, financial rows (Unavailable vs 0), bar charts, appointment summary.
5. Apply an invalid date range (from > to) — expect validation message, not a crash.
6. Use Refresh after a failed load — retry works.
7. If you have two companies, switch company context — previous tenant metrics must not flash on screen.

Optional API loopback (no Firebase): finance acceptance server + memory tenant is not wired to Command Centre UI;
use authenticated portal against a dev/staging API with Automotive preset for full UI smoke.
`);

console.log("verify-automotive-phase2-1-local: automated gates OK");
