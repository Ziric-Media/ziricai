#!/usr/bin/env node
/**
 * Upload Firebase Admin credentials + enable Firestore storage on Railway.
 *
 * Usage:
 *   node scripts/_set-railway-firestore-admin.mjs path/to/serviceAccount.json
 *
 * Never commit the service account JSON file.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = process.argv[2];

if (!jsonPath || !existsSync(jsonPath)) {
    console.error(
        "Usage: node scripts/_set-railway-firestore-admin.mjs <serviceAccount.json>"
    );
    console.error(
        "Download from Firebase Console → Project Settings → Service accounts → Generate new private key"
    );
    process.exit(1);
}

const raw = readFileSync(jsonPath, "utf8");

let parsed;

try {
    parsed = JSON.parse(raw);
} catch (err) {
    console.error("Invalid JSON:", err.message);
    process.exit(1);
}

if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    console.error(
        "File does not look like a Firebase service account JSON"
    );
    process.exit(1);
}

const compactJson = JSON.stringify(parsed);
const projectId = parsed.project_id;

console.log(
    `Configuring Railway for Firestore (project: ${projectId}, database: default)...`
);

/*
 * IMPORTANT:
 * Use npx.cmd on Windows and shell:false so the service-account JSON
 * is passed directly to Railway without Windows shell parsing.
 */
const railwayCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const args = [
    "--yes",
    "@railway/cli",
    "variables",
    "set",
    `GOOGLE_APPLICATION_CREDENTIALS_JSON=${compactJson}`,
    "STORAGE_BACKEND=firestore",
    `FIREBASE_PROJECT_ID=${projectId}`,
    "FIREBASE_DATABASE_ID=default",
];

const result = spawnSync(
    railwayCommand,
    args,
    {
        cwd: root,
        stdio: "inherit",
        shell: false,
        env: process.env,
    }
);

if ((result.status ?? 1) !== 0) {
    console.error("Railway variable update failed.");
    process.exit(result.status ?? 1);
}

console.log("\nRailway variables set successfully.");
console.log("Redeploy with:");
console.log("npx @railway/cli up --detach");

console.log("\nThen verify:");
console.log(
    "curl https://ziricai-production.up.railway.app/api/health"
);

console.log(
    '\nExpected: "storage":"firestore", "firestoreAdmin":true, "storageFallback":null'
);