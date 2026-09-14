#!/usr/bin/env node
/** One-off: disposable tenant with pack installed at 1.0.0 and update pending (no apply). */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { provisionPortal4bDisposableActor } from "./provision-portal-4b-disposable-acceptance-actor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "pack-funeral-ai";
const co = process.env.PORTAL_4C5_UI_COMPANY || `portal-4c5-ui-${Date.now()}`;
const password =
    process.env.PORTAL_4C5_SMOKE_PASSWORD ||
    process.env.PORTAL_4B_SMOKE_PASSWORD ||
    crypto.randomBytes(18).toString("base64url").slice(0, 24);

process.env.STORAGE_BACKEND = "firestore";
process.env.PORTAL_4B_TEST_COMPANY = co;
process.env.PORTAL_4B_SMOKE_PASSWORD = password;

const { publishCuratedPackVersions } = await import("../services/platform/marketplacePackVersionRepository.js");
const { PRODUCTION_WEB_CONFIG } = await import("../js/firebase-config.js");

const actor = await provisionPortal4bDisposableActor({
    companyId: co,
    password,
    companyName: `Portal 4C5 UI ${co}`,
});
await publishCuratedPackVersions([PACK]);

const authRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${PRODUCTION_WEB_CONFIG.apiKey}`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: actor.email, password, returnSecureToken: true }),
    }
);
const auth = await authRes.json();
const token = auth.idToken;

const install = await fetch("https://app.ziricai.com/api/marketplace/install", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: co, packId: PACK }),
});
const installBody = await install.json();
if (install.status !== 201) {
    console.error(install.status, installBody);
    process.exit(1);
}

mkdirSync(join(ROOT, "test-results"), { recursive: true });
const out = join(ROOT, "test-results", "portal-4c5-ui-credentials.json");
writeFileSync(
    out,
    `${JSON.stringify(
        {
            companyId: co,
            ownerEmail: actor.email,
            ownerPassword: password,
            packId: PACK,
            note: "Install-only for browser apply UX; not Central Motors",
        },
        null,
        2
    )}\n`,
    "utf8"
);
console.log(out);
console.log(JSON.stringify({ companyId: co, email: actor.email, install: install.status }));
