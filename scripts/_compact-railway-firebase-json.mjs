#!/usr/bin/env node
/**
 * Repair Railway Firestore credentials (compact JSON + split key vars).
 *
 * Step 1 — export from Railway env (reads full multiline JSON):
 *   npx @railway/cli run node scripts/_compact-railway-firebase-json.mjs --export
 *
 * Step 2 — upload to Railway (do NOT nest inside railway run):
 *   node scripts/_compact-railway-firebase-json.mjs --apply
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stagingPath = join(root, ".railway-sa-repair.json");
const mode = process.argv[2];
const railwayCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const serviceFlag = ["-s", "ziricai"];

function runRailway(args, input) {
    const result = spawnSync(railwayCommand, ["--yes", "@railway/cli", "variable", "set", ...args], {
        cwd: root,
        stdio: ["pipe", "inherit", "inherit"],
        shell: false,
        env: process.env,
        input,
    });
    return result.status ?? 1;
}

if (mode === "--export") {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!raw) {
        console.error("Run via: npx @railway/cli run node scripts/_compact-railway-firebase-json.mjs --export");
        process.exit(1);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.error("JSON parse failed:", err.message, `(len=${raw.length}, lines=${raw.split("\n").length})`);
        process.exit(1);
    }
    writeFileSync(stagingPath, JSON.stringify(parsed), "utf8");
    console.log(`Exported compact service account staging file (${JSON.stringify(parsed).length} bytes).`);
    console.log("Next: node scripts/_compact-railway-firebase-json.mjs --apply");
    process.exit(0);
}

if (mode === "--apply") {
    if (!existsSync(stagingPath)) {
        console.error("Missing staging file. Run --export first.");
        process.exit(1);
    }
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(stagingPath, "utf8"));
    } catch (err) {
        console.error("Staging file parse failed:", err.message);
        process.exit(1);
    }

    const compactJson = JSON.stringify(parsed);
    console.log(`Applying Railway Firestore repair (project=${parsed.project_id}, db=default)...`);

    let status = runRailway(["GOOGLE_APPLICATION_CREDENTIALS_JSON", "--stdin", ...serviceFlag], compactJson);
    if (status !== 0) process.exit(status);

    status = runRailway(["FIREBASE_PRIVATE_KEY", "--stdin", ...serviceFlag], parsed.private_key);
    if (status !== 0) process.exit(status);

    status = spawnSync(
        railwayCommand,
        [
            "--yes",
            "@railway/cli",
            "variable",
            "set",
            "STORAGE_BACKEND=firestore",
            `FIREBASE_PROJECT_ID=${parsed.project_id}`,
            "FIREBASE_DATABASE_ID=default",
            `FIREBASE_CLIENT_EMAIL=${parsed.client_email}`,
            ...serviceFlag,
        ],
        { cwd: root, stdio: "inherit", shell: false, env: process.env }
    ).status ?? 1;
    if (status !== 0) process.exit(status);

    unlinkSync(stagingPath);
    console.log("\nVariables updated. Redeploying...");
    const redeploy = spawnSync(
        railwayCommand,
        ["--yes", "@railway/cli", "redeploy", "--yes"],
        { cwd: root, stdio: "inherit", shell: false, env: process.env }
    );
    process.exit(redeploy.status ?? 0);
}

console.error("Usage: --export (via railway run) then --apply (standalone)");
process.exit(1);
